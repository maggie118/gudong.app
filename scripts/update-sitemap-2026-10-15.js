#!/usr/bin/env node
/**
 * update-sitemap-2026-10-15.js — 从磁盘全量生成 sitemap.xml
 *
 * 2026-10-15 v2：改为磁盘全量生成（v1 只读取旧列表，漏掉 8 篇已发布文章）。
 *
 * 规则：
 * - 收录范围（白名单）：根页（about/collection/index/insights/pricing/privacy/terms）
 *   + categories/ + insights/ + items/ + sellers/ + tools/ 下全部 *.html
 * - 排除：robots.txt 已 Disallow 的（my/、seller-inbox、seller-reply 等）、
 *   无入链草稿（Untitled-5.html）、以及 _backup* 等非部署目录
 * - URL 形态：index.html → /；目录 index → /dir/（保持历史形态）；
 *   其余 → 无扩展名路径（配合 vercel.json cleanUrls）
 * - lastmod 取文件 mtime（本地时区 YYYY-MM-DD）
 * - 排序按本地文件路径，与历史 sitemap 顺序一致
 *
 * 幂等：可重复运行，输出确定（lastmod 跟随 mtime）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const BASE = 'https://gudong.app'; // 2026-10-18：去掉 www，全站统一裸域（改 sitemap 时同步改这里，否则会被重新生成覆盖）

// 根页白名单（相对站点根）
const ROOT_PAGES = ['about.html', 'collection.html', 'index.html', 'insights.html', 'pricing.html', 'privacy.html', 'terms.html'];
// 收录的子目录（其中的 index.html 特殊处理为目录 URL）
const SCAN_DIRS = ['categories', 'insights', 'items', 'sellers', 'tools'];

// URL 特例：文件 → URL path
function fileToUrlPath(rel) {
  if (rel === 'index.html') return '/';
  if (rel === 'insights.html') return '/insights';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length); // 保留尾斜杠
  return '/' + rel.replace(/\.html$/, '');
}

function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 收集文件
const files = [];
for (const f of ROOT_PAGES) {
  const full = path.join(ROOT, f);
  if (!fs.existsSync(full)) { console.error('MISSING ROOT PAGE:', f); process.exit(1); }
  files.push(f);
}
for (const d of SCAN_DIRS) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) { console.error('MISSING DIR:', d); process.exit(1); }
  for (const e of fs.readdirSync(dir)) {
    if (e.endsWith('.html')) files.push(d + '/' + e);
  }
}
files.sort();

// 生成
const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
];
for (const rel of files) {
  const lastmod = fmtDate(fs.statSync(path.join(ROOT, rel)).mtime);
  lines.push('  <url>');
  lines.push(`    <loc>${BASE}${fileToUrlPath(rel)}</loc>`);
  lines.push(`    <lastmod>${lastmod}</lastmod>`);
  lines.push('  </url>');
}
lines.push('</urlset>');
fs.writeFileSync(SITEMAP, lines.join('\n') + '\n', 'utf8');
console.log(`✓ sitemap.xml 已生成：${files.length} 个 URL，全部带 lastmod（按文件 mtime）`);

// 与旧版对比：新增/移除的 URL
const old = fs.readFileSync(path.join(ROOT, '_backup_2026-10-14', 'sitemap.xml.bak-2026-10-15'), 'utf8');
const oldUrls = new Set([...old.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()));
const newUrls = files.map(f => BASE + fileToUrlPath(f));
const added = newUrls.filter(u => !oldUrls.has(u));
const removed = [...oldUrls].filter(u => !newUrls.includes(u));
if (added.length) console.log('新增:\n' + added.map(u => '  + ' + u).join('\n'));
if (removed.length) console.log('移除:\n' + removed.map(u => '  - ' + u).join('\n'));
if (!added.length && !removed.length) console.log('（URL 集合与上一版一致）');
