#!/usr/bin/env node
/**
 * relativize-asset-paths-2026-10-14.js
 * ---------------------------------------------------------------
 * 目标：把「静态资源」（manifest / assets 下的 css·js·图标）的引用
 *      从根绝对或绝对域名，改成「按页面深度计算的相对路径」，
 *      这样 file:// 直接双击打开 与线上部署 都能正常加载。
 *
 * 改什么：
 *   href="/manifest.json"                     -> href="<prefix>manifest.json"
 *   href="/assets/..."  src="/assets/..."     -> href="<prefix>assets/..." ...
 *   href="https://www.gudong.app/assets/..."  -> href="<prefix>assets/..."
 *   src ="https://www.gudong.app/assets/..."  -> src ="<prefix>assets/..."
 *   data-root="https://www.gudong.app/"       -> data-root="<prefix>"
 *   并给缺 data-root 的 gudong-data.js <script> 补上 data-root
 *
 * 故意不动（必须保持根绝对，否则线上会 404）：
 *   /api/**     服务端路由
 *   /sw.js      Service Worker 作用域必须在站点根
 *   站内跳转链接（xxx.html / 目录链接）—— 保留 .html 才能 file:// 双击可用
 *
 * 幂等：已是相对路径时不再命中，可反复执行。
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  'airtable-script', 'node_modules', '.git', '.workbuddy',
  'prototypes', 'scripts', 'templates', 'content', 'docs', '.vercel',
]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      // 跳过显式排除项，以及 _backup*/_drafts*/ 等临时/备份目录（绝不能改备份）
      if (SKIP_DIRS.has(e.name) || /^_/.test(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.name.toLowerCase().endsWith('.html')) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const files = walk(ROOT, []);
const summary = [];
let totalEdits = 0;

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  const depth = rel.split('/').length - 1;
  const p = '../'.repeat(depth);
  const dataRoot = p === '' ? './' : p;

  let html = fs.readFileSync(abs, 'utf8');
  const before = html;
  const hits = {};
  let n = 0;

  const rules = [
    ['href="https://www.gudong.app/assets/', `href="${p}assets/`],
    ['src="https://www.gudong.app/assets/', `src="${p}assets/`],
    ['href="/assets/', `href="${p}assets/`],
    ['src="/assets/', `src="${p}assets/`],
    ['href="/manifest.json"', `href="${p}manifest.json"`],
    ['data-root="https://www.gudong.app/"', `data-root="${dataRoot}"`],
  ];

  for (const [from, to] of rules) {
    const c = html.split(from).length - 1;
    if (c > 0) {
      html = html.split(from).join(to);
      hits[from] = c;
      n += c;
    }
  }

  // 给 gudong-data.js 的 <script> 补 data-root（只补缺失的）
  const tagRe = /<script\b[^>]*\bsrc="([^"]*gudong-data\.js)"[^>]*>/g;
  html = html.replace(tagRe, (tag) => {
    if (/\bdata-root=/.test(tag)) return tag;
    n += 1;
    hits['+data-root(gudong-data.js)'] = (hits['+data-root(gudong-data.js)'] || 0) + 1;
    return tag.replace(/\s*>$/, ` data-root="${dataRoot}">`);
  });

  if (html !== before) {
    fs.writeFileSync(abs, html);
    totalEdits += n;
    summary.push({ rel, depth, n, hits });
  }
}

console.log(`扫描 HTML: ${files.length} 个`);
console.log(`实际修改: ${summary.length} 个文件，共 ${totalEdits} 处`);
for (const s of summary) {
  const detail = Object.entries(s.hits).map(([k, v]) => `${k}×${v}`).join('  ');
  console.log(`  [d${s.depth}] ${s.rel}  (${s.n})  ${detail}`);
}
