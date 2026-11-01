#!/usr/bin/env node
/**
 * verify-relative-assets-2026-10-14.js
 * ---------------------------------------------------------------
 * 目的：证明「本地双击打开也能正常加载」——
 *   1) 扫描所有部署页面的 href/src，取出本地资源引用并逐个在磁盘上解析、断言存在
 *   2) 列出仍然存在的根绝对引用，并区分「允许保留的」（/api/、/sw.js）与「不该有的」
 *
 * 退出码：0 = 全部通过；1 = 有无法解析的引用。
 */

const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const SKIP_DIRS = new Set([
  'airtable-script', 'node_modules', '.git', '.workbuddy',
  'prototypes', 'scripts', 'templates', 'content', 'docs', '.vercel',
]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || /^_/.test(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (e.name.toLowerCase().endsWith('.html')) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const NON_LOCAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
// JS 里拼接出来的动态链接（模板字符串 / 字符串加号拼接）不算静态引用
const DYNAMIC = /\$\{|\{\{|\+\s*'|'\s*\+/;
const ABS_ALLOWED = /^\/(?:api\/|sw\.js|$|\?)/; // /api/**、/sw.js、站根

const files = walk(REPO, []);
const broken = [];
const leftovers = [];
let checked = 0;

for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  const dir = path.dirname(abs);
  const html = fs.readFileSync(abs, 'utf8');
  const re = /\b(?:href|src)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    if (!raw) continue;
    if (ABS_ALLOWED.test(raw)) { leftovers.push({ rel, raw, allowed: true }); continue; }
    if (raw.startsWith('/')) { leftovers.push({ rel, raw, allowed: false }); continue; }
    if (NON_LOCAL.test(raw) || DYNAMIC.test(raw)) continue;

    // 本地引用：去掉 query / hash 后解析
    let target = raw.split('#')[0].split('?')[0];
    if (!target) continue;
    target = decodeURIComponent(target);

    const base = path.resolve(dir, target);
    const cands = [];
    if (target.endsWith('/')) cands.push(path.join(base, 'index.html'));
    else {
      cands.push(base);
      if (!path.extname(base)) { cands.push(base + '.html'); cands.push(path.join(base, 'index.html')); }
    }
    checked++;
    if (!cands.some((c) => fs.existsSync(c))) {
      broken.push({ rel, raw, tried: cands.map((c) => path.relative(REPO, c).split(path.sep).join('/')) });
    }
  }
}

const bad = leftovers.filter((x) => !x.allowed);

console.log(`扫描页面: ${files.length}`);
console.log(`已解析的本地资源/链接引用: ${checked}`);
console.log(`无法解析的引用: ${broken.length}`);
for (const b of broken.slice(0, 40)) console.log(`  ✗ ${b.rel}  ->  ${b.raw}  (试过: ${b.tried.join(' | ')})`);

const allowedSet = new Set(leftovers.filter((x) => x.allowed).map((x) => x.raw.split('?')[0].split('#')[0]));
console.log(`\n保留的根绝对引用（允许）: ${allowedSet.size} 种`);
for (const s of [...allowedSet].sort()) console.log(`  ✓ ${s}`);

console.log(`\n不该存在的根绝对静态资源引用: ${new Set(bad.map((x) => x.raw)).size} 种`);
for (const s of [...new Set(bad.map((x) => x.raw))].sort()) console.log(`  ✗ ${s}`);

process.exit(broken.length || bad.length ? 1 : 0);
