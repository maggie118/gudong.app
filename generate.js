const fs = require('fs');
const path = require('path');

const itemsDir = path.join(__dirname, 'items');
if (!fs.existsSync(itemsDir)) fs.mkdirSync(itemsDir);

async function fetchAllItems() {
  try {
    const res = await fetch("https://gudong.app/api/airtable-proxy");
    const data = await res.json();
    return [...data.todayFinds, ...data.editorPicks, ...data.newListing];
  } catch(e) {
    // 内置演示降级数据
    return [
      {
        item_id:"item-lim-01",
        title_zh:"大明宣德青花描金云龙纹扁瓶",
        title_en:"Ming Xuande Blue-and-Gold Dragon Flat Vase",
        category:"瓷器",
        era_zh:"明宣德",
        era_en:"Ming Xuande",
        price_display_zh:"S$58000",
        price_display_en:"S$58,000",
        img_file:"item-lim-01.jpg",
        desc_zh:"此件扁瓶，青花加描金工艺，云龙纹饰，器型规整，品相完整。",
        desc_en:"Flat vase, blue-and-white with gilded dragon motif, well-preserved.",
        seller_id:"lim-kee-whee",
        seller_name_en:"Lim Kee Whee",
        seller_whatsapp:"6512345678",
        is_today_finds:true,
        is_editor_picks:true
      },
      {
        item_id:"item-lim-02",
        title_zh:"战国青铜错金乳钉双耳四足方鼎",
        title_en:"Warring-States Bronze Gold-inlaid Quadripod Ding",
        category:"铜器",
        era_zh:"战国",
        era_en:"Warring States",
        price_display_zh:"S$42000",
        price_display_en:"S$42,000",
        img_file:"item-lim-02.jpg",
        desc_zh:"战国青铜方鼎，错金乳钉纹饰，双耳四足，包浆浑厚。",
        desc_en:"Warring-States bronze ding, gold-inlaid studs, four-legs, rich patina.",
        seller_id:"lim-kee-whee",
        seller_name_en:"Lim Kee Whee",
        seller_whatsapp:"6512345678",
        is_today_finds:false,
        is_editor_picks:false
      },
      {
        item_id:"item-lim-03",
        title_zh:"战国错金银青铜瑞兽摆件",
        title_en:"Warring-States Gold-Silver Inlaid Bronze Beast",
        category:"铜器",
        era_zh:"战国",
        era_en:"Warring States",
        price_display_zh:"S$36000",
        price_display_en:"S$36,000",
        img_file:"item-lim-03.jpg",
        desc_zh:"错金银青铜瑞兽，造型生动，金银纹饰保存较好。",
        desc_en:"Bronze beast inlaid gold-silver, vivid modelling.",
        seller_id:"lim-kee-whee",
        seller_name_en:"Lim Kee Whee",
        seller_whatsapp:"6512345678",
        is_today_finds:false,
        is_editor_picks:false
      },
      {
        item_id:"item-lim-04",
        title_zh:"大清雍正年制款窑变釉贯耳瓶",
        title_en:"Yongzheng Flambe-glaze Vase",
        category:"瓷器",
        era_zh:"清雍正",
        era_en:"Qing Yongzheng",
        price_display_zh:"S$49000",
        price_display_en:"S$49,000",
        img_file:"item-lim-04.jpg",
        desc_zh:"窑变釉贯耳瓶，釉色变化丰富，带雍正款识。",
        desc_en:"Flambe-glaze vase with Yongzheng mark, rich glaze variations.",
        seller_id:"lim-kee-whee",
        seller_name_en:"Lim Kee Whee",
        seller_whatsapp:"6512345678",
        is_today_finds:false,
        is_editor_picks:false
      }
    ]
  }
}

function buildDetailHTML(item) {
  const imgSrc = `/assets/images/${item.img_file}`;
  let badgeHtml = "";
  if(item.is_today_finds) badgeHtml += `<span class="badge badge-top">今日发现置顶</span>`;
  if(item.is_editor_picks) badgeHtml += `<span class="badge badge-editor">编辑精选</span>`;

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${item.title_zh} | 古董圈</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site-header">
  <a href="/">← 返回首页</a>
</header>
<main class="item-detail">
  <div class="detail-image">
    ${badgeHtml}
    <img src="${imgSrc}" alt="${item.title_zh}" loading="lazy">
  </div>
  <div class="detail-info">
    <h1>${item.title_zh}</h1>
    <h2 class="en-title">${item.title_en}</h2>
    <div class="meta-row">
      <span>年代：${item.era_zh}</span>
      <span>${item.era_en}</span>
    </div>
    <div class="meta-row">分类：${item.category}</div>
    <div class="price-block">
      <p class="price-cn">${item.price_display_zh}</p>
      <p class="price-en">${item.price_display_en}</p>
    </div>
    <hr/>
    <div class="desc-block">
      <h3>藏品描述</h3>
      <p>${item.desc_zh}</p>
      <p class="en-desc">${item.desc_en}</p>
    </div>
    <div class="seller-block">
      <h3>卖家信息</h3>
      <p>卖家：${item.seller_name_en}</p>
      <p>WhatsApp：<a href="https://wa.me/${item.seller_whatsapp}">${item.seller_whatsapp}</a></p>
      <p><a href="/sellers/index.html?seller_id=${item.seller_id}">进入卖家展馆</a></p>
    </div>
  </div>
</main>
</body>
</html>`;
}

async function run() {
  const items = await fetchAllItems();
  const uniqueItems = Array.from(new Map(items.map(i => [i.item_id, i])).values());

  uniqueItems.forEach(item => {
    const html = buildDetailHTML(item);
    const filePath = path.join(itemsDir, `${item.item_id}.html`);
    fs.writeFileSync(filePath, html, "utf8");
    console.log("✅ 已生成：", filePath);
  });
  console.log("✅ 全部详情页生成完毕");
}

run().catch(console.error);
