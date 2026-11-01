#!/usr/bin/env node
/**
 * 修正图标引用的相对路径层级（幂等，可反复重跑）
 *
 * 背景：站内图标 link 有 5 种写法（../, ../../../, /assets, https://gudong.app/,
 * 无前缀）。其中 17 个 insights 页面与模板用了三层前缀，而从 /insights/ 出发
 * `../../../` 会指到站点根目录之上 —— 图标全部 404。
 *
 * 做法：只针对 rel="icon" / rel="apple-touch-icon" 的 href，
 * 若当前路径按本页位置解析不到文件，则依次尝试 ../ × n 与根相对，取第一个能落地的；
 * 其余字节一律不动（定点替换 + 删回原文自检）。
 *
 * 用法: node scripts/fix-icon-links.js [--dry]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.workbuddy', '.vercel', 'airtable-script']);
const DRY = process.argv.includes('--dry');

// rel="icon" / rel="apple-touch-icon" 的 href
const ICON_LINK = /<link\b[^>]*\brel="(?:icon|apple-touch-icon|shortcut icon)"[^>]*>/g;
const HREF = /href="([^"]+)"/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (!SKIP_DIRS.has(ent.name)) walk(p, out); }
    else if (ent.name.toLowerCase().endsWith('.html')) out.push(p);
  }
  return out;
}

function resolves(file, href) {
  if (/^https?:|^\/\//.test(href)) return true;          // 远程地址，交给浏览器
  const target = href.startsWith('/') ? path.join(ROOT, href.slice(1))
                                      : path.join(path.dirname(file), href);
  return fs.existsSync(target);
}

function candidates(href) {
  // 去掉已有的相对前缀，再按层级重新拼
  const tail = href.replace(/^(?:\.\.\/)+/, '').replace(/^\//, '');
  const list = [];
  for (let n = 0; n <= 4; n++) list.push('../'.repeat(n) + tail);
  list.push('/' + tail);
  return list;
}

const changed = [];
const unresolved = [];
const already = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  let html = fs.readFileSync(file, 'utf8');
  let touched = 0;

  ICON_LINK.lastIndex = 0;
  html = html.replace(ICON_LINK, (tag) => {
    const m = HREF.exec(tag);
    if (!m) return tag;
    const href = m[1];
    if (resolves(file, href)) return tag;

    const fixed = candidates(href).find((c) => resolves(file, c));
    if (!fixed) { unresolved.push(`${rel} -> ${href}`); return tag; }

    touched++;
    changed.push({ file: rel, from: href, to: fixed });
    return tag.replace(`href="${href}"`, `href="${fixed}"`);
  });

  if (!touched) { already.push(rel); continue; }

  if (!DRY) fs.writeFileSync(file, html, 'utf8');

  // 自检：图标 link 的数量与除 href 外的一切必须与原文逐字节一致
  const original = fs.readFileSync(file, 'utf8');
  const tagsOf = (s) => [...s.matchAll(ICON_LINK)].map((m) => m[0]);
  const before = tagsOf(original);
  const after = tagsOf(html);
  const shape = (t) => t.replace(HREF, 'href="*"');
  const ok = before.length === after.length &&
             before.every((t, i) => shape(t) === shape(after[i]));
  if (!ok) console.error(`✗ ${rel} 结构自检失败（link 数量或属性被改动）`);
}

console.log(`${DRY ? '[dry-run] ' : ''}共修正 ${changed.length} 处图标路径，涉及文件 ${new Set(changed.map((c) => c.file)).size} 个`);
changed.slice(0, 8).forEach((c) => console.log(`   ${c.file}\n     ${c.from}\n  -> ${c.to}`));
if (changed.length > 8) console.log(`   ... 其余 ${changed.length - 8} 处同理`);
if (unresolved.length) {
  console.log(`\n仍无法落地（需人工确认）${unresolved.length} 处:`);
  unresolved.forEach((u) => console.log('   -', u));
}
