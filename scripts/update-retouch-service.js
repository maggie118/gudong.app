#!/usr/bin/env node
/**
 * update-retouch-service.js — 图片精修服务改价 + 内容升级
 *
 * 变更：
 *   1) 价格 S$25 / 套  →  S$59 / 件（价格块、说明行、PayNow 金额、提交消息）
 *   2) 服务内容升级为「图片优化 · 标题 · 描述 · 标签 · 发布」五项，
 *      原四项修图要点（光影/色彩/裁剪/背景）并入「图片优化」子说明。
 *   3) 温馨提示同步表述，避免与新的服务范围矛盾。
 *   4) pricing.html 套餐里的「4 套图片精修」→「4 件图片精修」（单位随服务统一）。
 *
 * 作用范围：categories/*.html（6 个文件，弹窗区块完全一致）+ pricing.html
 * 幂等：已升级（含 S$59）的文件自动跳过。
 * 自检：① 每条规则必须至少命中一次，否则整体失败；
 *       ② 替换后弹窗区块内不得残留 S$25；
 *       ③ 五项服务清单必须齐全。
 * 注意：目标区块使用 CRLF 换行，多行替换必须走正则并保留原换行风格。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const CATEGORIES = ["porcelain", "jade", "bronze", "coins", "paintings", "misc"];

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

/** 生成五项服务清单（按文件原有缩进与换行风格） */
function buildChecklist(indent, eol) {
  const li = (title, sub) =>
    `${indent}  <li>${CHECK_SVG}<div>${title}<span class="pr-li-sub">${sub}</span></div></li>`;
  return [
    `${indent}<ul class="pr-checklist">`,
    li("图片优化", "光影与亮度 · 色彩与白平衡 · 裁剪与构图 · 背景清理"),
    li("标题", "品类、年代、器型一目了然"),
    li("描述", "来源与品相如实陈述"),
    li("标签", "便于买家按关键词检索"),
    li("发布", "确认后直接上架到藏品页面"),
    `${indent}</ul>`,
  ].join(eol);
}

// 字符串规则：[查找, 替换, 标签]
const STRING_RULES = [
  [
    '<div class="pr-price-main">图片精修 <span class="amt">S$25</span> / 套</div>',
    '<div class="pr-price-main">图片精修 <span class="amt">S$59</span> / 件</div>',
    "价格行 S$25/套 → S$59/件",
  ],
  [
    '<div class="pr-example">例如：一只瓷瓶有正面、背面、底部、细节图，共 4 张 → S$25。</div>',
    '<div class="pr-example">古董圈帮你完成：<b>图片优化 · 标题 · 描述 · 标签 · 发布</b></div>',
    "价值主张行",
  ],
  [
    '<div class="pr-price-sub">S$25 / 套（1 件藏品，可上传最多 4 张图片）<br>一次精修最多 4 张 = S$25</div>',
    '<div class="pr-price-sub">S$59 / 件（1 件藏品，可上传最多 4 张图片）<br>一次精修最多 4 张 = S$59</div>',
    "价格说明",
  ],
  [
    "⚠️ 温馨提示：本套餐为基础图片精修服务，仅处理光影、调色、裁剪、背景清理；不含重度修图、创意美化、器物修补、绘图重构等高阶效果，将按客户提交的基础需求完成处理。",
    "⚠️ 温馨提示：本套餐包含图片精修（光影、调色、裁剪、背景清理）与标题、描述、标签整理，并在确认后发布上架；不含重度修图、创意美化、器物修补、绘图重构等高阶效果，标题与描述将依据你提供的资料如实整理，平台不作真伪鉴定。",
    "温馨提示",
  ],
  ['<div class="pr-paynow-amount">PayNow S$25</div>', '<div class="pr-paynow-amount">PayNow S$59</div>', "PayNow 金额"],
  ["服务费 S$25，", "服务费 S$59，", "提交消息服务费"],
  [
    "    .pr-checklist li svg{flex-shrink:0;width:16px;height:16px;color:var(--color-success);margin-top:.12rem;}",
    "    .pr-checklist li svg{flex-shrink:0;width:16px;height:16px;color:var(--color-success);margin-top:.12rem;}\r\n    .pr-checklist li div{flex:1;}\r\n    .pr-li-sub{display:block;font-size:.75rem;color:var(--color-text-secondary);font-weight:400;margin-top:.15rem;line-height:1.5;}",
    "子说明样式",
  ],
];

