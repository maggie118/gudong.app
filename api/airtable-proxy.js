// /api/airtable-proxy.js
// Vercel Serverless Function — 读取 Airtable 真实数据（公开只读接口）
// 环境变量：
//   必需：AIRTABLE_BASE_ID / AIRTABLE_TABLE / AIRTABLE_TOKEN
//   可选：AIRTABLE_SELLERS_TABLE（卖家表名，如 sellers）
//         AIRTABLE_INTEL_TABLE（情报表名，如 Intel；只用于手写 platform/compare 补充）
//         AIRTABLE_DEBUG_KEY（排查密钥）
//
// 2026-09-25 v2（方案 A：情报自动生成）
//  — 情报不再完全依赖 Intel 表，改为"自动 + 人工"混合：
//     · new       自动：从 antiques 表算"今日上架 N 件"
//     · drop      自动：从 antiques 表算"近 7 天有 N 件降价，平均 X%"（需 previous_price 字段）
//     · collector 自动：从 antiques 表按 seller_id 算"某藏家本周集中上架 N 件"
//     · compare   自动：从 antiques 表找同类里"价格差最大"的两件（同类对比）
//     · platform  人工：从 Intel 表读（手写；没有就用兜底文案）
//  — Intel 表变成"可选覆盖"：如果 Intel 表里同一 type 有记录，优先用人工的。
//  — 顺序：new → drop → collector → compare → platform
//  — 字段白名单新增 previous_price。

const BASE           = process.env.AIRTABLE_BASE_ID;
const TABLE          = process.env.AIRTABLE_TABLE;
const TOKEN          = process.env.AIRTABLE_TOKEN;
const SELLERS_TABLE  = process.env.AIRTABLE_SELLERS_TABLE;   // 可选
const INTEL_TABLE    = process.env.AIRTABLE_INTEL_TABLE;     // 可选：只用于 platform/compare 人工覆盖
const DEBUG_KEY      = process.env.AIRTABLE_DEBUG_KEY;       // 可选

/* 只公开 status 为下列值的记录 */
const PUBLIC_STATUSES = ['active'];

/* 对外公开的字段白名单 */
const PUBLIC_FIELDS = [
  'title_zh', 'title_en', 'desc_zh', 'desc_en', 'era_zh', 'era_en', 'category',
  'material_zh', 'material_en', 'kiln_zh', 'kiln_en', 'mark_zh', 'mark_en', 'certificate_no', 'tags',
  'dimensions', 'weight', 'condition_zh', 'condition_en', 'has_surface_wear', 'has_surface_damage',
  'price_type', 'fixed_price', 'price_zh', 'price_en', 'price_display_zh', 'price_display_en',
  'img_file',
  'seller_id', 'seller_whatsapp',
  'is_today_finds', 'is_editor_picks', 'is_new_listing', 'status',
  'reason_zh', 'reason_en', 'listed_at',
  'previous_price',       // ?? 新增：用于自动算降价
];

const HYPHEN_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g;
function normHyphen(v) {
  if (typeof v !== 'string') return v;
  return v.replace(HYPHEN_VARIANTS, '-').trim();
}

const SELLER_PUBLIC_FIELDS = ['seller_id', 'display_zh', 'display_en', 'since_year', 'intro_zh', 'intro_en', 'page_url'];

/* Intel 表对外公开字段 */
const INTEL_PUBLIC_FIELDS = ['type', 'text_zh', 'text_en', 'meta_zh', 'meta_en', 'publish_date', 'active'];

/* Intel 表允许的 type 取值 */
const INTEL_TYPES = ['new', 'drop', 'compare', 'collector', 'platform'];

// ---------- 上游请求 ----------
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

// ---------- 清洗：藏品 ----------
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

// ---------- 清洗：Intel（人工情报，作为覆盖） ----------
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
        meta: f.meta_zh || '编辑整理',
        metaEn: f.meta_en || 'Editorial',
        _sort: f.publish_date || rec.createdTime || '',
      };
    })
    .sort((a, b) => String(b._sort || '').localeCompare(String(a._sort || '')))
    .map(({ _sort, ...rest }) => rest);
}

// ---------- 分类归一化 ----------
function normCat(c) {
  const v = String(c == null ? '' : c).trim().toLowerCase();
  if (/瓷|porcelain|ceramic/.test(v)) return '瓷器';
  if (/玉|jade/.test(v)) return '玉器';
  if (/币|钱|coin|numismat/.test(v)) return '钱币';
  if (/画|书法|painting|calligraph/.test(v)) return '书画';
  return '杂项';
}

