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
// 可选环境变量：AIRTABLE_SELLERS_TABLE —— 卖家表的表名（如 sellers）。未设置时 sellers 返回 []，
// 页面回退到写在 HTML 里的展馆名。sellers 表字段：seller_id / display_zh / display_en /
// since_year / intro_zh / intro_en / status；真实姓名请放在 real_name 之类的字段，不在白名单里，永不输出。

const BASE  = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE;
const TOKEN = process.env.AIRTABLE_TOKEN;
const SELLERS_TABLE = process.env.AIRTABLE_SELLERS_TABLE;   // 可选

/* 只公开 status 为下列值的记录 */
const PUBLIC_STATUSES = ['active'];

/* 对外公开的字段白名单（item_id / _createdTime 始终输出）。
   img_url（Airtable 附件）刻意不在列表里：附件链接约 2 小时后失效，图片请放 assets/images/ 并填 img_file。 */
const PUBLIC_FIELDS = [
  // 标题 / 描述 / 分类
  'title_zh', 'title_en', 'desc_zh', 'desc_en', 'era_zh', 'era_en', 'category',
  'material_zh', 'material_en', 'kiln_zh', 'kiln_en', 'mark_zh', 'mark_en', 'certificate_no', 'tags',
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
   Airtable 数据在录入/复制粘贴时混入了 U+2011（? 非断行连字符）等变体，
   导致 item_id 对不上静态页文件名（ASCII '-'）、图片路径 404。统一归一化为 ASCII '-'。 */
const HYPHEN_VARIANTS = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g;
function normHyphen(v) {
  if (typeof v !== 'string') return v;
  return v.replace(HYPHEN_VARIANTS, '-').trim();
}

/* sellers 表对外公开的字段白名单 */
const SELLER_PUBLIC_FIELDS = ['seller_id', 'display_zh', 'display_en', 'since_year', 'intro_zh', 'intro_en'];

const CATEGORY_MAP = { porcelain: '瓷器', jade: '玉器', coins: '钱币', paintings: '书画', misc: '杂项' };

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

    // ---------- 分类过滤 ----------
    if (CATEGORY_MAP[cat]) items = items.filter(f => f.category === CATEGORY_MAP[cat]);

    // ---------- 输出 ----------
    // 回退到旧数据时缩短缓存，让 CDN 尽快重新向我们要新数据
    res.setHeader('Cache-Control', stale ? 'public, s-maxage=10' : 's-maxage=60, stale-while-revalidate=300');
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