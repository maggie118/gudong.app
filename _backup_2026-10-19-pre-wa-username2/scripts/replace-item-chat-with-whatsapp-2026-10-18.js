#!/usr/bin/env node
/**
 * replace-item-chat-with-whatsapp-2026-10-18.js
 *
 * 把藏品页的「💬 站内咨询（免注册）」聊天组件，替换成 WhatsApp 直连按钮
 * （样式取自用户提供的参考代码：WhatsApp 品牌绿 #25D366、12px 圆角、按压反馈、24px 官方图标）。
 *
 * 说明：
 * - href 保持 https://wa.me 空占位（卖家表目前没有 whatsapp 字段，等后台按卖家填入）
 * - 双语用站内既有 <span class="zh">/<span class="en"> 机制，不需要额外显隐 CSS
 * - **不删除** <script src="../assets/js/item-chat.js">：组件移走后该脚本
 *   `document.querySelector('[data-gudong-chat]')` 取不到会直接 return，是安全空转
 * - 首页 index.html 的 FAQ JSON-LD 里那句「点击「站内咨询」向卖家留言」同步改文案
 *
 * 幂等：已含 pwa-wa-username-btn 的页面跳过；CSS 块带 gd-wa-btn-2026-10-18 标记，重复运行原地替换。
 * 换行：定点替换，按各文件自身 EOL 重建，不整篇重排。
 *
 * 用法：node scripts/replace-item-chat-with-whatsapp-2026-10-18.js          # 预览
 *       node scripts/replace-item-chat-with-whatsapp-2026-10-18.js --write  # 落盘
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const MARK = 'gd-wa-btn-2026-10-18';
const WA_PATH = 'M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.456L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.37 9.864-9.799.002-2.63-1.023-5.101-2.885-6.965C16.528 1.977 14.053.953 11.434.953c-5.442 0-9.866 4.372-9.87 9.802 0 1.714.47 3.387 1.357 4.847L1.872 21.03l5.632-1.462z';

const CSS = [
  '/* ' + MARK + ' —— 站内咨询改为 WhatsApp 直连按钮 */',
  '.pwa-action-container{width:100%;max-width:400px;padding:0;margin-bottom:1rem;box-sizing:border-box;}',
  '.pwa-wa-username-btn{display:inline-flex;align-items:center;justify-content:center;width:100%;padding:14px 20px;background-color:#25D366;color:#FFFFFF;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;border-radius:12px;box-shadow:0 4px 12px rgba(37,211,102,0.25);transition:transform 0.1s ease,background-color 0.2s ease;cursor:pointer;-webkit-tap-highlight-color:transparent;box-sizing:border-box;}',
  '.pwa-wa-username-btn:active{transform:scale(0.97);background-color:#1EBE55;box-shadow:0 2px 6px rgba(37,211,102,0.15);}',
  '.pwa-wa-username-btn .wa-svg-icon{width:24px;height:24px;margin-right:10px;fill:#FFFFFF;flex-shrink:0;}'
].join('\n');

function eolOf(text) { const i = text.indexOf('\n'); return i > 0 && text[i - 1] === '\r' ? '\r\n' : '\n'; }
function toEol(text, eol) { return eol === '\n' ? text : text.split('\n').join('\r\n'); }

function buildMarkup(indent) {
  const p = function (n) { return ' '.repeat(n); };
  return [
    p(indent) + '<div class="pwa-action-container" data-gd-wa-btn>',
    p(indent + 4) + '<a href="https://wa.me" target="_blank" rel="noopener noreferrer" class="pwa-wa-username-btn">',
    p(indent + 8) + '<svg class="wa-svg-icon" viewBox="0 0 24 24" aria-hidden="true">',
    p(indent + 12) + '<path d="' + WA_PATH + '"/>',
    p(indent + 8) + '</svg>',
    p(indent + 8) + '<span class="zh">🟢 通过 WhatsApp 匿名咨询藏家</span><span class="en">🟢 Message the collector on WhatsApp</span>',
    p(indent + 4) + '</a>',
    p(indent) + '</div>'
  ].join('\n');
}

function replaceChatBlock(html, eol) {
  const startTag = '<div class="gd-chat" data-gudong-chat';
  const s = html.indexOf(startTag);
  if (s === -1) return { html: html, done: false, reason: '未找到 gd-chat 起始标签' };
  // 缩进：起始标签前面的行内空白
  const lineStart = html.lastIndexOf('\n', s) + 1;
  const indent = s - lineStart;
  const closeNeedle = '\n' + '</div>';
  let e = html.indexOf(closeNeedle, s);
  if (e === -1) return { html: html, done: false, reason: '未找到 gd-chat 结束标签' };
  const end = e + closeNeedle.length;
  const next = html.slice(0, s) + toEol(buildMarkup(indent), eol) + html.slice(end);
  return { html: next, done: true, reason: '' };
}

function upsertCss(html, eol) {
  const last = html.lastIndexOf('</style>');
  if (last === -1) return { html: html, done: false };
  const marker = '/* ' + MARK;
  const m = html.indexOf(marker);
  if (m !== -1 && m < last) {
    // 已存在：整段替换到该注释块后的第一个空行或下一个注释/规则前，简单起见替换到该块结尾
    const endIdx = html.indexOf('\n', html.indexOf('.wa-svg-icon', m));
    const next = html.slice(0, m) + toEol(CSS, eol) + html.slice(endIdx + 1);
    return { html: next, done: true };
  }
  const next = html.slice(0, last) + toEol('\n' + CSS + '\n', eol) + html.slice(last);
  return { html: next, done: true };
}

// ---- 藏品页 ----
const itemsDir = path.join(ROOT, 'items');
const files = fs.readdirSync(itemsDir).filter(function (f) { return f.endsWith('.html'); }).sort();
let changed = 0, skipped = 0, failed = 0;
for (const f of files) {
  const file = path.join(itemsDir, f);
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('pwa-wa-username-btn')) { skipped++; continue; }
  if (!html.includes('data-gudong-chat')) { skipped++; continue; }
  const eol = eolOf(html);
  const a = replaceChatBlock(html, eol);
  if (!a.done) { failed++; console.log('  ✗ ' + f + '：' + a.reason); continue; }
  const b = upsertCss(a.html, eol);
  if (WRITE) fs.writeFileSync(file, b.html, 'utf8');
  changed++;
  console.log('  ✓ ' + f);
}

// ---- 首页 FAQ ----
const OLD_FAQ = '在藏品详情页点击「站内咨询」向卖家留言，并在站内对话中沟通。';
const NEW_FAQ = '在藏品详情页点击「通过 WhatsApp 咨询藏家」按钮，跳转 WhatsApp 与卖家直接沟通。';
const idxFile = path.join(ROOT, 'index.html');
let idxHtml = fs.readFileSync(idxFile, 'utf8');
let faqNote = '未找到（可能已改过）';
if (idxHtml.includes(OLD_FAQ)) {
  idxHtml = idxHtml.split(OLD_FAQ).join(NEW_FAQ);
  if (WRITE) fs.writeFileSync(idxFile, idxHtml, 'utf8');
  faqNote = '已替换';
} else if (idxHtml.includes(NEW_FAQ)) {
  faqNote = '已是新文案，跳过';
}

console.log('\n藏品页：' + files.length + ' 个 → 替换 ' + changed + '，跳过 ' + skipped + '，失败 ' + failed);
console.log('首页 FAQ：' + faqNote);
console.log(WRITE ? '✅ 已写入' : '（预览模式，加 --write 落盘）');