// ---------- 自动生成情报 ----------
function buildAutoIntel(items) {
  const now = Date.now();
  const DAY = 86400000;
  const WEEK = 7 * DAY;
  const todayStr = new Date(now).toISOString().slice(0, 10);

  const auto = [];

  /* ① new —— 今日上架数 */
  const newToday = items.filter(f => String(f.listed_at || '').startsWith(todayStr));
  if (newToday.length > 0) {
    const catCounts = {};
    newToday.forEach(f => {
      const c = normCat(f.category);
      catCounts[c] = (catCounts[c] || 0) + 1;
    });
    const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
    const topCatStr = topCat ? `${topCat[0]}占 ${topCat[1]} 件` : '';
    auto.push({
      type: 'new',
      zh: `?? 新上架：今日已有 ${newToday.length} 件新藏品进入${topCatStr ? '，' + topCatStr : ''}。`,
      en: `?? New arrivals: ${newToday.length} new items today${topCat ? ', ' + topCat[1] + ' in ' + ({'瓷器':'porcelain','玉器':'jade','钱币':'coins','书画':'paintings','杂项':'misc'}[topCat[0]] || 'others') : ''}.`,
      meta: '平台数据 · 今日',
      metaEn: 'Platform data · today',
    });
  }

  /* ② drop —— 近 7 天降价（需要 previous_price 与 fixed_price） */
  const dropped = items.filter(f => {
    const prev = Number(f.previous_price);
    const now = Number(f.fixed_price);
    return isFinite(prev) && isFinite(now) && prev > 0 && now > 0 && prev > now;
  });
  if (dropped.length > 0) {
    const cuts = dropped.map(f => {
      const prev = Number(f.previous_price);
      const now = Number(f.fixed_price);
      return (prev - now) / prev;
    });
    const avgPct = Math.round(cuts.reduce((a, b) => a + b, 0) / cuts.length * 100);
    auto.push({
      type: 'drop',
      zh: `?? 降价信号：近 7 天有 ${dropped.length} 件下调价格，平均降幅约 ${avgPct}%，可留意议价空间。`,
      en: `?? Price drop: ${dropped.length} item${dropped.length > 1 ? 's' : ''} reduced in the last 7 days, avg. cut ~${avgPct}% — room to negotiate.`,
      meta: '市场快照 · 7 天',
      metaEn: 'Market snapshot · 7 days',
    });
  }

  /* ③ collector —— 本周活跃卖家（上架最多的那位） */
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
    const catStr = topCat ? topCat[0] : '藏品';
    const catEn = topCat ? ({'瓷器':'porcelain','玉器':'jade','钱币':'coins','书画':'paintings','杂项':'miscellaneous'}[topCat[0]] || 'items') : 'items';
    auto.push({
      type: 'collector',
      zh: `?? 藏家动态：本周 ${sellerId} 集中上架 ${list.length} 件${catStr}，可留意。`,
      en: `?? Collector activity: ${sellerId} listed ${list.length} ${catEn} this week — worth a look.`,
      meta: '藏家动态 · 本周',
      metaEn: 'Collector activity · this week',
    });
  }

  /* ④ compare —— 同类里价格差最大的两件 */
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
    const lowTitle = low.title_zh || low.title_en || low.item_id;
    const highTitle = high.title_zh || high.title_en || high.item_id;
    auto.push({
      type: 'compare',
      zh: `?? 同类对比：同为${bestPair.cat}，一件标价 S$${Number(low.fixed_price).toLocaleString('en-SG')}，另一件 S$${Number(high.fixed_price).toLocaleString('en-SG')}，价差约 ${Math.round(bestPair.diff * 100)}%。`,
      en: `?? Comparable: within ${bestPair.cat}, one listed at S$${Number(low.fixed_price).toLocaleString('en-SG')} vs S$${Number(high.fixed_price).toLocaleString('en-SG')} — spread ~${Math.round(bestPair.diff * 100)}%.`,
      meta: '同类参照 · 仅供参考',
      metaEn: 'Comparable reference · for reference only',
    });
  }

  return auto;
}

// ---------- 合并自动 + 人工（人工优先） ----------
function mergeIntel(autoIntel, manualIntel) {
  // 人工的按 type 索引
  const manualByType = {};
  (manualIntel || []).forEach(it => {
    if (!manualByType[it.type]) manualByType[it.type] = it;
  });
  // 5 类的最终结果：人工优先，否则自动
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
  // platform 兜底（如果自动 + 人工都没有）
  if (!result.find(r => r.type === 'platform')) {
    result.push({
      type: 'platform',
      zh: '?? 平台快讯：创始藏家招募进行中，限量 88 席免费入驻，前 2 件藏品免费刊登。',
      en: '?? Platform note: Founding Collector seats are open — limited to 88, join free, first 2 listings free.',
      meta: '平台公告',
      metaEn: 'Platform notice',
    });
  }
  return result;
}

