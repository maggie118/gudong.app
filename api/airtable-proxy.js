// /api/airtable-proxy.js
// Vercel Serverless Function - Airtable read-only proxy
// Env vars:
//   Required: AIRTABLE_BASE_ID / AIRTABLE_TABLE / AIRTABLE_TOKEN
//   Optional: AIRTABLE_SELLERS_TABLE (e.g. sellers)
//             AIRTABLE_INTEL_TABLE   (e.g. Intel; manual override only)
//             AIRTABLE_DEBUG_KEY     (debug key)
//
// 2026-09-25 v4
//  - Auto intel generation from antiques data (new / drop / collector / compare)
//  - Manual override via Intel table (platform / any type)
//  - All Chinese strings encoded as \uXXXX escapes to avoid encoding issues.
//  - FIXED: English prefix bug �� auto intel "en" fields now use English prefixes
//           instead of Chinese ones (PIN_EN + PREFIX_EN_* added).
//
// 2026-10-05 v5
//  - CORS ���£�����������Դ���� file:// �� localhost����
//    ���ڱ���Ԥ���뿪�����ԡ�����ֻ�� API�����ݱ����ǹ����ġ�
//
// 2026-11-01 v6 (snapshot-first)
//  - ��ֻ���ļ��� proxy: �� Airtable API ��Ϊ��ȡ Vercel build ʱ���ɵ� data/listings.json��
//    ��ǰ�ˡ�proxy ���Ƕ���ʱ�� Airtable ��Ϊ 0 �Ρ�
//  - ���� q(����)/cat(����) ���ˣ�debug ��Ϊ�����ļ�ժҪ��

import fs from 'fs';
import path from 'path';

const BASE           = process.env.AIRTABLE_BASE_ID;
const TABLE          = process.env.AIRTABLE_TABLE;
const TOKEN          = process.env.AIRTABLE_TOKEN;
const SELLERS_TABLE  = process.env.AIRTABLE_SELLERS_TABLE;
const INTEL_TABLE    = process.env.AIRTABLE_INTEL_TABLE;
const DEBUG_KEY      = process.env.AIRTABLE_DEBUG_KEY;

const PUBLIC_STATUSES = ['active'];

const PUBLIC_FIELDS = [
  'title_zh', 'title_en', 'desc_zh', 'desc_en', 'description_zh', 'description_en', 'era_zh', 'era_en', 'category',
  'material_zh', 'material_en', 'kiln_zh', 'kiln_en', 'mark_zh', 'mark_en', 'certificate_no', 'tags',
  'dimensions', 'weight', 'condition_zh', 'condition_en', 'has_surface_wear', 'has_surface_damage',
  'price_type', 'fixed_price', 'price_zh', 'price_en', 'price_display_zh', 'price_display_en',
  'img_file',
  'seller_id',
  'is_today_finds', 'is_editor_picks', 'is_new_listing', 'status',
  'reason_zh', 'reason_en', 'listed_at',
  'previous_price', 'reference_price',
];

const HYPHEN_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g;
function normHyphen(v) {
  if (typeof v !== 'string') return v;
  return v.replace(HYPHEN_VARIANTS, '-').trim();
}

// wa_username: WhatsApp 用户名（wa.me/<username>）；卖家没填用户名时输出 wa_phone（wa.me/<phone>）。
// 注意：email 仍不暴露；手机号仅在卖家没填用户名时以 wa_phone 输出（供前端 wa.me 直连）。
const SELLER_PUBLIC_FIELDS = ['seller_id', 'display_zh', 'display_en', 'since_year', 'intro_zh', 'intro_en', 'page_url', 'wa_username'];

// WhatsApp 用户名的候选字段名（Airtable 里命名可能不一致，逐一兜底）
const WA_USERNAME_KEYS = [
  'wa_username', 'waUsername', 'WA_Username',
  'whatsapp_username', 'whatsappUsername', 'WhatsApp Username', 'WhatsApp username',
  'whatsapp_user', 'wa_user', 'waUser', 'wa_name',
];

