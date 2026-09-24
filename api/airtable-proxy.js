// /api/airtable-proxy.js
// Vercel Serverless Function — 读取 Airtable 真实数据（公开只读接口）
// 环境变量：AIRTABLE_BASE_ID / AIRTABLE_TABLE / AIRTABLE_TOKEN
//
// 2026-09-19 加固（相对上一版）：
//  1. 只公开 status === 'active' 的记录。原逻辑「缺省视为 active、只排除 archived/deleted」，
//     会让 draft / pending / 未审核的表单提交直接上线。（与 generate.js 的口径一致）
//  2. 字段白名单。原逻辑是「除 校验_ 前缀外全部输出」，以后在 Airtable 新增的内部字段
//     （底价、备注、成本……）会被自动公开。新增公开字段时，在 PUBLIC_FIELDS 里加一行即可。
//  3. 不再把 Airtable 的错误原文 / 缺失的环境变量名返回给访客，只写服务端日志。
//  4. 内存缓存 + 上游故障时回退到最近一次成功的数据（stale-if-error），
//     并让 ?v=随机数 之类的缓存穿透请求不会反复打到 Airtable（限流 5 次/秒/base）。
//  5. 上游请求 8 秒超时；只允许 GET / HEAD / OPTIONS；q / cat 参数做长度与取值限制。
//  6. 卖家真实姓名（seller_name_zh / seller_name_en）不再对外输出，也不参与搜索；
//     网页上的卖家名一律来自「卖家展馆名」——见下方 sellers 表（可选）。
//
// 2026-09-21 更新：
//  7. PUBLIC_FIELDS 增加规格字段（dimensions / weight / condition_zh / condition_en /
//     has_surface_wear / has_surface_damage），用于详情页「藏品规格」表格。
//  8. SELLER_PUBLIC_FIELDS 增加 page_url，用于详情页卖家卡的「查看全部藏品」链接。
//
// 排查「某条记录为什么没出现在网站上」：设置环境变量 AIRTABLE_DEBUG_KEY（自己定一个长随机串），
// 然后访问  /api/airtable-proxy?debug=<你的密钥>  ，会逐条列出每条记录是否公开、被排除的原因、
// 会出现在哪个品类页、以及缺图 / 缺价格 / 缺 seller 等问题。不设置该变量则此功能关闭。
//
// 可选环境变量：AIRTABLE_SELLERS_TABLE —— 卖家表的表名（如 sellers）。未设置时 sellers 返回 []，
// 页面回退到写在 HTML 里的展馆名。sellers 表字段：seller_id / display_zh / display_en /
// since_year / intro_zh / intro_en / page_url / status；真实姓名请放在 real_name 之类的字段，不在白名单里，永不输出。

const BASE  = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE;
const TOKEN = process.env.AIRTABLE_TOKEN;
const SELLERS_TABLE = process.env.AIRTABLE_SELLERS_TABLE;   // 可选
const DEBUG_KEY = process.env.AIRTABLE_DEBUG_KEY;           // 可选：排查用密钥

/* 只公开 status 为下列值的记录 */
const PUBLIC_STATUSES = ['active'];

/* 对外公开的字段白名单（item_id / _createdTime 始终输出）。
   img_url（Airtable 附件）刻意不在列表里：附件链接约 2 小时后失效，图片请放 assets/images/ 并填 img_file。 */
const PUBLIC_FIELDS = [
  // 标题 / 描述 / 分类
  'title_zh', 'title_en', 'desc_zh', 'desc_en', 'era_zh', 'era_en', 'category',
  'material_zh', 'material_en', 'kiln_zh', 'kiln_en', 'mark_zh', 'mark_en', 'certificate_no', 'tags',
  // 规格（2026-09-21 新增）
  'dimensions', 'weight', 'condition_zh', 'condition_en', 'has_surface_wear', 'has_surface_damage',
  // 价格（一口价 / 价格区间 / 私聊询价）
  'price_type', 'fixed_price', 'price_zh', 'price_en', 'price_display_zh', 'price_display_en',
  // 图片
  'img_file',
  // 卖家（seller_id 是站内别名，不要用真实姓名；真实姓名字段 seller_name_* 刻意不公开）
  'seller_id', 'seller_whatsapp',
  // 展示位 / 状态
  'is_today_finds', 'is_editor_picks', 'is_new_listing', 'status',
];

