// /api/airtable-proxy.js
// 部署在 Vercel 上的 Serverless Function，供 index.html / expert-picks.html /
// sellers/*.html 里的前端 fetch('/api/airtable-proxy') 调用。
//
// ⚠️ 需要在 Vercel 环境变量里配置（Settings → Environment Variables）：
//   AIRTABLE_TOKEN   = Airtable Personal Access Token（Developer hub 生成，scope: data.records:read）
//   AIRTABLE_BASE_ID = appXXXXXXXXXXXXXX
//   AIRTABLE_TABLE   = Items（按实际表名）
// 未配置时本接口返回 501，前端自动退回静态后备内容。
//
// 2026-09-13 二次修复（首页图片全碎 / era、seller 字段为空）：
//   上一版把字段名映射误写成了中文列名（本地图片文件名 / 年代 / 卖家），
//   但 Airtable 表里实际是英文蛇形命名（img_file / era_zh / seller_id /
//   title_zh / title_en / price_zh / price_en / desc_zh / desc_en …），
//   导致 img_file 读不到 → 卡片图片全部 404，era/seller 也全是空。
//   现改为「英文列名优先 + 中文列名兜底」（pick 函数），并补上 seller_id、
//   desc_zh/desc_en、seller_name_en、seller_whatsapp、status 字段。
//
// 2026-09-13 修复（针对卖家 lim-kee-whee 首页不显示的问题）：
//   1. 复选框字段名不再要求精确匹配「今日发现置顶」「编辑精选」，
//      改为「别名 + 名称包含关键词」匹配（如「今日发现」「编辑精选（付费）」等都能识别），
//      避免 Airtable 列名稍有出入就整体读不到。
//   2. 「最新上架」过滤掉完全没有标题和图片的空记录（此前 Airtable 里的空行
//      会在首页渲染成 3 张空白卡片，把真正的藏品挤到后面）。
//   3. 「最新上架」按 createdTime 倒序（真正的新品在前），最多返回 12 条。
//   4. slugify 把 U+2011 等特殊连字符统一转成普通 "-"，
//      保证生成的 /items/item-lim-01.html 链接与站点实际文件名一致。
//   5. 响应新增 airtableFields（仅列名，不含数据），用于线上排查列名是否对得上。

export default async function handler(req, res) {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE) {
    res.status(501).json({
      error: 'Airtable 环境变量未配置（AIRTABLE_TOKEN / AIRTABLE_BASE_ID / AIRTABLE_TABLE），接口暂不可用，前端会使用静态后备内容。'
    });
    return;
  }

  try {
    const records = await fetchAllRecords(AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE);
    const items = records
      .map(mapRecordToItem)
      // createdTime 一起带出来用于「最新上架」排序
      .map((item, idx) => ({ ...item, _createdTime: records[idx].createdTime || '' }));

    // img_file 若是不带目录的裸文件名（如 item-lim-01.jpg），自动探测出正确的子目录，
    // 避免前端拼出 /assets/images/item-lim-01.jpg（实际文件在 /assets/images/lim-kw/ 下）
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    await Promise.all(items.map(async i => {
      i.img_file = await resolveImgFile(proto, host, i.img_file, i.seller_id);
    }));

    // 完全没有标题和图片的空记录：从「最新上架」里剔除
    const filled = items.filter(i => i.title_zh || i.title_en || i.img_url || i.img_file);

    const payload = {
      todayFinds: items.filter(i => i.is_today_finds),
      editorPicks: items.filter(i => i.is_editor_picks),
      newListing: filled
        .slice()
        .sort((a, b) => String(b._createdTime).localeCompare(String(a._createdTime)))
        .slice(0, 12)
        .map(({ _createdTime, ...rest }) => rest),
      // 调试信息：Airtable 表里实际出现的所有列名（去重，仅列名不含数据）
      airtableFields: [...new Set(records.flatMap(r => Object.keys(r.fields || {})))],
    };

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json(payload);
  } catch (err) {
    console.error('Airtable fetch failed:', err);
    res.status(502).json({ error: '读取 Airtable 失败', detail: String(err && err.message || err) });
  }
}

// 翻页读取 Airtable 表里所有记录
async function fetchAllRecords(token, baseId, table) {
  let records = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      throw new Error(`Airtable API ${resp.status}: ${await resp.text()}`);
    }
    const json = await resp.json();
    records = records.concat(json.records || []);
    offset = json.offset;
  } while (offset);

  return records;
}