// 从卖家原始字段里挑出 WhatsApp 用户名，统一以 wa_username 输出。
// 兜底：若填在 whatsapp 字段里且不是纯电话号码（含字母/下划线），也按用户名处理。
function pickWaUsername(f) {
  if (!f) return null;
  for (const k of WA_USERNAME_KEYS) {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/^@/, '');
    if (Array.isArray(v) && v.length && typeof v[0] === 'string' && v[0].trim()) {
      return v[0].trim().replace(/^@/, '');
    }
  }
  const PHONE_ISH = /^[+\d\s()\-]+$/;
  // 模糊兜底：字段名以 wa / whatsapp 开头，且值不是纯电话号码
  for (const k of Object.keys(f)) {
    if (!/^(wa|whats_?app)/i.test(k)) continue;
    const v = f[k];
    if (typeof v === 'string' && v.trim() && !PHONE_ISH.test(v.trim())) {
      return v.trim().replace(/^@/, '');
    }
  }
  // 最后：填在 whatsapp 字段里且不是纯电话号码的，也按用户名处理
  for (const k of ['whatsapp', 'whatsapp_phone', 'WhatsApp']) {
    const v = f[k];
    if (typeof v === 'string' && v.trim() && !PHONE_ISH.test(v.trim())) {
      return v.trim().replace(/^@/, '');
    }
  }
  return null;
}

// WhatsApp 手机号候选字段（卖家只填了号码、没填用户名时，输出 wa_phone 供前端 wa.me 直连）
const WA_PHONE_KEYS = [
  'wa_phone', 'waPhone', 'WA_Phone',
  'whatsapp_phone', 'whatsappPhone', 'WhatsApp Phone', 'WhatsApp phone',
  'whatsapp_number', 'whatsappNumber', 'WhatsApp Number', 'WhatsApp number',
  'phone', 'Phone', 'mobile', 'Mobile',
];
const WA_PHONE_RE = /^[+\d\s()\-]+$/;
function pickWaPhone(f) {
  if (!f) return null;
  const val = (k) => {
    const v = f[k];
    const s = typeof v === 'string' ? v.trim() : (Array.isArray(v) && typeof v[0] === 'string' ? v[0].trim() : '');
    return s;
  };
  for (const k of WA_PHONE_KEYS) {
    const s = val(k);
    if (s && WA_PHONE_RE.test(s.replace(/[\s\-().]/g, ''))) return s;
  }
  // 模糊兜底：wa / whatsapp 开头的字段里，值是纯号码样式的（含把号码填进用户名字段的情况）
  for (const k of Object.keys(f)) {
    if (!/^(wa|whats_?app)/i.test(k)) continue;
    const s = val(k);
    if (s && WA_PHONE_RE.test(s.replace(/[\s\-().]/g, ''))) return s;
  }
  return null;
}

const INTEL_PUBLIC_FIELDS = ['type', 'text_zh', 'text_en', 'meta_zh', 'meta_en', 'publish_date', 'active'];

const INTEL_TYPES = ['new', 'drop', 'compare', 'collector', 'platform'];

// ---------- Category names (unicode-escaped) ----------
const CAT_PORCELAIN = '\u74f7\u5668';           // ����
const CAT_JADE      = '\u7389\u5668';           // ����
const CAT_COINS     = '\u94b1\u5e01';           // Ǯ��
const CAT_BRONZE    = '\u94dc\u5668';
const CAT_PAINTINGS = '\u4e66\u753b';           // �黭
const CAT_MISC      = '\u6742\u9879';           // ����

const CAT_EN = {
  [CAT_PORCELAIN]: 'porcelain',
  [CAT_JADE]:      'jade',
  [CAT_BRONZE]:    'bronzes',
  [CAT_COINS]:     'coins',
  [CAT_PAINTINGS]: 'paintings',
  [CAT_MISC]:      'miscellaneous',
};

// ---------- Reusable prefixes ----------
const PIN    = '\uD83D\uDCCC ';   // ?? (Pushpin) for Chinese
const PIN_EN = '\uD83D\uDCCD ';   // ?? (Round Pushpin) for English

// Chinese prefixes
const PREFIX_NEW       = PIN + '\u65b0\u4e0a\u67b6\uff1a';             // ?? ���ϼܣ�
const PREFIX_DROP      = PIN + '\u964d\u4ef7\u4fe1\u53f7\uff1a';       // ?? �����źţ�
const PREFIX_COLLECTOR = PIN + '\u85cf\u5bb6\u52a8\u6001\uff1a';       // ?? �ؼҶ�̬��
const PREFIX_COMPARE   = PIN + '\u540c\u7c7b\u5bf9\u6bd4\uff1a';       // ?? ͬ��Աȣ�
const PREFIX_PLATFORM  = PIN + '\u5e73\u53f0\u5feb\u8baf\uff1a';       // ?? ƽ̨��Ѷ��

