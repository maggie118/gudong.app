#!/usr/bin/env node
/* simplify-footer-2026-10-09.js — footer 精简（2026-10-09 晚）
 * 1) 删除 footer-desc（描述行）与 footer-contact（联系邮箱行）
 * 2) 免责声明换为用户提供的短版（中英双语）
 * 3) 版权行 + 安装按钮保留；footer-nav 保留
 * 4) 替换上次注入的标记 footer CSS 块（去掉 .footer-desc/.footer-contact 规则）
 * 幂等；保留各文件换行风格。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_FILES = new Set([
  'assets/images/lim-kw/item-lim-01.html',
  'assets/brand/logo-preview.html',
  'Untitled-5.html',
]);

const OLD_CSS_MARK = '/* 2026-10-09：footer 品牌区/简介/联系方式（全站统一） */';
const NEW_CSS_MARK = '/* 2026-10-09：footer 品牌区/免责声明/版权（全站统一·精简版） */';
const NEW_CSS_BODY = [
  NEW_CSS_MARK,
  '.footer-brand { font-weight: 700; font-size: .84rem; color: #5c564f; margin-bottom: .35rem; }',
  '.footer-disclaimer { max-width: 680px; margin: 0 auto 1.1rem; font-size: .78rem; line-height: 1.65; color: #8a8178; }',
  '.footer-copyright { margin-bottom: .3rem; }',
];

function buildFooterInner(P, eol) {
  const L = [];
  L.push('        <div class="footer-nav">');
  L.push('            <a href="' + P + 'about.html" class="zh">联系我们</a><a href="' + P + 'about.html" class="en">Contact</a>');
  L.push('            <a href="' + P + 'pricing.html#collector-services" class="zh">藏家服务</a><a href="' + P + 'pricing.html#collector-services" class="en">Collector Services</a>');
  L.push('            <a href="' + P + 'pricing.html#buyer-services" class="zh">买家指南</a><a href="' + P + 'pricing.html#buyer-services" class="en">Buyer Guide</a>');
  L.push('            <a href="' + P + 'pricing.html#price-table" class="zh">服务收费</a><a href="' + P + 'pricing.html#price-table" class="en">Price List</a>');
  L.push('            <a href="' + P + 'privacy.html" class="zh">隐私政策</a><a href="' + P + 'privacy.html" class="en">Privacy</a>');
  L.push('            <a href="' + P + 'terms.html" class="zh">用户条款</a><a href="' + P + 'terms.html" class="en">Terms</a>');
  L.push('        </div>');
  L.push('        <p class="footer-brand"><span class="zh">gudong.app — 高端古董发现平台与藏家网络</span><span class="en">gudong.app — Premium antiques discovery platform &amp; collector network</span></p>');
  L.push('        <p class="footer-disclaimer"><span class="zh">平台仅提供藏品信息展示与藏家连接服务，不参与任何买卖交易，真伪、品相及价格由双方自行判断。</span><span class="en">The platform provides item display and collector connection services only and does not participate in any transaction; authenticity, condition and pricing are to be judged solely by the buyer and seller.</span></p>');
  L.push('        <p class="footer-copyright"><span class="zh">© 2026 gudong.app 版权所有 · <a href="javascript:void(0)" class="app-install-btn" onclick="event.preventDefault();"><svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>安装古董.app</a></span><span class="en">© 2026 gudong.app All rights reserved · <a href="javascript:void(0)" class="app-install-btn" onclick="event.preventDefault();"><svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>Install gudong.app</a></span></p>');
  return L.join(eol);
}

function listHtml(dir, rel, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = rel ? rel + '/' + name : name;
    if (fs.statSync(full).isDirectory()) {
      if (['node_modules', '.git', '.workbuddy', 'airtable-script', 'scripts', 'content', 'docs', '.vercel', 'prototypes'].includes(name)) continue;
      listHtml(full, relPath, out);
    } else if (name.endsWith('.html')) {
      if (!SKIP_FILES.has(relPath)) out.push(relPath);
    }
  }
}

const files = [];
listHtml(ROOT, '', files);
files.push('templates/article.html');
files.sort();

let changed = 0, already = 0, skipped = 0;
for (const rel of files) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  let out = html;
  const log = [];

  // 1) footer 内容替换
  const fm = out.match(/<footer[^>]*>/i);
  if (!fm) { console.log('[SKIP·无 footer] ' + rel); skipped++; continue; }
  const fStart = fm.index + fm[0].length;
  const fEnd = out.indexOf('</footer>', fStart);
  if (fEnd === -1) { console.log('[SKIP·footer 未闭合] ' + rel); skipped++; continue; }
  const eol = (out.slice(fStart, fEnd).match(/\r\n/) || out.match(/\r\n/)) ? '\r\n' : '\n';
  const P = rel.includes('/') ? '../' : '';
  const wanted = buildFooterInner(P, eol);
  if (out.slice(fStart, fEnd).replace(/\s+/g, ' ').trim() !== wanted.replace(/\s+/g, ' ').trim()) {
    out = out.slice(0, fStart) + eol + wanted + eol + '    ' + out.slice(fEnd);
    log.push('footer 精简');
  }

  // 2) 替换旧标记 CSS 块（含 .footer-desc/.footer-contact 的那块）
  const markIdx = out.indexOf(OLD_CSS_MARK);
  if (markIdx !== -1) {
    const styleStart = out.lastIndexOf('<style>', markIdx);
    const styleEnd = out.indexOf('</style>', markIdx);
    if (styleStart !== -1 && styleEnd !== -1) {
      const lineStart = out.lastIndexOf('\n', styleStart) + 1;
      const indent = out.slice(lineStart, styleStart).match(/^[ \t]*/)[0];
      const block = indent + '<style>' + eol +
        NEW_CSS_BODY.map(l => l === NEW_CSS_MARK ? indent + l : indent + l).join(eol) + eol +
        indent + '</style>';
      out = out.slice(0, lineStart) + block + out.slice(styleEnd + '</style>'.length);
      log.push('footer CSS 精简');
    }
  }

  if (out === html) { already++; continue; }
  fs.writeFileSync(file, out);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== out) { console.error('[FAIL·写回不一致] ' + rel); process.exitCode = 1; continue; }
  changed++;
  console.log('[OK] ' + rel + (log.length ? ' → ' + log.join('；') : ''));
}
console.log('---- 完成：改动 ' + changed + '，无变化 ' + already + '，跳过 ' + skipped + ' ----');
