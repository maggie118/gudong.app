/* 修复「页面整套缺公共组件」导致的 header 分享图标 / 页脚安装按钮渲染异常
 *
 * 症状：about.html 顶部「分享」按钮实测 4×21px、内联 SVG 0×0、display 退化成 block ——
 * 该页只有 1 个 <style>，缺分享按钮 CSS/JS、PWA 安装弹窗 CSS/HTML/JS、页脚精简版 CSS。
 * 修法：从渲染正常的基准页 privacy.html 原样提取这组块，注入缺失的页面。
 *
 * 幂等：每项注入前先判断标记是否已存在，重跑不会重复插入。
 * 用法：node scripts/fix-missing-header-share-components-2026-10-16.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = path.join(ROOT, 'privacy.html'); // 基准页：组件齐全且渲染正常

const SKIP_DIRS = new Set(['airtable-script', 'node_modules', '.git', '.workbuddy', 'prototypes',
  'templates', 'content', 'docs', '.vercel', 'assets']);
// 本地回滚快照目录（_backup_*）一律跳过，别把补丁写进备份里
const isSnapshotDir = name => name.startsWith('_');
const SKIP_FILES = new Set(['assets/images/lim-kw/item-lim-01.html']);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (e.isDirectory()) { if (!SKIP_DIRS.has(rel) && !isSnapshotDir(e.name)) walk(p, out); }
    else if (e.isFile() && e.name.toLowerCase().endsWith('.html') && !SKIP_FILES.has(rel)) out.push(rel);
  }
  return out;
}

// ---------- 1. 从基准页提取标准实现 ----------
const base = fs.readFileSync(BASE, 'utf8');

function grab(re, label) {
  const m = base.match(re);
  if (!m) { console.error('FATAL: 基准页提取失败 -> ' + label); process.exit(1); }
  return m[0];
}

const FOOTER_CSS = grab(/<style>\s*\/\* 2026-10-09：footer 品牌区[\s\S]*?<\/style>/, 'footer css');
const INSTALL_CSS = grab(/<style>\s*\.gd-install-modal \{[\s\S]*?<\/style>/, 'install css');
const INSTALL_HTML = grab(/<div class="gd-install-modal"[\s\S]*?[\r\n]+<\/div>[\r\n]+/, 'install html');
const INSTALL_JS = grab(/<script>\s*\(function \(\) \{\s*var modal = document\.getElementById\('gdInstallModal'\)[\s\S]*?<\/script>/, 'install js');
// 分享 CSS 只取按钮 + toast，不含 gd-mobile-header-fix / gd-header-logo-fit（目标页已有）
const SHARE_CSS_CORE = grab(/\.gd-share-btn \{[\s\S]*?\.gd-toast\.show \{[^}]*\}[\r\n]*/, 'share css core');
const SHARE_JS = grab(/<script>\s*\/\* 分享：Web Share API[\s\S]*?<\/script>/, 'share js');
const SHARE_PAGE_JS = grab(/<script>\s*window\.gdSharePage = function[\s\S]*?<\/script>/, 'sharePage js');

const SHARE_CSS = '<!-- 2026-10-07：分享功能（Web Share API + 剪贴板降级 + Toast 反馈），全站统一 -->\n<style>\n' + SHARE_CSS_CORE + '</style>';
// 页脚版权行（含带图标的安装按钮，中英两版）
const STD_COPYRIGHT = grab(/<p class="footer-copyright">[\s\S]*?<\/p>/, 'footer copyright');

// ---------- 2. 逐页判断缺失并注入 ----------
const files = walk(ROOT, []);
let updated = 0, scanned = 0;
const problems = [];

for (const rel of files) {
  const file = path.join(ROOT, rel);
  let html = fs.readFileSync(file, 'utf8');

  // 只处理带公共 header（有分享按钮标记）的页面
  if (!html.includes('gd-share-btn')) continue;
  scanned += 1;

  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  // 提取的块可能自身混用 CRLF/LF，先归一成 \n 再按目标文件 eol 重建
  const j = s => s.replace(/\r\n/g, '\n').split('\n').join(eol);
  let next = html;
  const added = [];

  // (a) 页脚精简版 CSS —— 插到 <footer> 前
  if (!/\.footer-brand \{/.test(next) && /<footer/.test(next)) {
    next = next.replace(/(\s*)<footer/, () => eol + eol + j(FOOTER_CSS) + eol + eol + '<footer');
    added.push('footer-css');
  }

  // (a2) 页脚安装按钮补齐（缺图标 / 缺英文版 → 换成标准版）
  const cp = next.match(/<p class="footer-copyright">[\s\S]*?<\/p>/);
  if (cp && /app-install-btn/.test(cp[0]) && !/app-install-btn"[^>]*>\s*<svg/.test(cp[0])) {
    next = next.replace(cp[0], j(STD_COPYRIGHT));
    added.push('footer-install-btn');
  }

  // (b) 尾部公共块：安装弹窗 CSS/HTML/JS + 分享 CSS/JS
  const tail = [];
  if (!/\.gd-install-modal \{/.test(next)) tail.push(j(INSTALL_CSS));
  if (!/id="gdInstallModal"/.test(next)) tail.push(j(INSTALL_HTML));
  if (!/gdCloseInstall/.test(next)) tail.push(j(INSTALL_JS));
  if (!/\.gd-share-btn svg \{/.test(next)) tail.push(j(SHARE_CSS));
  if (!/window\.gdShare = function/.test(next)) tail.push(j(SHARE_JS));
  if (!/window\.gdSharePage = function/.test(next)) tail.push(j(SHARE_PAGE_JS));

  if (tail.length) {
    next = next.replace(/(\s*)<\/body>/i, () => eol + eol + tail.join(eol + eol) + eol + eol + '</body>');
    added.push('tail-blocks:' + tail.length);
  }

  if (!added.length) continue;

  // 自检：每一项注入后都必须能在文本里找到
  const asserts = [
    [/\.footer-brand \{/, 'footer css'],
    [/\.gd-install-modal \{/, 'install css'],
    [/id="gdInstallModal"/, 'install html'],
    [/gdCloseInstall/, 'install js'],
    [/\.gd-share-btn svg \{/, 'share css'],
    [/window\.gdShare = function/, 'share js'],
    [/window\.gdSharePage = function/, 'sharePage js'],
  ];
  for (const [re, label] of asserts) {
    if (!re.test(next)) { problems.push(rel + ' : 注入后仍缺 ' + label); }
  }
  if (problems.length) continue;

  fs.writeFileSync(file, next, 'utf8');
  updated += 1;
  console.log('  修复 ' + rel + '  [' + added.join(', ') + ']');
}

console.log('—— 扫描 ' + scanned + ' 个带公共 header 的页面，修复 ' + updated + ' 个 ——');
if (problems.length) { console.error('PROBLEMS:'); problems.forEach(p => console.error('  ' + p)); process.exit(1); }
