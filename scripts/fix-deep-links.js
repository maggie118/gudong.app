#!/usr/bin/env node
/**
 * fix-deep-links.js — 修复 insights/ 页面中错误的三层相对路径
 *
 * 背景：17 个 insights 文章页（位于 /insights/，距站点根仅一层）整体沿用了
 * 旧模板的 "../../../" 前缀，导致导航/分类/页脚/manifest 等链接 404。
 * 规则：仅当页面位于站点根下一层目录（如 insights/）时，把 "../../../ 前缀
 * 改为 "../ 前缀。更深层目录（如 assets/images/lim-kw/）的 ../../../ 是正确的，不动。
 *
 * 幂等：已无 "../../../ 的文件自动跳过。
 * 自检：改写后逐文件做全量 href/src 可达性校验，任一目标不可达则不写入。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");

// 只处理「距根一层」的目录——从这些目录出发 ../../../ 会跳出站点根
const TARGET_DIRS = ["insights"];

const report = { changed: [], skipped: [], failed: [] };

/** 校验 HTML 中所有相对 href/src 指向的本地文件均存在 */
function linksResolve(file, html) {
  const bad = [];
  const re = /(?:href|src)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (/^(https?:|mailto:|tel:|javascript:|#|data:)/.test(href)) continue;
    const clean = href.split("#")[0].split("?")[0];
    if (!clean) continue;
    if (/^https?:/.test(href) && !clean) continue;
    const target = path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(target)) bad.push(href);
  }
  return bad;
}

for (const dir of TARGET_DIRS) {
  const dirPath = path.join(ROOT, dir);
  for (const name of fs.readdirSync(dirPath).sort()) {
    if (!name.endsWith(".html")) continue;
    const file = path.join(dirPath, name);
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const html = fs.readFileSync(file, "utf8");

    const count = html.split('"../../../').length - 1;
    if (count === 0) { report.skipped.push(rel); continue; }

    const next = html.split('"../../../').join('"../');

    // 自检 1：不应再残留三层前缀
    if (next.includes('"../../../')) {
      console.error(`✗ ${rel} 仍残留 ../../../，未写入`);
      report.failed.push(rel);
      continue;
    }
    // 自检 2：全量链接可达性
    const bad = linksResolve(file, next);
    if (bad.length) {
      console.error(`✗ ${rel} 有 ${bad.length} 处目标不可达: ${bad.slice(0, 3).join(", ")}，未写入`);
      report.failed.push(rel);
      continue;
    }

    if (!DRY) fs.writeFileSync(file, next, "utf8");
    report.changed.push(`${rel} (${count} 处)`);
  }
}

console.log(`\n${DRY ? "[试运行] " : ""}修改 ${report.changed.length} 个文件:`);
report.changed.forEach((f) => console.log("  " + f));
if (report.failed.length) {
  console.log(`失败 ${report.failed.length} 个:`);
  report.failed.forEach((f) => console.log("  " + f));
  process.exit(1);
}
