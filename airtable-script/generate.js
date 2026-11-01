require('dotenv').config();
const Airtable = require('airtable');
const fs = require('fs');
const path = require('path');

// 配置读取
const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME;
const PROJECT_ROOT = path.resolve(process.env.PROJECT_ROOT);

const base = new Airtable({apiKey: API_KEY}).base(BASE_ID);

// 读取 item-template.html 模板（你的藏品详情模板）
const templatePath = path.join(PROJECT_ROOT, "items", "item-template.html");
const itemTemplate = fs.readFileSync(templatePath, "utf8");

// 输出目录：脚本内 output 文件夹，生成 txt 片段
const outputDir = path.join(__dirname, "output");
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
// items 输出目录，直接写入项目的 items 文件夹
const itemsOutDir = path.join(PROJECT_ROOT, "items");

function renderItemHtml(row) {
  let html = itemTemplate
    .replace(/\[REPLACE: Item Name\]/g, row.title_zh || "")
    .replace(/\[替换：藏品名称\]/g, row.title_zh || "")
    .replace(/\[替换：年代 · 品类，例如 清代 · 瓷器\]/g, `${row.era_zh || ""} · ${row.category || ""}`)
    .replace(/\[REPLACE: Era · Category, e.g. Qing Dynasty · Porcelain\]/g, `${row.era_en || ""} · ${row.category || ""}`)
    .replace(/\[替换：藏品中文名称\]/g, row.title_zh || "")
    .replace(/\[REPLACE: Item Name in English\]/g, row.title_en || "")
    .replace(/\[替换：价格，例如 S$8,000 或 价格面议\]/g, row.price_zh || "")
    .replace(/\[REPLACE: Price, e.g. S$8,000 or Price on Request\]/g, row.price_en || "")
    .replace(/\[替换：藏品描述 — 建议包含尺寸、材质、年代依据、来源、品相\/瑕疵说明等信息，越详细越有助于买家判断。\]/g, row.desc_zh || "")
    .replace(/\[REPLACE: Item description — include size, material, dating basis, provenance and condition notes. The more detail, the easier for buyers to assess.\]/g, row.desc_en || "")
    .replace(/\[替换：卖家WhatsApp号码，不含+号\]/g, row.seller_whatsapp || "")
    .replace(/\[REPLACE: seller WhatsApp number, no + sign\]/g, row.seller_whatsapp || "")
    .replace(/placeholder\.jpg/g, row.img_file || "placeholder.svg");
  return html;
}

// 卡片模板
function makeFindsCard(r) {
  const cls = r.is_today_finds ? "promoted" : "organic";
  const badgeZh = r.is_today_finds ? "付费置顶" : "系统推荐";
  const badgeEn = r.is_today_finds ? "Promoted" : "System Recommended";
  return `<a href="/items/${r.item_id}.html" class="finds-card finds-card--${cls}"><div class="finds-image"><img src="/assets/images/${r.img_file}" alt="${r.title_zh}"></div><div class="finds-title zh">${r.title_zh}</div><div class="finds-title en">${r.title_en}</div><div class="finds-meta zh">${r.era_zh} · ${r.category}</div><div class="finds-meta en">${r.era_en} · ${r.category}</div><div class="finds-price">${r.price_zh}</div><div class="finds-badge zh">${badgeZh}</div><div class="finds-badge en">${badgeEn}</div><div class="finds-caption zh">图片清晰 · 信息完整</div><div class="finds-caption en">Clear photos · Detailed listing</div></a>`;
}
function makeEditorCard(r) {
  return `<a href="/items/${r.item_id}.html" class="expert-mini-card"><div class="expert-mini-badge zh">编辑精选</div><div class="expert-mini-badge en">Editor's Pick</div><div class="expert-mini-title zh">${r.title_zh}</div><div class="expert-mini-title en">${r.title_en}</div><div class="expert-mini-sub zh">${r.era_zh} · ${r.category}</div><div class="expert-mini-sub en">${r.era_en} · ${r.category}</div></a>`;
}
function makeListItemCard(r) {
  return `<a href="/items/${r.item_id}.html" class="item-card" data-cat="${r.category}" data-keywords="${r.title_zh} ${r.title_en} ${r.era_zh}"><img src="/assets/images/${r.img_file}" alt="${r.title_zh}"><div class="price-tag zh">${r.price_zh}</div><div class="price-tag en">${r.price_en}</div></a>`;
}

