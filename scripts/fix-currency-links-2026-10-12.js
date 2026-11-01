#!/usr/bin/env node
/* fix-currency-links-2026-10-12.js — 修复 2026-10-11 深夜新增货币换算器时留下的坏链
 * 问题：
 *  1. 新工具文件名为 tools/currency-convert.html，但所有引用写成 currencyconvert.html（少连字符）→ 全部 404
 *  2. tools/index.html 被按"两层深度"重建，链接全用 ../../（导航碰巧因根钳制可用，工具卡片 ../xxx.html 直接 404）
 *  3. tools/currency-convert.html 的 canonical/hreflang/og:url/ld+json 用了非 www 域名 + 坏文件名
 * 修复（幂等，写入前快照、写后往返校验）：
 *  A. tools/index.html：../../ → ../（32 处）；卡片改同目录相对：../year-since.html → year-since.html 等 4 张
 *  B. 全部 tools/*.html + index.html：currencyconvert → currency-convert（覆盖 .html 链接与纯文本引用）
 *  C. tools/currency-convert.html：canonical/hreflang/og:url/ld+json 域名统一 https://www.gudong.app/
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

let fail = 0;

function patch(rel, rules, label) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  for (const [from, to] of rules) {
    while (html.includes(from)) html = html.split(from).join(to);
  }
  if (html === before) { console.log('[SKIP·无命中] ' + rel + ' — ' + label); return; }
  fs.writeFileSync(file, html);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== html) { console.error('[FAIL·写回不一致] ' + rel); fail++; return; }
  console.log('[FIX] ' + rel + ' — ' + label);
}

/* A. tools/index.html：深度修正（页面实际在 /tools/，深度 1） */
patch('tools/index.html', [
  ['../../', '../'],                                   // 所有导航/页脚/图标前缀（根钳制下导航碰巧能用，但不符合站点约定且卡片会坏）
  ['href="../year-since.html"', 'href="year-since.html"'],   // 卡片：同目录相对
  ['href="../ganzhi.html"', 'href="ganzhi.html"'],
  ['href="../era-lookup.html"', 'href="era-lookup.html"'],
  ['href="../currencyconvert.html"', 'href="currency-convert.html"'], // 卡片：前缀 + 文件名一并修正
], '深度前缀 ../../ → ../，卡片改同目录相对');

/* B. 坏文件名 currencyconvert → currency-convert（链接 + 可见文本 + ld+json） */
for (const rel of ['tools/index.html', 'tools/ganzhi.html', 'tools/year-since.html',
                   'tools/era-lookup.html', 'tools/currency-convert.html', 'index.html']) {
  patch(rel, [['currencyconvert', 'currency-convert']], '文件名 currencyconvert → currency-convert');
}

/* C. currency-convert.html：canonical 族域名统一 www（对齐 era-lookup / about 等页规范） */
patch('tools/currency-convert.html', [
  ['https://gudong.app/tools/currency-convert.html', 'https://www.gudong.app/tools/currency-convert.html'],
], 'canonical/hreflang/og:url/ld+json 域名统一 www');

/* 终检：全站不应再有 currencyconvert 残留；tools/index.html 不应再有 ../../ 与坏卡片前缀 */
(function finalCheck() {
  const bad = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'tools'))) {
    if (!f.endsWith('.html')) continue;
    if (fs.readFileSync(path.join(ROOT, 'tools', f), 'utf8').includes('currencyconvert')) bad.push('tools/' + f);
  }
  if (fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').includes('currencyconvert')) bad.push('index.html');
  if (bad.length) { console.error('[FAIL·currencyconvert 残留] ' + bad.join(', ')); fail++; }
  else console.log('✓ 无 currencyconvert 残留');

  const ti = fs.readFileSync(path.join(ROOT, 'tools/index.html'), 'utf8');
  const probs = [];
  if (ti.includes('../../')) probs.push('仍有 ../../');
  for (const c of ['year-since', 'ganzhi', 'era-lookup', 'currency-convert']) {
    if (ti.includes('href="../' + c + '.html"')) probs.push('卡片仍带 ../ 前缀: ' + c);
    if (!ti.includes('href="' + c + '.html"')) probs.push('卡片缺失: ' + c);
  }
  if (probs.length) { console.error('[FAIL·tools/index.html] ' + probs.join('；')); fail++; }
  else console.log('✓ tools/index.html 深度与卡片链接正确');
})();

console.log(fail ? '---- 存在失败 ' + fail + ' 项 ----' : '---- 全部完成 ----');
process.exitCode = fail ? 1 : 0;