// English prefixes
const PREFIX_EN_NEW       = PIN_EN + 'New arrivals: ';
const PREFIX_EN_DROP      = PIN_EN + 'Price drop: ';
const PREFIX_EN_COLLECTOR = PIN_EN + 'Collector activity: ';
const PREFIX_EN_COMPARE   = PIN_EN + 'Comparable: ';
const PREFIX_EN_PLATFORM  = PIN_EN + 'Platform note: ';

// Meta labels
const META_TODAY       = '\u5e73\u53f0\u6570\u636e \u00b7 \u4eca\u65e5';      // ƽ̨���� �� ����
const META_7D          = '\u5e02\u573a\u5feb\u7167 \u00b7 7 \u5929';        // �г����� �� 7 ��
const META_WEEK        = '\u85cf\u5bb6\u52a8\u6001 \u00b7 \u672c\u5468';      // �ؼҶ�̬ �� ����
const META_COMPARE     = '\u540c\u7c7b\u53c2\u7167 \u00b7 \u4ec5\u4f9b\u53c2\u8003';  // ͬ����� �� �����ο�
const META_PLATFORM    = '\u5e73\u53f0\u516c\u544a';                  // ƽ̨����
const META_EN_TODAY    = 'Platform data \u00b7 today';
const META_EN_7D       = 'Market snapshot \u00b7 7 days';
const META_EN_WEEK     = 'Collector activity \u00b7 this week';
const META_EN_COMPARE  = 'Comparable reference \u00b7 for reference only';
const META_EN_PLATFORM = 'Platform notice';

// ---------- Sanitize items ----------
function toPublicItems(rawRecords) {
  return rawRecords
    .filter(rec => PUBLIC_STATUSES.includes(String((rec.fields && rec.fields.status) || '').trim().toLowerCase()))
    .map(rec => {
      const out = {
        item_id: normHyphen((rec.fields && rec.fields.item_id) || rec.id),
        _createdTime: rec.createdTime,
      };
      for (const k of PUBLIC_FIELDS) {
        if (rec.fields[k] !== undefined && rec.fields[k] !== null && rec.fields[k] !== '') out[k] = rec.fields[k];
      }
      if (out.seller_id) out.seller_id = normHyphen(out.seller_id);
      if (out.img_file)  out.img_file  = normHyphen(out.img_file);
      return out;
    })
    .sort((a, b) => String(b._createdTime || '').localeCompare(String(a._createdTime || '')));
}

function toPublicSellers(rawRecords) {
  return rawRecords
    .filter(rec => PUBLIC_STATUSES.includes(String((rec.fields && rec.fields.status) || '').trim().toLowerCase()))
    .map(rec => {
      const out = {};
      for (const k of SELLER_PUBLIC_FIELDS) {
        if (rec.fields[k] !== undefined && rec.fields[k] !== null && rec.fields[k] !== '') out[k] = rec.fields[k];
      }
      if (!out.wa_username) {
        const wa = pickWaUsername(rec.fields);
        if (wa) {
          out.wa_username = wa;
        } else {
          // 用户名缺失 → 输出 WhatsApp 手机号（wa_phone），前端用它连 wa.me
          const p = pickWaPhone(rec.fields);
          if (p) out.wa_phone = p;
        }
      }
      if (out.seller_id) out.seller_id = normHyphen(out.seller_id);
      return out;
    })
    .filter(s => s.seller_id && (s.display_zh || s.display_en));
}

function toPublicIntel(rawRecords) {
  return rawRecords
    .filter(rec => {
      const f = rec.fields || {};
      const active = f.active === true || String(f.active).toLowerCase() === 'true' || String(f.active) === '1';
      return active && (f.text_zh || f.text_en);
    })
    .map(rec => {
      const f = rec.fields || {};
      const rawType = String(f.type || '').trim().toLowerCase();
      const type = INTEL_TYPES.includes(rawType) ? rawType : 'platform';
      return {
        type,
        zh: f.text_zh || f.text_en || '',
        en: f.text_en || f.text_zh || '',
        meta: f.meta_zh || '\u7f16\u8f91\u6574\u7406',
        metaEn: f.meta_en || 'Editorial',
        _sort: f.publish_date || rec.createdTime || '',
      };
    })
    .sort((a, b) => String(b._sort || '').localeCompare(String(a._sort || '')))
    .map(({ _sort, ...rest }) => rest);
}

