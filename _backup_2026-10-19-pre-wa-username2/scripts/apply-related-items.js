#!/usr/bin/env node
/**
 * 批量为现有 insights/*.html 注入：
 *   1. "看看相关藏品" CTA 区块（文章 → listing 转化闭环）
 *   2. 本地行情系列的"月度简报"徽章 + 回访提示
 *
 * 幂等：已包含 related-items 区块的文件自动跳过。
 * 用法：node scripts/apply-related-items.js
 */

'use strict';
const fs = require('fs');
const path = require('path');
const CTA = require('./related-items.js');

const INSIGHTS_DIR = path.join(CTA.ROOT, 'insights');

let patched = 0, skipped = 0, warned = [];

fs.readdirSync(INSIGHTS_DIR)
  .filter(f => f.endsWith('.html'))
  .sort()
  .forEach(f => {
    const full = path.join(INSIGHTS_DIR, f);
    const slug = f.replace(/\.html$/, '');
    let html = fs.readFileSync(full, 'utf8');

    if (html.includes('class="related-items"')) { skipped++; return; }

    /* 1. CSS 注入（首个 </style> 前） */
    const styleClose = html.indexOf('</style>');
    if (styleClose === -1) { warned.push(slug + '：找不到 </style>'); return; }
    html = html.slice(0, styleClose) + CTA.CSS_BLOCK + '\n    ' + html.slice(styleClose);

    /* 2. 月度徽章（行情类文章，article-meta 之后） */
    if (CTA.MONTHLY_BRIEFS[slug]) {
      const m = html.match(/<div class="article-meta">[\s\S]*?<\/div>/);
      if (m) {
        html = html.replace(m[0], m[0] + '\n' + CTA.monthlyBadgeHtml(slug).trim() + '\n');
      } else {
        warned.push(slug + '：找不到 article-meta 区块，徽章未插入');
      }
    }

    /* 3. 相关藏品 + 月度回访区块（article-cta 之前） */
    const sections = CTA.relatedItemsSectionHtml(slug) + '\n' + CTA.monthlyReturnHtml(slug);
    const anchor = '<section class="article-cta">';
    const idx = html.indexOf(anchor);
    if (idx === -1) { warned.push(slug + '：找不到 article-cta 锚点'); return; }
    html = html.slice(0, idx) + sections + '        ' + html.slice(idx);

    fs.writeFileSync(full, html, 'utf8');
    patched++;
  });

console.log('✅ 已注入：' + patched + ' 篇');
console.log('⏭ 已跳过（含旧区块）：' + skipped + ' 篇');
if (warned.length) { console.log('⚠ 警告：'); warned.forEach(w => console.log('  - ' + w)); }