/* ?? 2026-09-19：Unicode 连字符归一化
   Airtable 数据在录入/复制粘贴时混入了 U+2011（非断行连字符）等变体，
   导致 item_id 对不上静态页文件名（ASCII '-'）、图片路径 404。统一归一化为 ASCII '-'。 */
const HYPHEN_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g;
function normHyphen(v) {
  if (typeof v !== 'string') return v;
  return v.replace(HYPHEN_VARIANTS, '-').trim();
}

/* sellers 表对外公开的字段白名单（2026-09-21 增加 page_url） */
const SELLER_PUBLIC_FIELDS = ['seller_id', 'display_zh', 'display_en', 'since_year', 'intro_zh', 'intro_en', 'page_url'];

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

// ---------- 清洗：状态过滤 + 字段白名单 ----------
function toPublicItems(rawRecords) {
  return rawRecords
    .filter(rec => PUBLIC_STATUSES.includes(String((rec.fields && rec.fields.status) || '').trim().toLowerCase()))
    .map(rec => {
      const out = {
        item_id: normHyphen((rec.fields && rec.fields.item_id) || rec.id),   // 优先用字段里的 item_id
        _createdTime: rec.createdTime,
      };
      for (const k of PUBLIC_FIELDS) {
        if (rec.fields[k] !== undefined && rec.fields[k] !== null && rec.fields[k] !== '') out[k] = rec.fields[k];
      }
      if (out.seller_id) out.seller_id = normHyphen(out.seller_id);
      if (out.img_file)  out.img_file  = normHyphen(out.img_file);
      return out;
    })
    .sort((a, b) => String(b._createdTime || '').localeCompare(String(a._createdTime || '')));   // 新的在前
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
    .filter(s => s.seller_id && (s.display_zh || s.display_en));    // 没有展馆名的行不输出
}

// ---------- 排查报告（需要 AIRTABLE_DEBUG_KEY）----------
function pageOfCategory(c) {                      // 与前端 gudong-data.js 的 catKey 保持一致
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
    const problems = [];      // 导致「不公开」或「前端不显示」的原因
    const notes = [];         // 会显示，但值得注意
    if (!isPublic) problems.push(status ? `status=「${f.status}」→ 不公开（只有 active 才公开）` : 'status 为空 → 不公开（必须填 active）');
    if (!f.title_zh && !f.title_en) problems.push('title_zh 与 title_en 都为空 → 前端会丢弃这条记录');
    if (!f.item_id) notes.push('item_id 为空 → 用记录 ID 代替，详情页链接会 404');
    const cat = pageOfCategory(f.category);
    if (f.category && !cat.standard) notes.push(`分类「${f.category}」不是标准分类 → 按关键词归入【${cat.page}】页`);
    if (!f.category) notes.push('category 为空 → 归入【杂项】页');
    if (!f.img_file) notes.push('img_file 为空 → 显示占位图');
    const type = String(f.price_type || '').trim();
    if (/一口价|fixed/i.test(type) && !(Number(f.fixed_price) > 0)) notes.push('价格类型是一口价，但 fixed_price 为空 → 退回显示 price_display_* / price_*');
    if (!type && !f.fixed_price && !f.price_display_zh && !f.price_zh) notes.push('没有任何价格字段 → 显示「私聊询价」');
    if (!f.seller_id) notes.push('seller_id 为空 → 不会出现在任何卖家展馆页');
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
    const okIds = new Set(ok.map(s => s.seller_id));
    const itemSellerIds = [...new Set(raw.filter(rec => PUBLIC_STATUSES.includes(String((rec.fields || {}).status || '').trim().toLowerCase()) && rec.fields.seller_id).map(rec => normHyphen(rec.fields.seller_id)))];
    sellers = {
      rows: rawS.length, public_rows: ok.length,
      rows_not_public: rawS.filter(r => { const f = r.fields || {}; return !(PUBLIC_STATUSES.includes(String(f.status || '').trim().toLowerCase()) && f.seller_id && (f.display_zh || f.display_en)); })
        .map(r => ({ record_id: r.id, seller_id: (r.fields || {}).seller_id || '', why: '需要 status=active，并且 seller_id 与 display_zh / display_en 至少一个不为空' })),
      item_seller_ids_without_public_seller_row: itemSellerIds.filter(id => !okIds.has(normHyphen(id))),
    };
  }
  return {
    generated_at: new Date().toISOString(),
    summary: { total_records: records.length, public_records: records.filter(r => r.public).length, by_category_page: byPage },
    hint: '每条记录的 problems = 为什么没出现；notes = 会出现但有需要注意的地方。修改 Airtable 后，网站最多约 2 分钟内更新。',
    records, sellers,
  };
}

