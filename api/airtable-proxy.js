const Airtable = require('airtable');

const base = new Airtable({apiKey: process.env.AIRTABLE_TOKEN}).base(process.env.AIRTABLE_BASE_ID);
const table = base('antiques');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const records = await table.select({
      filterByFormula: "{status}='active'"
    }).all();

    // 统一格式化字段
    const allItems = records.map(r => ({
      id: r.id,
      item_id: r.fields.item_id || "",
      title_zh: r.fields.title_zh || "",
      title_en: r.fields.title_en || "",
      category: r.fields.category || "",
      era_zh: r.fields.era_zh || "",
      era_en: r.fields.era_en || "",
      price_display_zh: r.fields.price_display_zh || "",
      price_display_en: r.fields.price_display_en || "",
      img_file: r.fields.img_file || "",
      desc_zh: r.fields.desc_zh || "",
      desc_en: r.fields.desc_en || "",
      seller_id: r.fields.seller_id || "",
      seller_name_en: r.fields.seller_name_en || "",
      is_today_finds: r.fields.is_today_finds || false,
      is_editor_picks: r.fields.is_editor_picks || false,
      is_new_listing: r.fields.is_new_listing || false
    }));

    // 今日发现：置顶在前，其余随机
    const topToday = allItems.filter(x => x.is_today_finds);
    const normalToday = shuffleArray(allItems.filter(x => !x.is_today_finds));
    const todayFinds = [...topToday, ...normalToday].slice(0,8);

    // 编辑精选
    const editorPicks = allItems.filter(x => x.is_editor_picks);

    // 最新上架，随机打乱
    const newListing = shuffleArray(allItems.filter(x => x.is_new_listing));

    return res.status(200).json({
      todayFinds,
      editorPicks,
      newListing
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({error: "读取藏品失败"});
  }
}

// 工具函数：数组随机打乱
function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
