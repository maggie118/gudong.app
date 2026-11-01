/**
 * 移动端顶部导航适配（2026-10-16）
 * 目标：仅 <768px 生效，桌面端完全不变。
 *  1) header 改 fixed 粘顶，高度走 CSS 变量 --gd-header-total-m
 *  2) LOGO 缩小 + 限最大宽度，减少上下留白，顶部留 safe-area 不贴死
 *  3) main 增加 padding-top = 移动端 header 实际高度
 *  4) html/body 增加 scroll-padding-top，锚点跳转不被遮挡
 *  5) LOGO 左对齐不动、不改导航/搜索按钮、不降透明度
 *  6) height/padding 加 transition，z-index 80（高于卡片，低于侧栏 95 / 弹窗 120+）
 * 幂等：已含标记则跳过。定点插入，不重排换行符。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARK = 'gd-mobile-header-fix-2026-10-16';
const SKIP_DIR = /^(_backup_[\w-]*|airtable-script|node_modules|\.git|\.workbuddy|prototypes|scripts|templates|content|docs|\.vercel)$/;
const SKIP_FILE = new Set(['assets/images/lim-kw/item-lim-01.html']);

const CSS = `
/*<<<${MARK}>>> 移动端顶部导航适配（仅 <768px 生效，桌面端保持原样）*/
:root{
  --gd-header-h-m: 58px;
  --gd-safe-top: env(safe-area-inset-top, 0px);
  --gd-header-total-m: calc(var(--gd-header-h-m) + var(--gd-safe-top));
}
@media (max-width: 767px){
  html, body { scroll-padding-top: calc(var(--gd-header-total-m) + 12px); }
  body > header{
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    height: var(--gd-header-total-m) !important;
    min-height: var(--gd-header-total-m) !important;
    max-height: var(--gd-header-total-m) !important;
    padding: var(--gd-safe-top) 5% 0 !important;
    margin: 0 !important;
    align-items: center !important;
    z-index: 80 !important;
    -webkit-transition: height .28s ease, padding .28s ease, background-color .28s ease, box-shadow .28s ease;
    transition: height .28s ease, padding .28s ease, background-color .28s ease, box-shadow .28s ease;
  }
  body > header .brand-logo-img{
    height: 30px !important;
    width: auto !important;
    max-width: 76px !important;
    opacity: 1 !important;
    -webkit-transition: height .28s ease, max-width .28s ease;
    transition: height .28s ease, max-width .28s ease;
  }
  body > header ~ main{
    padding-top: calc(var(--gd-header-total-m) + 12px) !important;
  }
}
/*<<</${MARK}>>>*/
`;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (SKIP_DIR.test(e.name)) continue; walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.html')) {
      const rel = path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join('/');
      if (!SKIP_FILE.has(rel)) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const files = walk(ROOT);
let applied = 0, skipped = 0, noSlot = [];
const noBoxSizing = [];

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  let html = fs.readFileSync(f, 'utf8');
  if (html.includes(MARK)) { skipped++; continue; }
  if (!/box-sizing:\s*border-box/.test(html)) noBoxSizing.push(rel);

  const lower = html.toLowerCase();
  let idx = lower.lastIndexOf('</style>');
  if (idx === -1) {
    // 没有 style 块：在 </head> 前新建一个
    const hIdx = lower.lastIndexOf('</head>');
    if (hIdx === -1) { noSlot.push(rel); continue; }
    html = html.slice(0, hIdx) + '<style>' + CSS + '</style>\n' + html.slice(hIdx);
  } else {
    html = html.slice(0, idx) + CSS + html.slice(idx);
  }
  fs.writeFileSync(f, html, 'utf8');
  applied++;
}

console.log('扫描页面:', files.length);
console.log('注入:', applied, ' 已存在跳过:', skipped, ' 无插入点:', noSlot.length);
if (noSlot.length) console.log('  无插入点:', noSlot.join(', '));
if (noBoxSizing.length) console.log('⚠️ 缺 border-box 重置:', noBoxSizing.length, noBoxSizing.slice(0, 5).join(', '));

// 自检：重跑一遍应全部命中标记
let miss = 0;
for (const f of files) if (!fs.readFileSync(f, 'utf8').includes(MARK)) miss++;
console.log(miss === 0 ? '✅ 自检通过：全部页面已含修复块' : `❌ 自检失败：${miss} 页未命中`);
