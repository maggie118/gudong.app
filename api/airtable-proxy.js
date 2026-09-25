// /api/airtable-proxy.js
// Vercel Serverless Function - Airtable read-only proxy
// Env vars:
//   Required: AIRTABLE_BASE_ID / AIRTABLE_TABLE / AIRTABLE_TOKEN
//   Optional: AIRTABLE_SELLERS_TABLE (e.g. sellers)
//             AIRTABLE_INTEL_TABLE   (e.g. Intel; manual override only)
//             AIRTABLE_DEBUG_KEY     (debug key)
//
// 2026-09-25 v3
//  - Auto intel generation from antiques data (new / drop / collector / compare)
//  - Manual override via Intel table (platform / any type)
//  - All Chinese strings encoded as \uXXXX escapes to avoid encoding issues.

const BASE           = process.env.AIRTABLE_BASE_ID;
const TABLE          = process.env.AIRTABLE_TABLE;
const TOKEN          = process.env.AIRTABLE_TOKEN;
const SELLERS_TABLE  = process.env.AIRTABLE_SELLERS_TABLE;
const INTEL_TABLE    = process.env.AIRTABLE_INTEL_TABLE;
const DEBUG_KEY      = process.env.AIRTABLE_DEBUG_KEY;

const PUBLIC_STATUSES = ['active'];

const PUBLIC_FIELDS = [
  'title_zh', 'title_en', 'desc_zh', 'desc_en', 'era_zh', 'era_en', 'category',
  'material_zh', 'material_en', 'kiln_zh', 'kiln_en', 'mark_zh', 'mark_en', 'certificate_no', 'tags',
  'dimensions', 'weight', 'condition_zh', 'condition_en', 'has_surface_wear', 'has_surface_damage',
  'price_type', 'fixed_price', 'price_zh', 'price_en', 'price_display_zh', 'price_display_en',
  'img_file',
  'seller_id', 'seller_whatsapp',
  'is_today_finds', 'is_editor_picks', 'is_new_listing', 'status',
  'reason_zh', 'reason_en', 'listed_at',
  'previous_price',
];

const HYPHEN_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g;
function normHyphen(v) {
  if (typeof v !== 'string') return v;
  return v.replace(HYPHEN_VARIANTS, '-').trim();
}

const SELLER_PUBLIC_FIELDS = ['seller_id', 'display_zh', 'display_en', 'since_year', 'intro_zh', 'intro_en', 'page_url'];

const INTEL_PUBLIC_FIELDS = ['type', 'text_zh', 'text_en', 'meta_zh', 'meta_en', 'publish_date', 'active'];

const INTEL_TYPES = ['new', 'drop', 'compare', 'collector', 'platform'];

// ---------- Category names (unicode-escaped) ----------
const CAT_PORCELAIN = '\u74f7\u5668';           // 瓷器
const CAT_JADE      = '\u7389\u5668';           // 玉器
const CAT_COINS     = '\u94b1\u5e01';           // 钱币
const CAT_PAINTINGS = '\u4e66\u753b';           // 书画
const CAT_MISC      = '\u6742\u9879';           // 杂项

const CAT_EN = {
  [CAT_PORCELAIN]: 'porcelain',
  [CAT_JADE]:      'jade',
  [CAT_COINS]:     'coins',
  [CAT_PAINTINGS]: 'paintings',
  [CAT_MISC]:      'miscellaneous',
};

// ---------- Reusable prefixes ----------
const PIN = '\uD83D\uDCCC ';                    // ?? (space)
const PREFIX_NEW       = PIN + '\u65b0\u4e0a\u67b6\uff1a';             // ?? 新上架：
const PREFIX_DROP      = PIN + '\u964d\u4ef7\u4fe1\u53f7\uff1a';       // ?? 降价信号：
const PREFIX_COLLECTOR = PIN + '\u85cf\u5bb6\u52a8\u6001\uff1a';       // ?? 藏家动态：
const PREFIX_COMPARE   = PIN + '\u540c\u7c7b\u5bf9\u6bd4\uff1a';       // ?? 同类对比：
const PREFIX_PLATFORM  = PIN + '\u5e73\u53f0\u5feb\u8baf\uff1a';       // ?? 平台快讯：