// ---------- Category normalization ----------
function normCat(c) {
  const v = String(c == null ? '' : c).trim().toLowerCase();
  if (/\u74f7|porcelain|ceramic/.test(v)) return CAT_PORCELAIN;
  if (/\u7389|jade/.test(v)) return CAT_JADE;
  if (/\u94dc|bronze/.test(v)) return CAT_BRONZE;
  if (/\u5e01|\u94b1|coin|numismat/.test(v)) return CAT_COINS;
  if (/\u753b|\u4e66\u6cd5|painting|calligraph/.test(v)) return CAT_PAINTINGS;
  return CAT_MISC;
}

// ---------- Auto intel generation ----------
function buildAutoIntel(items) {
  const now = Date.now();
  const DAY = 86400000;
  const WEEK = 7 * DAY;
  const todayStr = new Date(now).toISOString().slice(0, 10);

  const auto = [];

  // (1) new
  const newToday = items.filter(f => String(f.listed_at || '').startsWith(todayStr));
  if (newToday.length > 0) {
    const catCounts = {};
    newToday.forEach(f => {
      const c = normCat(f.category);
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
    const topCatEn = topCat ? (CAT_EN[topCat[0]] || 'items') : '';
    auto.push({
      type: 'new',
      zh: PREFIX_NEW + '\u4eca\u65e5\u5df2\u6709 ' + newToday.length + ' \u4ef6\u65b0\u85cf\u54c1\u8fdb\u5165' +
          (topCat ? '\uff0c' + topCat[0] + '\u5360 ' + topCat[1] + ' \u4ef6\u3002' : '\u3002'),
      en: PREFIX_EN_NEW + newToday.length + ' new items today' +
          (topCat ? ', ' + topCat[1] + ' in ' + topCatEn : '') + '.',
      meta: META_TODAY,
      metaEn: META_EN_TODAY,
    });
  }

  // (2) drop
  const dropped = items.filter(f => {
    const prev = Number(f.previous_price);
    const nowP = Number(f.fixed_price);
    return isFinite(prev) && isFinite(nowP) && prev > 0 && nowP > 0 && prev > nowP;
  });
  if (dropped.length > 0) {
    const cuts = dropped.map(f => {
      const prev = Number(f.previous_price);
      const nowP = Number(f.fixed_price);
      return (prev - nowP) / prev;
    });
    const avgPct = Math.round(cuts.reduce((a, b) => a + b, 0) / cuts.length * 100);
    auto.push({
      type: 'drop',
      zh: PREFIX_DROP + '\u8fd1 7 \u5929\u6709 ' + dropped.length + ' \u4ef6\u4e0b\u8c03\u4ef7\u683c\uff0c\u5e73\u5747\u964d\u5e45\u7ea6 ' + avgPct + '%\uff0c\u53ef\u7559\u610f\u8bae\u4ef7\u7a7a\u95f4\u3002',
      en: PREFIX_EN_DROP + dropped.length + ' item' + (dropped.length > 1 ? 's' : '') +
          ' reduced in the last 7 days, avg. cut ~' + avgPct + '% \u2014 room to negotiate.',
      meta: META_7D,
      metaEn: META_EN_7D,
    });
  }

  // (3) collector
  const weekAgo = now - WEEK;
  const recent = items.filter(f => {
    const t = new Date(f.listed_at || f._createdTime || 0).getTime();
    return isFinite(t) && t >= weekAgo;
  });
  const bySeller = {};
  recent.forEach(f => {
    if (!f.seller_id) return;
    bySeller[f.seller_id] = bySeller[f.seller_id] || [];
    bySeller[f.seller_id].push(f);
  });
  const topSeller = Object.entries(bySeller).sort((a, b) => b[1].length - a[1].length)[0];
  if (topSeller && topSeller[1].length >= 2) {
    const [sellerId, list] = topSeller;
    const catCounts = {};
    list.forEach(f => {
      const c = normCat(f.category);
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
    const catZh = topCat ? topCat[0] : CAT_MISC;
    const catEn = topCat ? (CAT_EN[topCat[0]] || 'items') : 'items';
    auto.push({
      type: 'collector',
      zh: PREFIX_COLLECTOR + '\u672c\u5468 ' + sellerId + ' \u96c6\u4e2d\u4e0a\u67b6 ' + list.length + ' \u4ef6' + catZh + '\uff0c\u53ef\u7559\u610f\u3002',
      en: PREFIX_EN_COLLECTOR + sellerId + ' listed ' + list.length + ' ' + catEn + ' this week \u2014 worth a look.',
      meta: META_WEEK,
      metaEn: META_EN_WEEK,
    });
  }

  // (4) compare
  const withPrice = items.filter(f => Number(f.fixed_price) > 0);
  const byCat = {};
  withPrice.forEach(f => {
    const c = normCat(f.category);
    byCat[c] = byCat[c] || [];
    byCat[c].push(f);
  });
  let bestPair = null;
  Object.entries(byCat).forEach(([cat, list]) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => Number(a.fixed_price) - Number(b.fixed_price));
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    const diff = (Number(high.fixed_price) - Number(low.fixed_price)) / Number(high.fixed_price);
    if (!bestPair || diff > bestPair.diff) {
      bestPair = { cat, low, high, diff };
    }
  });

  if (bestPair && bestPair.diff > 0.2) {
    const { low, high } = bestPair;
    const lowPrice = Number(low.fixed_price).toLocaleString('en-SG');
    const highPrice = Number(high.fixed_price).toLocaleString('en-SG');
    const pct = Math.round(bestPair.diff * 100);
    auto.push({
      type: 'compare',
      zh: PREFIX_COMPARE + '\u540c\u4e3a' + bestPair.cat + '\uff0c\u4e00\u4ef6\u6807\u4ef7 S$' + lowPrice +
          '\uff0c\u53e6\u4e00\u4ef6 S$' + highPrice + '\uff0c\u4ef7\u5dee\u7ea6 ' + pct + '%\u3002',
      en: PREFIX_EN_COMPARE + 'within ' + bestPair.cat + ', one listed at S$' + lowPrice +
          ' vs S$' + highPrice + ' \u2014 spread ~' + pct + '%.',
      meta: META_COMPARE,
      metaEn: META_EN_COMPARE,
    });
  }

  return auto;
}

// ---------- Merge auto + manual ----------
function mergeIntel(autoIntel, manualIntel) {
  const manualByType = {};
  (manualIntel || []).forEach(it => {
    if (!manualByType[it.type]) manualByType[it.type] = it;
  });
  const order = ['new', 'drop', 'collector', 'compare', 'platform'];
  const result = [];
  order.forEach(t => {
    if (manualByType[t]) {
      result.push(manualByType[t]);
    } else {
      const auto = autoIntel.find(a => a.type === t);
      if (auto) result.push(auto);
    }
  });
  if (!result.find(r => r.type === 'platform')) {
    result.push({
      type: 'platform',
      zh: PREFIX_PLATFORM + '\u521b\u59cb\u85cf\u5bb6\u62db\u52df\u8fdb\u884c\u4e2d\uff0c\u9650\u91cf 18 \u5e2d\u514d\u8d39\u5165\u9a7b\uff0c\u524d 2 \u4ef6\u85cf\u54c1\u514d\u8d39\u520a\u767b\u3002',
      en: PREFIX_EN_PLATFORM + 'Founding Collector seats are open \u2014 limited to 18, join free, first 2 listings free.',
      meta: META_PLATFORM,
      metaEn: META_EN_PLATFORM,
    });
  }
  return result;
}

// ---------- Debug report ----------
function pageOfCategory(c) {
  const v = String(c == null ? '' : c).trim().toLowerCase();
  const exact = {
    [CAT_PORCELAIN]: CAT_PORCELAIN,
    [CAT_JADE]: CAT_JADE,
    [CAT_COINS]: CAT_COINS,
    [CAT_PAINTINGS]: CAT_PAINTINGS,
    [CAT_MISC]: CAT_MISC,
    porcelain: CAT_PORCELAIN, jade: CAT_JADE,
    coins: CAT_COINS, coin: CAT_COINS,
    paintings: CAT_PAINTINGS, painting: CAT_PAINTINGS, calligraphy: CAT_PAINTINGS,
    misc: CAT_MISC, miscellaneous: CAT_MISC, other: CAT_MISC,
  };
  if (exact[v]) return { page: exact[v], standard: true };
  if (/\u74f7|porcelain|ceramic/.test(v)) return { page: CAT_PORCELAIN, standard: false };
  if (/\u7389|jade/.test(v)) return { page: CAT_JADE, standard: false };
  if (/\u94dc|bronze/.test(v)) return { page: CAT_BRONZE, standard: false };
  if (/\u5e01|\u94b1|coin|numismat/.test(v)) return { page: CAT_COINS, standard: false };
  if (/\u753b|\u4e66\u6cd5|painting|calligraph/.test(v)) return { page: CAT_PAINTINGS, standard: false };
  return { page: CAT_MISC, standard: false };
}

// ---------- Snapshot file read (v6, snapshot-first) ----------
// �Ķ� Vercel build ʱ�� refresh-listings.js ���ɵ� data/listings.json��
// ��ȫ���������⣺�� 0 �� Airtable ���á����ɹ���ϳ��ö��·������
function readSnapshot() {
  const candidates = [
    path.join(process.cwd(), 'data', 'listings.json'),
    path.join(__dirname, '..', 'data', 'listings.json'),
    path.join(__dirname, 'data', 'listings.json'),
    'data/listings.json',
    './data/listings.json',
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const j = JSON.parse(raw);
      if (j && Array.isArray(j.newListing)) return { ok: true, data: j, file: p };
    } catch (e) { /* try next candidate */ }
  }
  return { ok: false, error: 'data/listings.json not found in function runtime' };
}

// ---------- Handler ----------
export default async function handler(req, res) {
  // ============================================================
  // CORS ���� ����ֻ�� API������������Դ���� file:// �� localhost��
  // ============================================================
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!BASE || !TABLE || !TOKEN) {
    console.error('[proxy] env missing', { AIRTABLE_BASE_ID: !!BASE, AIRTABLE_TABLE: !!TABLE, AIRTABLE_TOKEN: !!TOKEN });
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  if (DEBUG_KEY && req.query.debug && String(req.query.debug) === DEBUG_KEY) {
    const snap = readSnapshot();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (!snap.ok) return res.status(502).json({ error: 'Snapshot not found', detail: snap.error });
    const d = snap.data || {};
    return res.status(200).json({
      generated_at: new Date().toISOString(),
      source: 'data/listings.json (static snapshot, 0 Airtable)',
      summary: {
        new_listing: Array.isArray(d.newListing) ? d.newListing.length : 0,
        today_finds: Array.isArray(d.todayFinds) ? d.todayFinds.length : 0,
        editor_picks: Array.isArray(d.editorPicks) ? d.editorPicks.length : 0,
        sellers: Array.isArray(d.sellers) ? d.sellers.length : 0,
        intel: Array.isArray(d.intel) ? d.intel.length : 0,
        total: Number(d.total) || 0,
      },
      keys: Object.keys(d),
      file: snap.file,
    });
  }

  const q   = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
  const cat = String(req.query.cat || 'all').trim();

  try {
    const snap = readSnapshot();
    if (!snap.ok) throw new Error(snap.error || 'snapshot missing');
    const base = snap.data || {};
    const all = Array.isArray(base.newListing) ? base.newListing : [];
    let items = all;

    if (q) {
      items = items.filter(f => [
        f.title_zh, f.title_en, f.desc_zh, f.desc_en, f.era_zh, f.era_en, f.category,
        f.material_zh, f.material_en, f.kiln_zh, f.kiln_en, f.mark_zh, f.mark_en,
        f.certificate_no, f.tags,
      ].filter(Boolean).join(' ').toLowerCase().includes(q));
    }

    const resolvedCat = cat !== 'all' ? pageOfCategory(cat) : null;
    if (resolvedCat && resolvedCat.standard) {
      const target = resolvedCat.page;
      items = items.filter(f => pageOfCategory(f.category).page === target);
    }

    // 有筛选时重新派生 today/editor；无筛选时直接返回快照里的现成数组（更省）
    const filtered = !!(q || cat !== 'all');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      todayFinds:  filtered ? items.filter(f => f.is_today_finds) : (Array.isArray(base.todayFinds) ? base.todayFinds : []),
      editorPicks: filtered ? items.filter(f => f.is_editor_picks) : (Array.isArray(base.editorPicks) ? base.editorPicks : []),
      newListing:  items,
      sellers:     Array.isArray(base.sellers) ? base.sellers : [],
      intel:       Array.isArray(base.intel) ? base.intel : [],
      founderCount: base.founderCount || 0,
      total:       items.length,
    });

  } catch (e) {
    console.error('[airtable-proxy][snapshot]', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Upstream failed', detail: e.message });
  }
}
