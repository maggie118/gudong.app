#!/usr/bin/env node
/**
 * fix-template-prefixes.js — 修正 templates/article.html 中缺失的 ../ 前缀
 *
 * 背景：模板的「浏览板块/FAQ」区块与动态卡片脚本是从首页复制的，链接按
 * 站点根相对书写（collection.html、items/${...}、assets/images/... 等）。
 * 但 build-insights.js 是纯占位符替换、产物写入 insights/（距根一层），
 * 这些链接在生成的文章页里全部 404。历史上有 17 页因同样问题用了 ../../../。
 *
 * 规则：给所有指向站根/兄弟目录的裸相对引用补 ../ 前缀。
 * 幂等：已带 ../ 前缀的写法不受影响；全部修完后重跑为 0 处。
 * 自检：替换次数必须与预期规则一一对应，改后全文件不再有任何裸相对引用。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "templates", "article.html");
const DRY = process.argv.includes("--dry");

// [旧片段, 新片段, 说明]
const RULES = [
  ['href="collection.html', 'href="../collection.html', "collection 链接"],
  ['href="categories/', 'href="../categories/', "分类页链接"],
  ['href="sellers/index.html', 'href="../sellers/index.html', "卖家馆链接"],
  ['href="insights.html', 'href="../insights.html', "情报总览链接"],
  ['href="insights/', 'href="../insights/', "情报文章链接"],
  ['href="pricing.html', 'href="../pricing.html', "价格页链接"],
  ['href="items/${', 'href="../items/${', "今日淘珍卡片链接"],
  ['`items/${', '`../items/${', "藏品卡片链接(detailUrl)"],
  ["this.src='assets/images/placeholder.jpg'", "this.src='../assets/images/placeholder.jpg'", "占位图回退路径"],
  ["return 'assets/images/' + (file || 'placeholder.jpg');", "return '../assets/images/' + (file || 'placeholder.jpg');", "imgPath 本地分支"],
];

const html = fs.readFileSync(FILE, "utf8");
let next = html;
let total = 0;
const detail = [];

const counts = [];
for (const [from, to, label] of RULES) {
  const n = next.split(from).length - 1;
  counts.push(n);
  if (n > 0) {
    next = next.split(from).join(to);
    total += n;
    detail.push(`${label}: ${n} 处`);
  }
}

if (total === 0) {
  console.log("无需修改（已全部带 ../ 前缀）");
  process.exit(0);
}

// 自检 1：不再残留任何裸相对引用（排除根绝对 /...、http、{{占位符}}）
const residue = next.match(/(?:href|src)="(?:collection\.html|categories\/|sellers\/|insights\.html|insights\/|pricing\.html|items\/|assets\/)/g);
if (residue) {
  console.error("✗ 仍有裸相对引用残留：", residue.slice(0, 5));
  process.exit(1);
}

// 自检 2：按出现次数核算 —— 模板里可能本来就存在带 ../ 的同款链接，
// 不能用「反向替换全量还原」验证（会误伤既有 ../ 链接）。
// 正确的不变量：新文本里 to 的出现数 = 原文出现数 + 本次替换数 n。
RULES.forEach(([from, to, label], i) => {
  const n = counts[i];
  const beforeTo = html.split(to).length - 1;
  const afterTo = next.split(to).length - 1;
  if (afterTo - beforeTo !== n) {
    console.error(`✗ 自检失败：${label} 计数不符（期望 +${n}，实际 +${afterTo - beforeTo}），未写入`);
    process.exit(1);
  }
});

if (!DRY) fs.writeFileSync(FILE, next, "utf8");
console.log(`${DRY ? "[试运行] " : ""}共修正 ${total} 处：`);
detail.forEach((d) => console.log("  " + d));