// Meta labels
const META_TODAY       = '\u5e73\u53f0\u6570\u636e \u00b7 \u4eca\u65e5';      // 平台数据 · 今日
const META_7D          = '\u5e02\u573a\u5feb\u7167 \u00b7 7 \u5929';        // 市场快照 · 7 天
const META_WEEK        = '\u85cf\u5bb6\u52a8\u6001 \u00b7 \u672c\u5468';      // 藏家动态 · 本周
const META_COMPARE     = '\u540c\u7c7b\u53c2\u7167 \u00b7 \u4ec5\u4f9b\u53c2\u8003';  // 同类参照 · 仅供参考
const META_PLATFORM    = '\u5e73\u53f0\u516c\u544a';                  // 平台公告
const META_EN_TODAY    = 'Platform data \u00b7 today';
const META_EN_7D       = 'Market snapshot \u00b7 7 days';
const META_EN_WEEK     = 'Collector activity \u00b7 this week';
const META_EN_COMPARE  = 'Comparable reference \u00b7 for reference only';
const META_EN_PLATFORM = 'Platform notice';

// ---------- Airtable fetch ----------
async function fetchAllRecords(table) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    let r;
    try {
      r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${TOKEN}` }, signal: ctl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`airtable ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    records.push(...(j.records || []));
    offset = j.offset || null;
  } while (offset);
  return records;
}

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
      en: PREFIX_NEW + newToday.length + ' new items today' +
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
      en: PREFIX_DROP + dropped.length + ' item' + (dropped.length > 1 ? 's' : '') +
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
      en: PREFIX_COLLECTOR + sellerId + ' listed ' + list.length + ' ' + catEn + ' this week \u2014 worth a look.',
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
      en: PREFIX_COMPARE + 'within ' + bestPair.cat + ', one listed at S$' + lowPrice +
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
      zh: PREFIX_PLATFORM + '\u521b\u59cb\u85cf\u5bb6\u62db\u52df\u8fdb\u884c\u4e2d\uff0c\u9650\u91cf 88 \u5e2d\u514d\u8d39\u5165\u9a7b\uff0c\u524d 2 \u4ef6\u85cf\u54c1\u514d\u8d39\u520a\u767b\u3002',
      en: PREFIX_PLATFORM + 'Founding Collector seats are open \u2014 limited to 88, join free, first 2 listings free.',
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
  if (/\u5e01|\u94b1|coin|numismat/.test(v)) return { page: CAT_COINS, standard: false };
  if (/\u753b|\u4e66\u6cd5|painting|calligraph/.test(v)) return { page: CAT_PAINTINGS, standard: false };
  return { page: CAT_MISC, standard: false };
}

async function debugReport() {
  const raw = await fetchAllRecords(TABLE);
  const byPage = {};
  const records = raw.map(rec => {
    const f = rec.fields || {};
    const status = String(f.status || '').trim().toLowerCase();
    const isPublic = PUBLIC_STATUSES.includes(status);
    const problems = [];
    const notes = [];
    if (!isPublic) problems.push(status ? 'status=' + f.status + ' \u2192 \u4e0d\u516c\u5f00' : 'status \u7a7a \u2192 \u4e0d\u516c\u5f00');
    if (!f.title_zh && !f.title_en) problems.push('title_zh / title_en \u90fd\u7a7a \u2192 \u524d\u7aef\u4e22\u5f03');
    if (!f.item_id) notes.push('item_id \u7a7a \u2192 \u94fe\u63a5 404');
    const cat = pageOfCategory(f.category);
    if (f.category && !cat.standard) notes.push('\u5206\u7c7b\u975e\u6807\u51c6 \u2192 \u5f52\u5165 ' + cat.page);
    if (!f.img_file) notes.push('img_file \u7a7a \u2192 \u5360\u4f4d\u56fe');
    if (!f.reason_zh && !f.reason_en) notes.push('reason_zh/en \u7a7a \u2192 \u65e0\u60c5\u62a5\u7406\u7531\u884c');
    if (!f.listed_at) notes.push('listed_at \u7a7a \u2192 \u65e0\u4e0a\u67b6\u65f6\u95f4');
    if (!f.previous_price) notes.push('previous_price \u7a7a \u2192 \u4e0d\u53c2\u4e0e\u964d\u4ef7\u60c5\u62a5');
    const shown = isPublic && (f.title_zh || f.title_en);
    if (shown) byPage[cat.page] = (byPage[cat.page] || 0) + 1;
    return {
      record_id: rec.id, item_id: normHyphen(f.item_id || ''),
      title: f.title_zh || f.title_en || '(\u65e0\u6807\u9898)',
      status: f.status || '', category: f.category || '',
      shows_on_page: shown ? cat.page : null, public: !!shown, problems, notes,
    };
  });

  let sellers = null;
  if (SELLERS_TABLE) {
    const rawS = await fetchAllRecords(SELLERS_TABLE);
    const ok = toPublicSellers(rawS);
    sellers = { rows: rawS.length, public_rows: ok.length };
  }

  let intel = null;
  if (INTEL_TABLE) {
    try {
      const rawI = await fetchAllRecords(INTEL_TABLE);
      const ok = toPublicIntel(rawI);
      intel = {
        rows: rawI.length, public_rows: ok.length,
        note: 'Intel \u8868\u662f\u4eba\u5de5\u8986\u76d6\uff1b\u4e0d\u586b\u7684 type \u7531\u4ee3\u7406\u81ea\u52a8\u751f\u6210',
        types_in_use: [...new Set(ok.map(r => r.type))],
      };
    } catch (e) {
      intel = { error: 'Intel \u8868\u8bfb\u53d6\u5931\u8d25: ' + e.message };
    }
  }

  const publicItems = toPublicItems(raw);
  const autoIntel = buildAutoIntel(publicItems);

  return {
    generated_at: new Date().toISOString(),
    summary: { total_records: records.length, public_records: records.filter(r => r.public).length, by_category_page: byPage },
    auto_intel_preview: autoIntel,
    hint: 'auto_intel_preview = \u4ee3\u7406\u81ea\u52a8\u751f\u6210\u7684\u60c5\u62a5\uff1bIntel \u8868\u540c type \u7684\u4eba\u5de5\u8bb0\u5f55\u4f1a\u8986\u76d6\u5b83\u3002',
    records, sellers, intel,
  };
}