// 在一条记录的所有字段里找「名字含关键词 / 命中别名」的字段，并判断它是否算勾选。
// 兼容：复选框 true、字符串 "true"/"是"/"已购" 等非空值、链接记录/多选数组非空。
function checkboxOn(fields, keyword, aliases = []) {
  for (const key of Object.keys(fields)) {
    const k = String(key).trim();
    const hit = aliases.includes(k) || k.includes(keyword);
    if (!hit) continue;
    const v = fields[key];
    if (v === true) return true;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s && s.toLowerCase() !== 'false' && s !== '否' && s !== '否') return true;
    }
    if (Array.isArray(v) && v.length > 0) return true;
  }
  return false;
}

// 按顺序返回第一个「有值」的字段（跳过 undefined / null / 空字符串）。
// 用途：Airtable 表里同一含义的列名可能是英文蛇形（img_file）也可能是中文（本地图片文件名），
// 两种命名都支持，避免列名对不上导致整列读空。
function pick(f, ...keys) {
  for (const k of keys) {
    const v = f[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// 把 Airtable 的一条 record 转成前端期望的字段格式。
// ⚠️ 字段名必须与 Airtable 表里实际列名一致（当前表用的是英文蛇形命名：
//    item_id / title_zh / era_zh / category / price_zh / img_file / seller_id ...），
//    中文列名保留为兜底，兼容早期版本的表。
function mapRecordToItem(record) {
  const f = record.fields || {};

  // 支持 Airtable 原生「附件 Attachment」字段：直接拿它给的真实图片URL
  const attachment = Array.isArray(f['照片']) && f['照片'][0];
  const img_url = attachment ? attachment.url : undefined;

  const seller_id = pick(f, 'seller_id', '卖家', 'seller');

  return {
    item_id: slugify(pick(f, 'item_id', '编号') || record.id),
    title_zh: pick(f, 'title_zh', '标题') || '',
    title_en: pick(f, 'title_en', '标题(英)') || '',
    era_zh: pick(f, 'era_zh', '年代') || '',
    era_en: pick(f, 'era_en', '年代(英)') || '',
    category: pick(f, 'category', '品类') || '杂项',
    price_display_zh: String(pick(f, 'price_zh', '价格显示') || ''),
    price_display_en: String(pick(f, 'price_en', '价格显示(英)') || ''),
    desc_zh: pick(f, 'desc_zh', '描述') || '',
    desc_en: pick(f, 'desc_en', '描述(英)') || '',
    seller: seller_id || '',
    seller_id: seller_id || '',   // 卖家展馆页按 f.seller_id 筛选
    seller_name_en: pick(f, 'seller_name_en') || '',
    seller_whatsapp: pick(f, 'seller_whatsapp') || '',
    status: pick(f, 'status') || '',
    img_url,                              // Airtable 附件的真实图片URL（优先使用）
    img_file: pick(f, 'img_file', '本地图片文件名') || undefined, // 本地 /assets/images/ 下的相对路径，如 lim-kw/item-lim-01.jpg
    // 复选框：不再要求列名完全等于「今日发现置顶」「编辑精选」
    is_today_finds: checkboxOn(f, '今日发现', ['今日发现置顶', "today's finds", 'is_today_finds']),
    is_editor_picks: checkboxOn(f, '编辑精选', ["editor's picks", 'is_editor_picks']),
  };
}

// 前端拼图片地址的规则是 '/assets/images/' + img_file。
// 如果 Airtable 里 img_file 只写了文件名（不含 '/'），需要自动补上子目录。
// 探测顺序：<seller_id>/<文件名>（未来多卖家时的约定）→ lim-kw/<文件名>（当前站点实际目录）。
// 探测结果按文件名缓存在模块级 Map 里，热实例内不会重复请求。
const IMG_DIR_CACHE = new Map();

async function resolveImgFile(proto, host, img_file, seller_id) {
  if (!img_file || img_file.includes('/') || !host) return img_file;
  if (IMG_DIR_CACHE.has(img_file)) return IMG_DIR_CACHE.get(img_file);

  const candidates = [];
  if (seller_id) candidates.push(`${seller_id}/${img_file}`);
  candidates.push(`lim-kw/${img_file}`);

  for (const c of candidates) {
    try {
      const r = await fetch(`${proto}://${host}/assets/images/${c}`, { method: 'HEAD' });
      if (r.ok) {
        IMG_DIR_CACHE.set(img_file, c);
        return c;
      }
    } catch {
      // 探测失败不影响主流程，继续尝试下一个候选
    }
  }

  IMG_DIR_CACHE.set(img_file, img_file);
  return img_file;
}

function slugify(v) {
  return String(v)
    .trim()
    .toLowerCase()
    // U+2011 不换行连字符等特殊连字符 → 普通连字符，保证与站点文件名一致
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g, '-')
    .replace(/\s+/g, '-');
}