// ---------- 内存缓存（同一个函数实例内有效） ----------
const FRESH_MS = 30 * 1000;          // 30 秒内直接用缓存，不打 Airtable
const STALE_MS = 60 * 60 * 1000;     // 上游故障时，最长回退 1 小时内的旧数据
let cache = { items: null, sellers: [], at: 0 };

async function getData() {
  const now = Date.now();
  if (cache.items && now - cache.at < FRESH_MS) return { items: cache.items, sellers: cache.sellers, stale: false };
  try {
    const items = toPublicItems(await fetchAllRecords(TABLE));
    // 卖家表是可选的，读取失败不影响藏品：沿用上一次的卖家数据
    let sellers = cache.sellers;
    if (SELLERS_TABLE) {
      try { sellers = toPublicSellers(await fetchAllRecords(SELLERS_TABLE)); }
      catch (e) { console.warn('[airtable-proxy] 读取 sellers 表失败，沿用上次数据：', e.message); }
    } else {
      sellers = [];
    }
    cache = { items, sellers, at: Date.now() };
    return { items, sellers, stale: false };
  } catch (e) {
    if (cache.items && now - cache.at < STALE_MS) {
      console.warn('[airtable-proxy] 上游失败，回退到缓存：', e.message);
      return { items: cache.items, sellers: cache.sellers, stale: true };
    }
    throw e;
  }
}

export default async function handler(req, res) {
  // ---------- CORS ----------
  /* 同源 GET 请求浏览器不发送 Origin 头：无 Origin → 放行；
     有 Origin 且在白名单（含本地开发）→ 放行并回 CORS 头；有 Origin 但不在白名单 → 403。 */
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

  // ---------- 环境变量检查（细节只写日志，不对外泄露） ----------
  if (!BASE || !TABLE || !TOKEN) {
    console.error('[proxy] env missing', { AIRTABLE_BASE_ID: !!BASE, AIRTABLE_TABLE: !!TABLE, AIRTABLE_TOKEN: !!TOKEN });
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // ---------- 排查模式（key 不对就当作普通请求，不暴露该功能是否开启） ----------
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

  // ---------- 查询参数（前端目前未使用，保留；做长度与取值限制） ----------
  const q   = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
  const cat = String(req.query.cat || 'all').trim();

  try {
    const { items: all, sellers, stale } = await getData();
    let items = all;

    // ---------- 关键词搜索（覆盖全部公开字段里的文本） ----------
    if (q) {
      items = items.filter(f => [
        f.title_zh, f.title_en, f.desc_zh, f.desc_en, f.era_zh, f.era_en, f.category,
        f.material_zh, f.material_en, f.kiln_zh, f.kiln_en, f.mark_zh, f.mark_en,
        f.certificate_no, f.tags,
      ].filter(Boolean).join(' ').toLowerCase().includes(q));
    }

    // ---------- 分类过滤（与 pageOfCategory 一致：标准 alias 才生效，未知值放行全集）----------
    const resolvedCat = cat !== 'all' ? pageOfCategory(cat) : null;
    if (resolvedCat && resolvedCat.standard) {
      const target = resolvedCat.page;
      items = items.filter(f => pageOfCategory(f.category).page === target);
    }

    // ---------- 输出 ----------
    // 回退到旧数据时缩短缓存，让 CDN 尽快重新向我们要新数据
    res.setHeader('Cache-Control', stale ? 'public, s-maxage=10' : 's-maxage=30, stale-while-revalidate=60');
    if (stale) res.setHeader('X-Data-Stale', '1');
    return res.status(200).json({
      todayFinds:  items.filter(f => f.is_today_finds),
      editorPicks: items.filter(f => f.is_editor_picks),
      newListing:  items,          // 全集（含今日发现 / 编辑精选）
      sellers,                     // 卖家展馆名等（来自 sellers 表；未配置时为 []，页面回退到 HTML 里的展馆名）
      total:       items.length,
    });

  } catch (e) {
    console.error('[airtable-proxy]', e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Upstream failed' });
  }
}