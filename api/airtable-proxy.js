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

// 把 Airtable 的一条 record 转成前端期望的字段格式。
function mapRecordToItem(record) {
  const f = record.fields || {};

  // 支持 Airtable 原生「附件 Attachment」字段：直接拿它给的真实图片URL
  const attachment = Array.isArray(f['照片']) && f['照片'][0];
  const img_url = attachment ? attachment.url : undefined;

  return {
    item_id: slugify(f['item_id'] || f['编号'] || record.id),
    title_zh: f['标题'] || f['title_zh'] || '',
    title_en: f['标题(英)'] || f['title_en'] || '',
    era_zh: f['年代'] || '',
    era_en: f['era_en'] || '',
    category: f['品类'] || f['category'] || '杂项',
    price_display_zh: f['价格显示'] || f['price_zh'] || '',
    price_display_en: f['价格显示(英)'] || f['price_en'] || '',
    seller: f['卖家'] || f['seller'] || '',
    img_url,                       // Airtable 附件的真实URL（优先使用）
    img_file: f['本地图片文件名'] || undefined, // 备用：本地 /assets/images/ 下的文件名
    // 复选框：不再要求列名完全等于「今日发现置顶」「编辑精选」
    is_today_finds: checkboxOn(f, '今日发现', ['今日发现置顶', "today's finds", 'is_today_finds']),
    is_editor_picks: checkboxOn(f, '编辑精选', ["editor's picks", 'is_editor_picks']),
  };
}

function slugify(v) {
  return String(v)
    .trim()
    .toLowerCase()
    // U+2011 不换行连字符等特殊连字符 → 普通连字符，保证与站点文件名一致
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFF0D]/g, '-')
    .replace(/\s+/g, '-');
}
