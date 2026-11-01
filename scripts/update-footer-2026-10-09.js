#!/usr/bin/env node
/* update-footer-2026-10-09.js — 全站 footer 统一改版（2026-10-09）
 * 1) 全站 <footer> 内容统一为品牌行 / 描述行 / 免责声明 / 版权(含安装按钮) / 联系方式
 * 2) 注入 footer 新类的 CSS（幂等，带标记注释）
 * 3) 缺「安装引导弹窗」四件套的页面自动补齐（组件从 index.html 提取，保证与全站一致）
 * 4) 修复 terms.html / pricing.html 里 U+2011 不间断连字符污染（CSS/JS 选择器失效根因）
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

/* ---------- footer CSS（注入用） ---------- */
const FOOTER_CSS_MARK = '/* 2026-10-09：footer 品牌区/简介/联系方式（全站统一） */';
const FOOTER_CSS = [
  '<style>',
  FOOTER_CSS_MARK,
  '.footer-brand { font-weight: 700; font-size: .84rem; color: #5c564f; margin-bottom: .35rem; }',
  '.footer-desc { color: #6b6257; margin-bottom: .35rem; }',
  '.footer-disclaimer { max-width: 680px; margin: 0 auto 1.1rem; font-size: .78rem; line-height: 1.65; color: #8a8178; }',
  '.footer-copyright { margin-bottom: .3rem; }',
  '.footer-contact { margin-bottom: .3rem; }',
  '.footer-contact a { color: #7A4E33; text-decoration: none; font-weight: 600; }',
  '</style>',
].join('\n');

/* ---------- footer 模板 ---------- */
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
  L.push('        <p class="footer-desc"><span class="zh">gudong.app 连接全球藏家与珍稀藏品，提供藏品信息展示与藏家连接服务。</span><span class="en">gudong.app connects collectors worldwide with rare antiques, providing item display and collector connection services.</span></p>');
  L.push('        <p class="footer-disclaimer"><span class="zh">平台仅提供藏品信息展示与藏家连接服务，不参与任何买卖交易；藏品真伪、品相及价格均由买卖双方自行判断，平台不对交易行为及结果作任何担保，相关纠纷由双方自行协商解决。</span><span class="en">The platform provides item information display and collector connection services only and does not participate in any purchase or sale. Authenticity, condition and pricing are to be judged solely by the buyer and seller; the platform gives no guarantee as to any transaction or its outcome, and related disputes shall be resolved by the parties themselves.</span></p>');
  L.push('        <p class="footer-copyright"><span class="zh">© 2026 gudong.app 版权所有 · <a href="javascript:void(0)" class="app-install-btn" onclick="event.preventDefault();"><svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>安装古董.app</a></span><span class="en">© 2026 gudong.app All rights reserved · <a href="javascript:void(0)" class="app-install-btn" onclick="event.preventDefault();"><svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z"/></svg>Install gudong.app</a></span></p>');
  L.push('        <p class="footer-contact"><span class="zh">联系我们：</span><span class="en">Contact us: </span><a href="mailto:support@gudong.app">support@gudong.app</a></p>');
  return L.join(eol);
}

/* ---------- 从 index.html 提取安装弹窗四件套 ---------- */
function extractInstallBlock() {
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const start = idx.indexOf('<!-- PWA 安装引导弹层 -->');
  const endMark = '<!-- 2026-10-08：分享功能';
  const end = idx.indexOf(endMark, start);
  if (start === -1 || end === -1) throw new Error('无法从 index.html 提取安装弹窗组件');
  let block = idx.slice(start, end).trimEnd();
  return block;
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

const INSTALL_BLOCK = extractInstallBlock();

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

  // 0) U+2011 → ASCII 连字符
  const n2011 = (out.match(/\u2011/g) || []).length;
  if (n2011) { out = out.replace(/\u2011/g, '-'); log.push('修 U+2011×' + n2011); }

  // 1) footer 替换
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
    log.push('footer 统一');
  }

  // 2) footer CSS 注入（插在 <footer> 前）
  if (!out.includes(FOOTER_CSS_MARK)) {
    const fi = out.search(/<footer[^>]*>/i);
    const indentM = out.slice(0, fi).match(/\n([ \t]*)$/);
    const ind = indentM ? indentM[1] : '';
    out = out.slice(0, fi) + ind + FOOTER_CSS.split('\n').join(eol + ind) + eol + ind + out.slice(fi).replace(/^\s*/, '');
    log.push('footer CSS 注入');
  }

  // 3) 安装弹窗四件套补齐
  if (!out.includes('id="gdInstallModal"')) {
    const bi = out.lastIndexOf('</body>');
    if (bi === -1) { console.log('[SKIP·无 </body>] ' + rel); skipped++; continue; }
    const block = INSTALL_BLOCK.replace(/\r?\n/g, eol);
    out = out.slice(0, bi) + block + eol + out.slice(bi);
    log.push('补安装弹窗四件套');
  }

  if (out === html) { already++; continue; }
  fs.writeFileSync(file, out);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== out) { console.error('[FAIL·写回不一致] ' + rel); process.exitCode = 1; continue; }
  changed++;
  console.log('[OK] ' + rel + (log.length ? ' → ' + log.join('；') : ''));
}
console.log('---- 完成：改动 ' + changed + '，无变化 ' + already + '，跳过 ' + skipped + ' ----');
