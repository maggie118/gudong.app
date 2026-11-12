// scripts/refresh-listings.js
// 穷人版 SSG：在 Vercel build 时拉一次 Airtable，覆盖 data/listings.json。
// 设计原则：任何失败都不阻塞 build —— 拉不到就保留旧 listings.json。
//
// 需要的环境变量（Vercel 已配）：
//   AIRTABLE_BASE_ID, AIRTABLE_TABLE, AIRTABLE_TOKEN
//
// 退出码：
//   0 = 成功刷新，或失败但已安全跳过（保留旧文件）
//   1 = 严重错误（一般不会发生；发生时 Vercel build 会失败，你能立刻看到）

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'listings.json');

const BASE  = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE;
const TOKEN = process.env.AIRTABLE_TOKEN;
const SELLERS_TABLE = process.env.AIRTABLE_SELLERS_TABLE;

// Google Sheets 数据源（配置了 SHEET_ID 时优先于 Airtable 使用）
// Airtable 免费版每月 1000 次 API 调用，部署两次就会耗尽；Sheets 走公开 CSV 导出，不受此限。
const sheets = require('./sheets-source');

function log(...args) {
  console.log('[refresh-listings]', ...args);
}

function safeReadExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

async function fetchAll(table) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let r;
    try {
      r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: ctrl.signal,
      });
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

function mapItem(rec) {
  const f = rec.fields || {};
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  return {
    item_id: f.item_id || rec.id,
    _createdTime: rec.createdTime,
    title_zh: f.title_zh || '',
    title_en: f.title_en || '',
    era_zh: f.era_zh || '',
    era_en: f.era_en || '',
    category: f.category || '',
    dimensions: f.dimensions || '',
    has_surface_wear: !!f.has_surface_wear,
    has_surface_damage: !!f.has_surface_damage,
    price_type: f.price_type || '',
    price_display_zh: f.price_display_zh || f.price_zh || '',
    price_display_en: f.price_display_en || f.price_en || '',
    img_file: Array.isArray(f.img_file) ? f.img_file.join(' ') : (f.img_file || ''),
    seller_id: f.seller_id || '',
    seller_name_en: f.seller_name_en || '',
    seller_whatsapp: f.seller_whatsapp || '',
    is_today_finds: !!f.is_today_finds,
    is_new_listing: !!f.is_new_listing,
    // 付费曝光位：Airtable/CSV 里没有这两列时，勾了 is_today_finds 即视为 1 档、长期有效
    exposure_tier: f.exposure_tier != null && f.exposure_tier !== '' ? Number(f.exposure_tier) : (f.is_today_finds ? 1 : 0),
    exposure_until: f.exposure_until || '',
    status: (f.status || '').toLowerCase(),
    // 购买理由（前端“今日发现”卡片 .finds-reason 展示；字段名与 proxy 一致）
    reason_zh: f.reason_zh || '',
    reason_en: f.reason_en || '',
    // 供情报(intel)自动生成使用的额外字段
    listed_at: f.listed_at || '',
    expiry_date: f.expiry_date || '', // 可选显式到期日；缺省由 listed_at/创建时间 +6 个月推导
    previous_price: f.previous_price != null ? Number(f.previous_price) : NaN,
    fixed_price: f.fixed_price != null ? Number(f.fixed_price) : NaN,
  };
}

// ---------- 卖家（专属藏馆）映射 ----------
// 与 api/airtable-proxy.js 的 SELLER_PUBLIC_FIELDS 口径保持一致；
// 额外带出 gallery（= 是否已付费开通专属藏馆）与 title_focus（SEO 焦点词）。
const WA_USERNAME_KEYS = [
  'wa_username', 'waUsername', 'WA_Username',
  'whatsapp_username', 'whatsappUsername', 'WhatsApp Username', 'WhatsApp username',
  'whatsapp_user', 'wa_user', 'waUser', 'wa_name',
];
const WA_PHONE_KEYS = [
  'wa_phone', 'waPhone', 'WA_Phone',
  'whatsapp_phone', 'whatsappPhone', 'WhatsApp Phone', 'WhatsApp phone',
  'whatsapp_number', 'whatsappNumber', 'WhatsApp Number', 'WhatsApp number',
  // Airtable sellers 表实际字段名（中英混合 / 英文变体）
  'WhatsApp 联络号码 / WhatsApp Contact Number',
  'WhatsApp Contact Number',
  'WhatsApp 联络号码',
  'Contact Number',
  'phone', 'Phone', 'mobile', 'Mobile',
];
const PHONE_ISH = /^[+\d\s()\-]+$/;

