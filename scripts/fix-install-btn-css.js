#!/usr/bin/env node
/* fix-install-btn-css.js — 给缺 .app-install-btn CSS 的页面补齐 3 条规则（2026-10-09）
 * 症状：footer「安装古董.app」渲染成裸链接（无胶囊按钮样式）。
 * 与 index.html 第 1323-1341 行的规则一致；--dur/--ease 未定义的页面用 var() 兜底值。
 * 幂等；自动扫描全站缺失页面。 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_FILES = new Set([
  'assets/images/lim-kw/item-lim-01.html',
  'assets/brand/logo-preview.html',
  'Untitled-5.html',
]);

const CSS_LINES = [
  '.app-install-btn {',
  '    display: inline-flex; align-items: center; gap: .3rem;',
  '    margin-left: .6rem; padding: .5rem .85rem; min-height: 40px;',
  '    border: 1px solid var(--color-border); border-radius: 999px;',
  '    color: var(--color-qianjinzong); font-size: .76rem; text-decoration: none;',
  '    vertical-align: middle; transition: all var(--dur, .3s) var(--ease, ease);',
  '}',
  '.app-install-btn:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-light); }',
  '.app-install-btn svg { width: 12px; height: 12px; flex-shrink: 0; fill: currentColor; }',
];

function listHtml(dir, rel, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = rel ? rel + '/' + name : name;
    if (fs.statSync(full).isDirectory()) {
      if (['node_modules', '.git', '.workbuddy', 'airtable-script', 'scripts', 'content', 'docs', '.vercel', 'prototypes'].includes(name)) continue;
      listHtml(full, relPath, out);
    } else if (name.endsWith('.html') && !SKIP_FILES.has(relPath)) {
      out.push(relPath);
    }
  }
}

const files = [];
listHtml(ROOT, '', files);
files.push('templates/article.html');
files.sort();

let fixed = 0, skipped = 0;
for (const rel of files) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  if (/\.app-install-btn\s*\{/.test(html)) continue;               // 已有规则
  if (!html.includes('app-install-btn')) continue;                 // 无按钮，不管
  const eol = html.includes('\r\n') ? '\r\n' : '\n';

  // 优先插进 footer 精简版标记所在的 <style> 块（</style> 前）
  let out = html;
  const mark = html.indexOf('footer 品牌区/免责声明/版权（全站统一·精简版）');
  let injectAt = -1, indent = '';
  if (mark !== -1) {
    const styleEnd = html.indexOf('</style>', mark);
    if (styleEnd !== -1) {
      injectAt = styleEnd;
      const lineStart = html.lastIndexOf('\n', styleEnd) + 1;
      indent = html.slice(lineStart, styleEnd).match(/^[ \t]*/)[0];
    }
  }
  const block = CSS_LINES.map(l => (l === '}' ? indent + '}' : indent + l)).join(eol) + eol + indent;
  if (injectAt !== -1) {
    out = html.slice(0, injectAt) + block + html.slice(injectAt);
  } else {
    // 兜底：footer 前新开一个 <style>
    const fi = html.search(/<footer[^>]*>/i);
    if (fi === -1) { console.log('[SKIP·无 footer] ' + rel); skipped++; continue; }
    const lineStart = html.lastIndexOf('\n', fi) + 1;
    indent = html.slice(lineStart, fi).match(/^[ \t]*/)[0];
    out = html.slice(0, lineStart) + indent + '<style>' + eol + CSS_LINES.map(l => indent + l).join(eol) + eol + indent + '</style>' + eol + html.slice(lineStart);
  }

  fs.writeFileSync(file, out);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== out) { console.error('[FAIL·写回不一致] ' + rel); process.exitCode = 1; continue; }
  fixed++;
  console.log('[OK] ' + rel + ' → 补 .app-install-btn CSS ×3');
}
console.log('---- 完成：补齐 ' + fixed + ' 个页面，跳过 ' + skipped + ' ----');