// ---------- Cache ----------
const FRESH_MS = 30 * 1000;
const STALE_MS = 60 * 60 * 1000;
let cache = { items: null, sellers: [], intel: [], at: 0 };

async function getData() {
  const now = Date.now();
  if (cache.items && now - cache.at < FRESH_MS) {
    return { items: cache.items, sellers: cache.sellers, intel: cache.intel, stale: false };
  }
  try {
    const items = toPublicItems(await fetchAllRecords(TABLE));

    let sellers = cache.sellers;
    if (SELLERS_TABLE) {
      try { sellers = toPublicSellers(await fetchAllRecords(SELLERS_TABLE)); }
      catch (e) { console.warn('[airtable-proxy] sellers table read failed:', e.message); }
    } else {
      sellers = [];
    }

    let intel = cache.intel;
    if (INTEL_TABLE) {
      try { intel = toPublicIntel(await fetchAllRecords(INTEL_TABLE)); }
      catch (e) { console.warn('[airtable-proxy] intel table read failed:', e.message); }
    } else {
      intel = [];
    }

    const autoIntel = buildAutoIntel(items);
    const mergedIntel = mergeIntel(autoIntel, intel);

    cache = { items, sellers, intel: mergedIntel, at: Date.now() };
    return { items, sellers, intel: mergedIntel, stale: false };
  } catch (e) {
    if (cache.items && now - cache.at < STALE_MS) {
      console.warn('[airtable-proxy] upstream failed, using cache:', e.message);
      return { items: cache.items, sellers: cache.sellers, intel: cache.intel, stale: true };
    }
    throw e;
  }
}

// ---------- Handler ----------
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://gudong.app', 'https://www.gudong.app'];
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);

  if (origin && !allowed.includes(origin) && !isLocal) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
    try {
      const report = await debugReport();
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(200).json(report);
    } catch (e) {
      console.error('[airtable-proxy][debug]', e.message);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'Upstream failed', detail: e.message });
    }
  }

  const q   = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
  const cat = String(req.query.cat || 'all').trim();

  try {
    const { items: all, sellers, intel, stale } = await getData();
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

    res.setHeader('Cache-Control', stale ? 'public, s-maxage=10' : 's-maxage=30, stale-while-revalidate=60');
    if (stale) res.setHeader('X-Data-Stale', '1');
    return res.status(200).json({
      todayFinds:  items.filter(f => f.is_today_finds),
      editorPicks: items.filter(f => f.is_editor_picks),
      newListing:  items,
      sellers,
      intel,
      total:       items.length,
    });

  } catch (e) {
    console.error('[airtable-proxy]', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Upstream failed' });
  }
}