// /api/airtable-proxy.js
// 部署在 Vercel 上的 Serverless Function，供 index.html / expert-picks.html /
// sellers/*.html 里的前端 fetch('/api/airtable-proxy') 调用。
//
// ⚠️ 重要：Airtable 的「邀请协作者」链接（invite link）只是让人类账号加入 Base 的邀请，
// 不能当作 API 凭证使用，程序里也没法用它来读数据。要让 Airtable 真正在网站里跑起来，
// 需要下面这三样东西（都在 Airtable 网站上自己生成，不要发到聊天里，直接填进 Vercel 后台）：
//
//   1. Personal Access Token（个人访问令牌）
//      Airtable 右上角头像 → Developer hub → Personal access tokens → Create new token
//      Scope 至少勾选：data.records:read
//      Access 里选中你要用的这个 Base（就是邀请链接对应的那个 Base）
//
//   2. Base ID（形如 appXXXXXXXXXXXXXX）
//      打开这个 Base → Help → API documentation，页面顶部就会显示 Base ID
//
//   3. 表名/视图名（比如 "Items" 这张表，以及要读取哪个 View）
//
// 拿到以上信息后，在 Vercel 项目 → Settings → Environment Variables 里新增：
//   AIRTABLE_TOKEN   = 你的 Personal Access Token
//   AIRTABLE_BASE_ID = appXXXXXXXXXXXXXX
//   AIRTABLE_TABLE   = Items   (按你实际表名改)
// 保存后重新部署（redeploy），这个接口才会真正读到 Airtable 里的数据。
// 在没配置这三个环境变量之前，本接口会直接返回 501，前端会自动退回到页面里写死的静态内容——
// 这就是目前 Airtable"没有真正工作"的原因：接口还没有凭证可用。

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
    const items = records.map(mapRecordToItem);

    const payload = {
      todayFinds: items.filter(i => i.is_today_finds),
      editorPicks: items.filter(i => i.is_editor_picks),
      newListing: items,
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

// 把 Airtable 的一条 record 转成前端期望的字段格式。
// 请根据你 Airtable 表里实际的列名调整下面 f['...'] 里的名字。
function mapRecordToItem(record) {
  const f = record.fields || {};

  // 支持 Airtable 原生「附件 Attachment」字段：直接拿它给的真实图片URL，
  // 这样就不用手动把图片文件传去 /assets/images/ 再对文件名，从根本上避免文件名对不上、图片显示不出来的问题。
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
    is_today_finds: !!f['今日发现置顶'],
    is_editor_picks: !!f['编辑精选'],
  };
}

function slugify(v) {
  return String(v).trim().toLowerCase().replace(/\s+/g, '-');
}