async function main() {
  const records = [];
  await base(TABLE_NAME).select().eachPage((pageRecords, fetchNextPage) => {
    for (const rec of pageRecords) {
      const f = rec.fields;
      records.push({
        item_id: f.item_id || "",
        title_zh: f.title_zh || "",
        title_en: f.title_en || "",
        category: f.category || "",
        era_zh: f.era_zh || "",
        era_en: f.era_en || "",
        price_zh: f.price_zh || "",
        price_en: f.price_en || "",
        img_file: f.img_file || "placeholder.svg",
        desc_zh: f.desc_zh || "",
        desc_en: f.desc_en || "",
        seller_id: f.seller_id || "",
        seller_whatsapp: f.seller_whatsapp || "",
        seller_name_en: f.seller_name_en || "",
        is_today_finds: !!f.is_today_finds,
        is_editor_picks: !!f.is_editor_picks,
        is_new_listing: !!f.is_new_listing,
        status: f.status || "draft"
      });
    }
    fetchNextPage();
  });

  // 只拿 active 状态
  const active = records.filter(d => d.status === "active");
  console.log(`读取全部:${records.length}条，上线active:${active.length}条`);

  // 1. 今日发现
  const todayFinds = active.filter(r => r.is_today_finds);
  fs.writeFileSync(path.join(outputDir, "out-today-finds.txt"), todayFinds.map(makeFindsCard).join("\n"), "utf8");

  // 2. 编辑精选
  const editorPicks = active.filter(r => r.is_editor_picks);
  fs.writeFileSync(path.join(outputDir, "out-editor-picks.txt"), editorPicks.map(makeEditorCard).join("\n"), "utf8");

  // 3. 最新上架
  const newListing = active.filter(r => r.is_new_listing);
  fs.writeFileSync(path.join(outputDir, "out-new-listings.txt"), newListing.map(makeListItemCard).join("\n"), "utf8");

  // 4. 全部藏品
  fs.writeFileSync(path.join(outputDir, "out-all-items.txt"), active.map(makeListItemCard).join("\n"), "utf8");

  // 5. 按 seller_id 分组输出卖家展馆卡片示例：这里会输出全部卖家，你复制对应 seller 的片段粘贴进卖家展馆页面
  const sellerGroups = {};
  for (const r of active) {
    if (!r.seller_id) continue;
    if (!sellerGroups[r.seller_id]) sellerGroups[r.seller_id] = [];
    sellerGroups[r.seller_id].push(makeListItemCard(r));
  }
  for (const sid of Object.keys(sellerGroups)) {
    fs.writeFileSync(path.join(outputDir, `out-seller-${sid}.txt`), sellerGroups[sid].join("\n"), "utf8");
  }

  // 6. 生成每一个藏品详情 html 文件写入项目 items 文件夹
  for (const r of active) {
    if (!r.item_id) continue;
    const htmlOut = renderItemHtml(r);
    const outFile = path.join(itemsOutDir, `${r.item_id}.html`);
    fs.writeFileSync(outFile, htmlOut, "utf8");
    console.log("生成详情页：", outFile);
  }

  console.log("\n✅脚本执行完成！");
  console.log(`输出txt片段目录：${outputDir}`);
  console.log("👉操作：打开 output 文件夹，复制 txt 内 html 片段，粘贴替换对应页面容器");
  console.log("👉items 文件夹已经自动生成全部 active 藏品详情 html");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