const report = { changed: [], skipped: [], failed: [] };

for (const name of CATEGORIES) {
  const file = path.join(ROOT, "categories", name + ".html");
  const rel = "categories/" + name + ".html";
  const html = fs.readFileSync(file, "utf8");

  if (html.includes("S$59 / 件")) { report.skipped.push(rel + "（已升级）"); continue; }

  let next = html;
  const missed = [];

  for (const [from, to, label] of STRING_RULES) {
    const n = next.split(from).length - 1;
    if (n === 0) { missed.push(label); continue; }
    next = next.split(from).join(to);
  }

  // 服务清单：正则匹配整个 <ul>，保留原有缩进与换行风格
  const UL_RE = /([ \t]*)<ul class="pr-checklist">[\s\S]*?<\/ul>/;
  const m = next.match(UL_RE);
  if (!m) {
    missed.push("服务清单");
  } else {
    const indent = m[1];
    const eol = m[0].includes("\r\n") ? "\r\n" : "\n";
    next = next.replace(UL_RE, buildChecklist(indent, eol));
  }

  if (missed.length) {
    console.error(`✗ ${rel} 未命中：${missed.join("、")}，未写入`);
    report.failed.push(rel);
    continue;
  }

  // 自检 ①：弹窗区块内不得残留旧价
  const i = next.indexOf("<!-- 图片精修服务弹窗");
  const j = next.indexOf("</script>", i);
  if (/S\$25/.test(next.slice(i, j))) {
    console.error(`✗ ${rel} 弹窗内仍残留 S$25，未写入`);
    report.failed.push(rel);
    continue;
  }
  // 自检 ②：五项清单齐全
  const five = ["图片优化", "标题", "描述", "标签", "发布"].every((t) =>
    new RegExp(`<div>${t}<span class="pr-li-sub">`).test(next)
  );
  if (!five || !next.includes("S$59 / 件")) {
    console.error(`✗ ${rel} 新文案校验不通过，未写入`);
    report.failed.push(rel);
    continue;
  }

  if (!DRY) fs.writeFileSync(file, next, "utf8");
  report.changed.push(`${rel}（价格 + 五项服务 + 样式）`);
}

// ---------- pricing.html：套餐单位统一 ----------
{
  const file = path.join(ROOT, "pricing.html");
  let html = fs.readFileSync(file, "utf8");
  let touched = 0;
  for (const [from, to] of [
    ['<li class="zh">4 套图片精修</li>', '<li class="zh">4 件图片精修</li>'],
    ['<li class="en">4 photo retouch sets</li>', '<li class="en">4 photo retouch &amp; listing items</li>'],
    ["年度4套图片精修", "年度4件图片精修"],
    ["four photo‑retouch sets", "four photo‑retouch &amp; listing items"],
  ]) {
    const n = html.split(from).length - 1;
    if (n) { html = html.split(from).join(to); touched += n; }
  }
  if (touched) {
    if (!DRY) fs.writeFileSync(file, html, "utf8");
    report.changed.push(`pricing.html（套餐单位 ${touched} 处）`);
  } else {
    report.skipped.push("pricing.html（无匹配，可能已改）");
  }
}

console.log(`${DRY ? "[试运行] " : ""}更新 ${report.changed.length} 个文件:`);
report.changed.forEach((f) => console.log("  " + f));
if (report.skipped.length) console.log("跳过：" + report.skipped.join("、"));
if (report.failed.length) { console.error("失败：" + report.failed.join("、")); process.exit(1); }
