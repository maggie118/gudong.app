#!/usr/bin/env node
/**
 * 给站内所有页面补上 16x16 favicon 引用（幂等，可反复重跑）
 *
 * 做法：不动其它任何字节，只在「同页已有的 32x32 引用」前插一行 16x16 引用，
 * 并且沿用同页的相对路径前缀与缩进 —— 站内各页 <link> 有 5 种 href 写法
 * (../, ../../.., /, https://gudong.app/, 无前缀)，逐页复用才不会插错路径。
 *
 * 用法: node scripts/add-favicon-16.js [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy', '.vercel', 'airtable-script']);
const DRY = process.argv.includes('--dry');

const LINK_32 = /^([ \t]*)(<link\s+rel="icon"\s+type="image\/png"\s+sizes="32x32"\s+href="([^"]*?)favicon-32x32\.png"\s*\/?>)(\r\n|\n|\r)?/m;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) walk(p, out);
    } else if (ent.name.toLowerCase().endsWith('.html')) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(ROOT).sort();
const report = { changed: [], skipped: [], noRef: [], onlyIco: [] };

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');

  if (html.includes('favicon-16x16')) { report.skipped.push(rel); continue; }

  // 站内文件换行符并不统一（同一文件里 \r\n 与 \n 混用），所以不做整体
  // split/join，只在原字符串上做一次定点插入，其余字节一律不动。
  const m = LINK_32.exec(html);
  if (!m) {
    if (/rel="icon"/.test(html)) report.onlyIco.push(rel);
    else report.noRef.push(rel);
    continue;
  }

  const [whole, indent, link32, prefix] = m;
  const term = m[4] || '\n';
  const link16 = `<link rel="icon" type="image/png" sizes="16x16" href="${prefix}favicon-16x16.png">`;
  const inserted = `${indent}${link16}${term}`;
  const next = html.replace(whole, inserted + whole);

  // 自检：定位新增片段并删掉后，必须与原文逐字节相同（且片段唯一，检查才有意义）
  const pos = next.indexOf(inserted);
  const unique = pos !== -1 && next.indexOf(inserted, pos + 1) === -1;
  const revert = unique ? next.slice(0, pos) + next.slice(pos + inserted.length) : null;
  if (!unique || revert !== html) {
    console.error(`✗ ${rel} 自检失败，未写入`);
    continue;
  }

  if (!DRY) fs.writeFileSync(file, next, 'utf8');
  report.changed.push(rel);
}

console.log(`${DRY ? '[dry-run] ' : ''}共扫描 ${files.length} 个 HTML`);
console.log(`  已插入/待插入 16x16 引用: ${report.changed.length}`);
console.log(`  已存在、跳过: ${report.skipped.length}`);
if (report.onlyIco.length) {
  console.log(`  只有 .ico 引用、无 32x32（未处理，待确认）: ${report.onlyIco.length}`);
  report.onlyIco.slice(0, 20).forEach((f) => console.log(`    - ${f}`));
}
if (report.noRef.length) {
  console.log(`  完全无 icon 引用（未处理）: ${report.noRef.length}`);
  report.noRef.slice(0, 20).forEach((f) => console.log(`    - ${f}`));
}