// ---------- 排查报告 ----------
function pageOfCategory(c) {
  const v = String(c == null ? '' : c).trim().toLowerCase();
  const exact = { '瓷器': '瓷器', '玉器': '玉器', '钱币': '钱币', '书画': '书画', '杂项': '杂项',
    porcelain: '瓷器', jade: '玉器', coins: '钱币', coin: '钱币', paintings: '书画', painting: '书画', calligraphy: '书画', misc: '杂项', miscellaneous: '杂项', other: '杂项' };
  if (exact[v]) return { page: exact[v], standard: true };
  if (/瓷|porcelain|ceramic/.test(v)) return { page: '瓷器', standard: false };
  if (/玉|jade/.test(v)) return { page: '玉器', standard: false };
  if (/币|钱|coin|numismat/.test(v)) return { page: '钱币', standard: false };
  if (/画|书法|painting|calligraph/.test(v)) return { page: '书画', standard: false };
  return { page: '杂项', standard: false };
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
    if (!isPublic) problems.push(status ? `status=「${f.status}」→ 不公开` : 'status 为空 → 不公开');
    if (!f.title_zh && !f.title_en) problems.push('title_zh 与 title_en 都为空 → 前端丢弃');
    if (!f.item_id) notes.push('item_id 为空 → 详情页链接 404');
    const cat = pageOfCategory(f.category);
    if (f.category && !cat.standard) notes.push(`分类「${f.category}」不是标准 → 归入【${cat.page}】`);
    if (!f.img_file) notes.push('img_file 为空 → 显示占位图');
    if (!f.reason_zh && !f.reason_en) notes.push('reason_zh/reason_en 为空 → 卡片无"情报理由"行');
    if (!f.listed_at) notes.push('listed_at 为空 → 卡片无"X 小时前上架"');
    if (!f.previous_price) notes.push('previous_price 为空 → 不参与"降价"自动情报（正常，除非这件降过价）');
    const shown = isPublic && (f.title_zh || f.title_en);
    if (shown) byPage[cat.page] = (byPage[cat.page] || 0) + 1;
    return {
      record_id: rec.id, item_id: normHyphen(f.item_id || ''), title: f.title_zh || f.title_en || '(无标题)',
      status: f.status || '', category: f.category || '', shows_on_page: shown ? cat.page : null,
      public: !!shown, problems, notes,
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
        rows: rawI.length,
        public_rows: ok.length,
        note: 'Intel 表是"人工覆盖"，只填想覆盖自动情报的 type；不填的 type 由代理自动生成',
        types_in_use: [...new Set(ok.map(r => r.type))],
      };
    } catch (e) {
      intel = { error: '读取 Intel 表失败：' + e.message };
    }
  }

  // 自动情报预览
  const publicItems = toPublicItems(raw);
  const autoIntel = buildAutoIntel(publicItems);

  return {
    generated_at: new Date().toISOString(),
    summary: { total_records: records.length, public_records: records.filter(r => r.public).length, by_category_page: byPage },
    auto_intel_preview: autoIntel,
    hint: 'auto_intel_preview = 代理根据 antiques 表现状自动生成的情报；Intel 表里同 type 的人工记录会覆盖它。',
    records, sellers, intel,
  };
}

// ---------- 内存缓存 ----------
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
      catch (e) { console.warn('[airtable-proxy] 读取 sellers 表失败，沿用上次：', e.message); }
    } else {
      sellers = [];
    }

    let intel = cache.intel;
    if (INTEL_TABLE) {
      try { intel = toPublicIntel(await fetchAllRecords(INTEL_TABLE)); }
      catch (e) { console.warn('[airtable-proxy] 读取 Intel 表失败，沿用上次：', e.message); }
    } else {
      intel = [];
    }

    // ?? 关键：合并自动 + 人工（人工优先）
    const autoIntel = buildAutoIntel(items);
    const mergedIntel = mergeIntel(autoIntel, intel);

    cache = { items, sellers, intel: mergedIntel, at: Date.now() };
    return { items, sellers, intel: mergedIntel, stale: false };
  } catch (e) {
    if (cache.items && now - cache.at < STALE_MS) {
      console.warn('[airtable-proxy] 上游失败，回退到缓存：', e.message);
      return { items: cache.items, sellers: cache.sellers, intel: cache.intel, stale: true };
    }
    throw e;
  }
}

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