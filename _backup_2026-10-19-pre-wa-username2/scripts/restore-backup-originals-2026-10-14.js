#!/usr/bin/env node
/**
 * restore-backup-originals-2026-10-14.js
 * ---------------------------------------------------------------
 * 事故说明：relativize-asset-paths-2026-10-14.js 未排除 _backup_2026-10-14/，
 * 把备份目录里的 HTML 也按“备份目录内的深度”加了前缀（内容被多套了一层 ../）。
 * 本脚本把这些备份副本反向还原为改动前形态：
 *   1) 去掉资源引用上的多余前缀 -> 还原为 /assets/、/manifest.json、data-root="/"
 *   2) 移除被脚本注入的 data-root（仅 collection.html、sellers/index.html）
 *   3) items/、sellers/ 原本用的 https://www.gudong.app/assets/ 域名形式一并还原
 *
 * 注意：还原后的备份在“资源引用是否带域名”这一细节上与原文件等价但非逐字节一致，
 *      功能上完全可回滚使用。
 */

const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const BK = path.join(REPO, '_backup_2026-10-14');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.toLowerCase().endsWith('.html')) out.push(p);
  }
  return out;
}

// 这些备份副本原本就没有 data-root，脚本给它注入了 -> 需要删掉
const INJECTED_DATA_ROOT = new Set([
  '_backup_2026-10-14/collection.html',
  '_backup_2026-10-14/sellers/index.html',
]);
// 这些原本 data-root 是域名形式 -> 还原回域名形式
const DOMAIN_DATA_ROOT = /^_backup_2026-10-14\/sellers\/seller-/;
// 这些文件原本资源引用用域名形式
const DOMAIN_ASSETS = /^_backup_2026-10-14\/(items\/|sellers\/)/;

const files = walk(BK, []);
let changed = 0;

for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  const depth = rel.split('/').length - 1;
  const p = '../'.repeat(depth);

  let html = fs.readFileSync(abs, 'utf8');
  const before = html;

  html = html.split(`href="${p}manifest.json"`).join('href="/manifest.json"');
  html = html.split(`href="${p}assets/`).join('href="/assets/');
  html = html.split(`src="${p}assets/`).join('src="/assets/');
  html = html.split(`data-root="${p}"`).join('data-root="/"');

  if (INJECTED_DATA_ROOT.has(rel)) {
    html = html.replace(/(<script\b[^>]*gudong-data\.js[^>]*?)\s+data-root="[^"]*"/, '$1');
  }
  if (DOMAIN_DATA_ROOT.test(rel)) {
    html = html.replace(/(<script\b[^>]*gudong-data\.js[^>]*?)\s+data-root="[^"]*"/, '$1 data-root="https://www.gudong.app/"');
  }
  if (DOMAIN_ASSETS.test(rel)) {
    html = html.split('href="/assets/icons/').join('href="https://www.gudong.app/assets/icons/');
    html = html.split('src="/assets/js/gudong-data.js"').join('src="https://www.gudong.app/assets/js/gudong-data.js"');
    html = html.split('src="/assets/js/gudong-follow.js"').join('src="https://www.gudong.app/assets/js/gudong-follow.js"');
  }

  if (html !== before) { fs.writeFileSync(abs, html); changed++; }
}

console.log(`备份副本还原完成：${changed} 个文件`);