// 创始藏家编号字段（Airtable sellers 表可能的命名变体）
const FOUNDING_NO_KEYS = [
  'founding_no', 'foundingNo', 'founding_number',
  'Founding No', 'Founding Number',
  '创始编号', '创始藏家编号',
];

function pickStr(f, keys) {
  for (const k of keys) {
    const v = f[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  }
  return '';
}
// 卖家只填用户名时输出 wa_username；只填号码时输出 wa_phone（wa.me 需纯数字）
function pickWa(f) {
  let u = pickStr(f, WA_USERNAME_KEYS).replace(/^@/, '');
  let p = pickStr(f, WA_PHONE_KEYS);
  if (u && !PHONE_ISH.test(u)) return { wa_username: u };
  if (p && PHONE_ISH.test(p)) return { wa_phone: p.replace(/[^0-9]/g, '') };
  if (u) return { wa_phone: u.replace(/[^0-9]/g, '') };
  return {};
}
function slugify(id) {
  return String(id == null ? '' : id).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function mapSeller(rec) {
  const f = rec.fields || {};
  const id = f.seller_id || rec.id;
  const wa = pickWa(f);
  return Object.assign({
    seller_id: id,
    display_zh: f.display_zh || f.seller_name_zh || '',
    display_en: f.display_en || f.seller_name_en || '',
    since_year: f.since_year != null ? Number(f.since_year) : 2026,
    intro_zh: f.intro_zh || '',
    intro_en: f.intro_en || '',
    title_focus: f.title_focus || '',
    gallery: f.gallery === true || f.gallery === 'true' || f.gallery === 1,
    gallery_started_at: f.gallery_started_at || '', // 开馆日期 → 默认展示期 1 年
    gallery_expires_at: f.gallery_expires_at || '', // 可选显式到期日，优先于 started+1年
    founding_no: pickStr(f, FOUNDING_NO_KEYS),      // 创始藏家编号（如 001；未分配则空）
    page_url: f.page_url || `/sellers/seller-${slugify(id)}-antiques.html`,
  }, wa);
}
async function fetchSellers() {
  if (sheets.isConfigured() || sheets.hasRepoCsv(sheets.TAB_SELLERS)) {
    const records = await sheets.fetchTable(sheets.TAB_SELLERS);
    return records
      .filter(r => String((r.fields && r.fields.status) || '').trim().toLowerCase() === 'active')
      .map(mapSeller);
  }
  if (!SELLERS_TABLE) return null; // 未配置卖家表 → 保留旧数据
  const records = await fetchAll(SELLERS_TABLE);
  return records
    .filter(r => String((r.fields && r.fields.status) || '').trim().toLowerCase() === 'active')
    .map(mapSeller);
}

// ---------- Intel 自动生成（与 airtable-proxy 口径一致） ----------
const CAT_PORCELAIN = '\u74f7\u5668'; // 瓷器
const CAT_JADE      = '\u7389\u5668'; // 玉器
const CAT_COINS     = '\u94b1\u5e01'; // 钱币
const CAT_BRONZE    = '\u94dc\u5668'; // 铜器
const CAT_PAINTINGS = '\u4e66\u753b'; // 书画
const CAT_MISC      = '\u6742\u9879'; // 杂项

const CAT_EN = {
  [CAT_PORCELAIN]: 'porcelain',
  [CAT_JADE]: 'jade',
  [CAT_BRONZE]: 'bronzes',
  [CAT_COINS]: 'coins',
  [CAT_PAINTINGS]: 'paintings',
  [CAT_MISC]: 'miscellaneous',
};

const PIN    = '\uD83D\uDCCC '; // 图钉
const PIN_EN = '\uD83D\uDCCD ';
const PREFIX_NEW       = PIN + '\u65b0\u4e0a\u67b6\uff1a';             // 新上架：
const PREFIX_DROP      = PIN + '\u964d\u4ef7\u4fe1\u53f7\uff1a';       // 降价信号：
const PREFIX_COLLECTOR = PIN + '\u85cf\u5bb6\u52a8\u6001\uff1a';       // 藏家动态：
const PREFIX_COMPARE   = PIN + '\u540c\u7c7b\u5bf9\u6bd4\uff1a';       // 同类对比：
const PREFIX_PLATFORM  = PIN + '\u5e73\u53f0\u5feb\u8baf\uff1a';       // 平台快讯：
const PREFIX_EN_NEW       = PIN_EN + 'New arrivals: ';
const PREFIX_EN_DROP      = PIN_EN + 'Price drop: ';
const PREFIX_EN_COLLECTOR = PIN_EN + 'Collector activity: ';
const PREFIX_EN_COMPARE   = PIN_EN + 'Comparable: ';
const PREFIX_EN_PLATFORM  = PIN_EN + 'Platform note: ';
const META_TODAY       = '\u5e73\u53f0\u6570\u636e \u00b7 \u4eca\u65e5'; // 平台数据 · 今日
const META_7D          = '\u5e02\u573a\u5feb\u7167 \u00b7 7 \u5929';   // 市场快照 · 7 天
const META_WEEK        = '\u85cf\u5bb6\u52a8\u6001 \u00b7 \u672c\u5468'; // 藏家动态 · 本周
const META_COMPARE     = '\u540c\u7c7b\u53c2\u7167 \u00b7 \u4ec5\u4f9b\u53c2\u8003'; // 同类参照 · 仅供参考
const META_PLATFORM    = '\u5e73\u53f0\u516c\u544a';                    // 平台公告
const META_EN_TODAY    = 'Platform data \u00b7 today';
const META_EN_7D       = 'Market snapshot \u00b7 7 days';
const META_EN_WEEK     = 'Collector activity \u00b7 this week';
const META_EN_COMPARE  = 'Comparable reference \u00b7 for reference only';
const META_EN_PLATFORM = 'Platform notice';

function normCat(c) {
  const v = String(c == null ? '' : c).trim().toLowerCase();
  if (/\u74f7|porcelain|ceramic/.test(v)) return CAT_PORCELAIN;
  if (/\u7389|jade/.test(v)) return CAT_JADE;
  if (/\u94dc|bronze/.test(v)) return CAT_BRONZE;
  if (/\u5e01|\u94b1|coin|numismat/.test(v)) return CAT_COINS;
  if (/\u753b|\u4e66\u6cd5|painting|calligraph/.test(v)) return CAT_PAINTINGS;
  return CAT_MISC;
}

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
    newToday.forEach(f => { const c = normCat(f.category); catCounts[c] = (catCounts[c] || 0) + 1; });
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
    const prev = f.previous_price;
    const nowP = f.fixed_price;
    return isFinite(prev) && isFinite(nowP) && prev > 0 && nowP > 0 && prev > nowP;
  });
  if (dropped.length > 0) {
    const cuts = dropped.map(f => (f.previous_price - f.fixed_price) / f.previous_price);
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
  recent.forEach(f => { if (f.seller_id) (bySeller[f.seller_id] = bySeller[f.seller_id] || []).push(f); });
  const topSeller = Object.entries(bySeller).sort((a, b) => b[1].length - a[1].length)[0];
  if (topSeller && topSeller[1].length >= 2) {
    const [sellerId, list] = topSeller;
    const catCounts = {};
    list.forEach(f => { const c = normCat(f.category); catCounts[c] = (catCounts[c] || 0) + 1; });
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
  const withPrice = items.filter(f => isFinite(f.fixed_price) && f.fixed_price > 0);
  const byCat = {};
  withPrice.forEach(f => { const c = normCat(f.category); (byCat[c] = byCat[c] || []).push(f); });
  let bestPair = null;
  Object.entries(byCat).forEach(([cat, list]) => {
    if (list.length < 2) return;
    const sorted = [...list].sort((a, b) => a.fixed_price - b.fixed_price);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    const diff = (high.fixed_price - low.fixed_price) / high.fixed_price;
    if (!bestPair || diff > bestPair.diff) bestPair = { cat, low, high, diff };
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

  // platform 保底
  auto.push({
    type: 'platform',
    zh: PREFIX_PLATFORM + '“创始藏家”现开放第二批申请，仅限 50 位中高端藏家，截止至 2026 年 12 月 31 日。',
    en: PREFIX_EN_PLATFORM + 'Founding Collector intake opens for a second batch — limited to 50 mid-to-high-end collectors, closing 31 December 2026.',
    meta: META_PLATFORM,
    metaEn: META_EN_PLATFORM,
  });

  return auto;
}

function mergeIntel(autoIntel) {
  const order = ['new', 'drop', 'collector', 'compare', 'platform'];
  const result = [];
  order.forEach(t => {
    const a = autoIntel.find(x => x.type === t);
    if (a) result.push(a);
  });
  return result;
}

function validate(items) {
  if (!Array.isArray(items) || items.length < 5) {
    return `only ${items.length} items, refusing to overwrite`;
  }
  const noTitle = items.filter(i => !i.title_zh && !i.title_en).length;
  if (noTitle > items.length * 0.5) {
    return `${noTitle}/${items.length} items missing title, suspicious schema change`;
  }
  return null;
}

// ---------- 展示期：普通藏品 6 个月 / 专属藏馆 1 年 ----------
const ITEM_DISPLAY_MONTHS = 6;
const GALLERY_DISPLAY_MONTHS = 12;
const EXPIRY_WINDOW_DAYS = 30; // 到期前提前提醒窗口

function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
function daysUntil(dateStr, now) {
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - now) / 86400000);
}
// 藏品到期日：显式 expiry_date 优先，否则 listed_at / 创建时间 +6 个月
function itemExpiry(it) {
  if (it.expiry_date) return it.expiry_date;
  const base = it.listed_at || it._createdTime;
  if (!base) return '';
  return addMonths(new Date(base), ITEM_DISPLAY_MONTHS).toISOString().slice(0, 10);
}
// 藏馆到期日：显式 gallery_expires_at 优先，否则 gallery_started_at +1 年
function galleryExpiry(s) {
  if (s.gallery_expires_at) return s.gallery_expires_at;
  if (!s.gallery_started_at) return '';
  return addMonths(new Date(s.gallery_started_at), GALLERY_DISPLAY_MONTHS).toISOString().slice(0, 10);
}

async function main() {
  const sheetSource = sheets.isConfigured() || sheets.hasRepoCsv(sheets.TAB_ITEMS);
  if (!sheetSource && (!BASE || !TABLE || !TOKEN)) {
    log('missing AIRTABLE_* / SHEET_ID / data/items.csv, keeping existing listings.json');
    process.exit(0);
  }

  let records;
  try {
    records = sheetSource
      ? await sheets.fetchTable(sheets.TAB_ITEMS)
      : await fetchAll(TABLE);
    if (sheetSource) {
      const src = sheets.isConfigured() ? `Google 表格 ${sheets.SHEET_ID}` : '仓库 CSV data/items.csv';
      log(`数据源：${src}（工作表 ${sheets.TAB_ITEMS}），${records.length} 行`);
    }
  } catch (e) {
    log('数据源拉取失败，保留现有 listings.json:', e.message);
    process.exit(0);
  }

  const now = Date.now();
  const todayStr = new Date(now).toISOString().slice(0, 10);

  const active = records
    .filter(r => String((r.fields && r.fields.status) || '').trim().toLowerCase() === 'active')
    .map(mapItem)
    .sort((a, b) => String(b._createdTime || '').localeCompare(String(a._createdTime || '')));

  // —— 展示期识别 + 到期自动下架（构建期只读过滤，不额外写 Airtable）——
  // 每条补 expiry_date；到期日 <= 今天 → 视为到期，移出公开列表（自动下架）。
  const withExpiry = active.map(it => Object.assign({}, it, { expiry_date: itemExpiry(it) }));
  const expiredItems = withExpiry.filter(it => it.expiry_date && it.expiry_date <= todayStr);
  const live = withExpiry.filter(it => !it.expiry_date || it.expiry_date > todayStr);
  const expiringSoonItems = live
    .map(it => ({ item_id: it.item_id, title_zh: it.title_zh, title_en: it.title_en, expiry_date: it.expiry_date, days_left: daysUntil(it.expiry_date, now) }))
    .filter(r => r.days_left >= 0 && r.days_left <= EXPIRY_WINDOW_DAYS)
    .sort((a, b) => a.days_left - b.days_left);

  if (expiredItems.length) {
    log(`[展示期] 到期自动下架 ${expiredItems.length} 件藏品：` +
      expiredItems.map(i => `${i.item_id}(${i.expiry_date})`).join(', '));
  }

  const problem = validate(live);
  if (problem) {
    log('validation failed, keeping existing listings.json:', problem);
    process.exit(0);
  }

  const payload = {
    todayFinds: [],
    // 付费位不足 4 件时，用编辑精选（未买位的在售藏品）垫满，不抢付费位
    editorPicks: [],
    paidFindsCount: 0,
    newListing: live,
    sellers: [],
    intel: mergeIntel(buildAutoIntel(live)),
    total: live.length,
  };

  // 卖家（专属藏馆）：尽量从 Airtable Sellers 表拉取；拉不到/未配置 → 保留旧数据
  const old = safeReadExisting();
  let sellers;
  try {
    sellers = await fetchSellers();
  } catch (e) {
    log('sellers fetch failed, keeping existing sellers:', e.message);
    sellers = null;
  }
  if (Array.isArray(sellers) && sellers.length) {
    // —— 藏馆展示期 1 年：到期藏馆自动下架（移出公开 sellers）——
    const withGalleryExpiry = sellers.map(s => Object.assign({}, s, { gallery_expires_at: galleryExpiry(s) }));
    const expiredGalleries = withGalleryExpiry.filter(s => s.gallery && s.gallery_expires_at && s.gallery_expires_at <= todayStr);
    payload.sellers = withGalleryExpiry.filter(s => !(s.gallery && s.gallery_expires_at && s.gallery_expires_at <= todayStr));
    if (expiredGalleries.length) {
      log(`[展示期] 藏馆到期自动下架 ${expiredGalleries.length} 家：` +
        expiredGalleries.map(s => `${s.seller_id}(${s.gallery_expires_at})`).join(', '));
    }
  } else if (old && Array.isArray(old.sellers) && old.sellers.length) {
    payload.sellers = old.sellers;
  }

  // ---------- 今日发现 = 付费曝光位 ----------
  // 规则（按业务口径）：
  //   1) 私家藏馆付费开通后，店内藏品免费在「今日发现」展示 7 天，
  //      窗口 = gallery_started_at 起算 7 天（含开通当天），到期自动退出；
  //   2) 另外单独买曝光位的藏品（勾 is_today_finds）也在队列里，
  //      若填了 exposure_until 则以该日期为准；
  //   3) 排序：档位高者在前，同档位先到期者在前，让每件都能轮到首屏；
  //   4) 同一卖家在队列前排设有上限，避免一家占满整屏。
  const GALLERY_FREE_DAYS = 7;
  const dayMs = 86400000;
  const galleryWindows = new Map();
  for (const s of payload.sellers) {
    if (!s.gallery) continue;
    const start = String(s.gallery_started_at || '').slice(0, 10);
    if (!start) continue;
    const end = new Date(new Date(start + 'T00:00:00Z').getTime() + GALLERY_FREE_DAYS * dayMs).toISOString().slice(0, 10);
    galleryWindows.set(String(s.seller_id || '').trim(), { start, end });
  }

  const eligible = live.filter((i) => {
    const w = galleryWindows.get(String(i.seller_id || '').trim());
    if (w && todayStr >= w.start && todayStr < w.end) return true; // 开馆首 7 天免费曝光
    const until = String(i.exposure_until || '').slice(0, 10);
    if (i.is_today_finds && until && until >= todayStr) return true; // 另行买位且有到期日
    return false;
  });
  const ignoredTicks = live.filter((i) => i.is_today_finds && !String(i.exposure_until || '').slice(0, 10)).length;
  if (ignoredTicks) {
    log(`[今日发现] 有 ${ignoredTicks} 件勾了 is_today_finds 但没填 exposure_until，已按「免费 7 天已过期」处理，未进入曝光位`);
  }

  const tierOf = (i) => Number(i.exposure_tier) || 1;
  const sortedEligible = eligible.slice().sort((a, b) => {
    const t = tierOf(b) - tierOf(a);
    if (t) return t;
    const ua = String(a.exposure_until || '9999-12-31').slice(0, 10);
    const ub = String(b.exposure_until || '9999-12-31').slice(0, 10);
    if (ua !== ub) return ua < ub ? -1 : 1;
    return String(a.listed_at || '').localeCompare(String(b.listed_at || ''));
  });

  const perSeller = {};
  const capPerSeller = Math.max(1, Math.ceil(sortedEligible.length / 4));
  const todayFinds = [];
  const overflow = [];
  for (const i of sortedEligible) {
    const sid = String(i.seller_id || '').trim();
    perSeller[sid] = perSeller[sid] || 0;
    if (perSeller[sid] < capPerSeller) { perSeller[sid] += 1; todayFinds.push(i); } else { overflow.push(i); }
  }
  todayFinds.push(...overflow);

  payload.todayFinds = todayFinds;
  payload.paidFindsCount = sortedEligible.length;
  // 曝光位不足 4 件时，用编辑精选补位（不计入付费曝光）
  payload.editorPicks = sortedEligible.length < 4
    ? live.filter((i) => !eligible.includes(i) && i.status === 'active').slice(0, 4 - sortedEligible.length)
    : [];
  const freeWindowSellers = [...galleryWindows.entries()]
    .filter(([, w]) => todayStr >= w.start && todayStr < w.end)
    .map(([sid, w]) => `${sid}(${w.start}→${w.end})`);
  log(`[今日发现] 曝光位 ${sortedEligible.length} 件；藏馆免费 7 天窗口生效中：${freeWindowSellers.join(', ') || '无'}`);

  // 到期提醒数据（写入 listings.json 供前端/后续通知器使用；同时落一份独立报告便于查看）
  const expiringGalleries = payload.sellers
    .filter(s => s.gallery && s.gallery_expires_at)
    .map(s => ({ seller_id: s.seller_id, display_zh: s.display_zh, display_en: s.display_en, expiry_date: s.gallery_expires_at, days_left: daysUntil(s.gallery_expires_at, now) }))
    .filter(r => r.days_left >= 0 && r.days_left <= EXPIRY_WINDOW_DAYS)
    .sort((a, b) => a.days_left - b.days_left);

  const expiryMeta = {
    generated_at: new Date(now).toISOString(),
    item_period_months: ITEM_DISPLAY_MONTHS,
    gallery_period_months: GALLERY_DISPLAY_MONTHS,
    removed_today: expiredItems.map(i => ({ item_id: i.item_id, title_zh: i.title_zh, expiry_date: i.expiry_date })),
    galleries_removed_today: 0,
    expiring_soon_items: expiringSoonItems,
    expiring_soon_galleries: expiringGalleries,
  };
  payload.expiry = expiryMeta;

  // 到期前提醒：独立报告文件，可在 CI/日志里读取或后续接通知
  try {
    const report = {
      generated_at: expiryMeta.generated_at,
      note: `普通藏品展示期 ${ITEM_DISPLAY_MONTHS} 个月，专属藏馆展示期 ${GALLERY_DISPLAY_MONTHS} 个月；到期自动下架，到期前 ${EXPIRY_WINDOW_DAYS} 天提示。`,
      expiring_soon_items: expiringSoonItems,
      expiring_soon_galleries: expiringGalleries,
      removed_today_items: expiryMeta.removed_today,
      removed_today_galleries: expiryMeta.galleries_removed_today,
    };
    fs.writeFileSync(path.join(path.dirname(OUT_FILE), 'expiry-report.json'), JSON.stringify(report, null, 2), 'utf8');
    if (expiringSoonItems.length || expiringGalleries.length) {
      log(`[展示期] 即将到期提醒：${expiringSoonItems.length} 件藏品、${expiringGalleries.length} 家藏馆（${EXPIRY_WINDOW_DAYS} 天内）`);
    }
  } catch (e) { /* 报告非关键，失败不影响主流程 */ }

  // editorPicks 只承担「曝光位不足 4 件时补位」的角色：
  // 曝光位够用就不再沿用旧编辑精选，否则会悄悄挤进首页。
  if (payload.paidFindsCount < 4 && old && Array.isArray(old.editorPicks) && old.editorPicks.length && !payload.editorPicks.length) {
    payload.editorPicks = old.editorPicks.slice(0, 4 - payload.paidFindsCount);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  log(`refreshed listings.json: ${live.length} live items (${expiredItems.length} expired removed), ${payload.todayFinds.length} today finds`);
}

main().catch(e => {
  log('unexpected error, keeping existing listings.json:', e.message);
  process.exit(0);
});
