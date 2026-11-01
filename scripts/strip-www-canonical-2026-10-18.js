#!/usr/bin/env node
/**
 * strip-www-canonical-2026-10-18.js — 全站 canonical / og:url / JSON-LD 去 www（统一裸域）
 *
 * 背景：Vercel 上主域要从 www.gudong.app 切成 gudong.app（www 反过来 308 跳裸域），
 * 页面里的 <link rel="canonical">、og:url / og:image、twitter:image、JSON-LD 的 url/@id
 * 必须跟着改成裸域，否则规范化域名和实际 canonical 自相矛盾。
 *
 * 规则：
 * - 只替换 `https://www.gudong.app` → `https://gudong.app`（精确到域名，不会碰
 *   `http://www.sitemaps.org` / `www.w3.org` 等其它 www 域名）
 * - 幂等：已改过的文件（不含 www.gudong.app）直接跳过，可反复运行
 * - 排除：_ 开头的快照目录（_backup_* / _upload_*）、airtable-script/ node_modules/
 *   .git/ .workbuddy/ prototypes/ scripts/ templates/ content/ docs/ .vercel/
 * - 保留原换行符：用定点替换，不 split/join 整篇重排
 *
 * 用法：node scripts/strip-www-canonical-2026-10-18.js           # 预览
 *       node scripts/strip-www-canonical-2026-10-18.js --write   # 落盘
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const NEEDLE = 'https://www.gudong.app';
const TARGET = 'https://gudong.app';

const SKIP_DIRS = new Set([
  'airtable-script', 'node_modules', '.git', '.workbuddy', 'prototypes',
  'scripts', 'templates', 'content', 'docs', '.vercel'
]);
const SKIP_FILES = new Set([
  'assets/images/lim-kw/item-lim-01.html',
  'assets/brand/logo-preview.html',
  'Untitled-5.html'
]);

function isSnapshotDir(name) { return /^_/.test(name); }

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (isSnapshotDir(entry.name) || SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      if (SKIP_FILES.has(rel)) continue;
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = walk(ROOT, []).sort();
let changed = 0, skipped = 0, totalHits = 0;
const touched = [];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  let count = 0;
  let idx = html.indexOf(NEEDLE);
  while (idx !== -1) { count++; idx = html.indexOf(NEEDLE, idx + NEEDLE.length); }
  if (count === 0) { skipped++; continue; }

  // 幂等保护：确认没有残留其它形态（如 http:// 版本），有就报警不静默处理
  const odd = html.match(/http:\/\/www\.gudong\.app/g);
  if (odd) {
    console.log('  ⚠ 含 http:// 版本，需人工确认：' + path.relative(ROOT, file).replace(/\\/g, '/'));
  }

  const next = html.split(NEEDLE).join(TARGET);
  if (WRITE) fs.writeFileSync(file, next, 'utf8');
  changed++;
  totalHits += count;
  touched.push({ rel: path.relative(ROOT, file).replace(/\\/g, '/'), count: count });
}

console.log('扫描 HTML：' + files.length + ' 个');
console.log('已改文件：' + changed + ' 个，替换 ' + totalHits + ' 处；无需改动：' + skipped + ' 个');
console.log(WRITE ? '✅ 已写入' : '（预览模式，加 --write 才会落盘）');
if (changed) {
  console.log('\n改动明细：');
  touched.forEach(function (t) { console.log('  ' + t.count + '  ' + t.rel); });
}
