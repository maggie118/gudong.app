const fs = require('fs');
const path = require('path');

// 配置项
const TEMPLATE_PATH = path.join(__dirname, 'sellers', 'seller-template.html');
const OUTPUT_DIR = path.join(__dirname, 'sellers');

// 模拟读取Airtable卖家数据（正式上线替换为Airtable API读取）
const sellersList = [
  {
    seller_id: "lim-kee-whee",
    seller_name: "Lim Kee Whee",
    seller_wa: "6512345678",
    seller_bio: "专注高古青铜与明清瓷器，多年古董收藏经验。"
  },
  {
    seller_id: "cui-yuan",
    seller_name: "Cui Yuan",
    seller_wa: "6587654321",
    seller_bio: "主攻翡翠玉器、杂项，深耕东南亚古董市场。"
  },
  {
    seller_id: "han-bi-ge",
    seller_name: "Han Bi Ge",
    seller_wa: "6511223344",
    seller_bio: "书画、文房藏品专营，擅长近现代书画鉴赏。"
  }
];

// 读取模板文件
const templateHtml = fs.readFileSync(TEMPLATE_PATH, 'utf8');

// 循环生成每一个卖家展馆页面
sellersList.forEach(seller => {
  let pageContent = templateHtml
    .replace(/{{SELLER_ID}}/g, seller.seller_id)
    .replace(/{{SELLER_NAME}}/g, seller.seller_name)
    .replace(/{{SELLER_WA}}/g, seller.seller_wa)
    .replace(/{{SELLER_BIO}}/g, seller.seller_bio);

  const outputFileName = `seller-${seller.seller_id}.html`;
  const outputFilePath = path.join(OUTPUT_DIR, outputFileName);

  fs.writeFileSync(outputFilePath, pageContent, 'utf8');
  console.log(`? 已生成：${outputFileName}`);
});

console.log("\n?? 全部卖家展馆页面生成完成！");
