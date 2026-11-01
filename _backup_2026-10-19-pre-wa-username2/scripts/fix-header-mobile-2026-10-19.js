/**
 * 手机端顶部区修复（2026-10-19）
 *  A. 窄屏 LOGO 区完整性（品牌文字/副标题被裁）—— 注入 gd-header-logo-fit-2026-10-16
 *  B. LOGO 图片路径 404（相对层级错误导致 onerror 隐藏）—— 按磁盘解析自动纠正
 *  C. 分享按钮塌陷（缺 .gd-share-btn CSS，SVG 无尺寸约束 → 4x21）—— 补完整样式
 * 幂等：全部带标记或存在性判断；定点替换，不重排换行符。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIR = /^(_backup[\w-]*|_upload[\w-]*|airtable-script|node_modules|\.git|\.workbuddy|prototypes|scripts|templates|content|docs|\.vercel)$/;
const SKIP_FILE = new Set(['google83a67404841a5314.html']);

/* ---------- A. 窄屏 LOGO 区完整性 ---------- */
const LOGO_FIT_MARK = 'gd-header-logo-fit-2026-10-16';
const LOGO_FIT_CSS = `
/*<<<${LOGO_FIT_MARK}>>> 窄屏 LOGO 区完整性修复（仅 ≤480px 生效，桌面端保持原样）*/
@media (max-width: 480px){
  body > header { padding-left: 3% !important; padding-right: 3% !important; gap: .45rem !important; }
  body > header > div:first-child { gap: .45rem !important; }
  body > header .brand-logo-img { height: 28px !important; }
  .brand { gap: .45rem !important; }
  .brand-zh, .brand-en { font-size: min(1.05rem, 4.2vw) !important; }
  .brand-text small { font-size: .58rem !important; letter-spacing: .05em !important; }
  .header-right { gap: .4rem !important; }
}
@media (max-width: 360px){
  body > header { padding-left: 2% !important; padding-right: 2% !important; gap: .35rem !important; }
  body > header > div:first-child { gap: .35rem !important; }
  .brand { gap: .35rem !important; }
  .header-right { gap: .3rem !important; }
  .brand-zh, .brand-en { font-size: min(1.05rem, 4vw) !important; }
  .brand-text small { display: none !important; }
  .menu-toggle { width: 40px !important; height: 40px !important; }
  .gd-share-btn { min-width: 40px !important; min-height: 40px !important; padding: .35rem !important; }
  .lang-btn { min-width: 40px !important; min-height: 40px !important; padding: .35rem .5rem !important; }
}
/*<<</${LOGO_FIT_MARK}>>>*/
`;

/* ---------- C. 分享按钮兜底样式（仅给缺 CSS 的页面补，避免覆盖已有正确样式） ---------- */
const SHARE_MARK = 'gd-share-btn-fit-2026-10-19';
const SHARE_CSS = `
/*<<<${SHARE_MARK}>>> 分享按钮尺寸兜底（原页面缺 .gd-share-btn 定义导致按钮塌陷）*/
.gd-share-btn {
    border: 1px solid var(--color-border, #E4DED5); background: transparent;
    color: var(--color-text-secondary, #5C564F); padding: .55rem .7rem;
    min-height: 44px; min-width: 44px; border-radius: var(--btn-radius, 8px);
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0; box-sizing: border-box;
}
.gd-share-btn svg { width: 16px; height: 16px; fill: currentColor; display: block; }
/*<<</${SHARE_MARK}>>>*/
`;
const SHARE_SVG_ONLY_CSS = `
/*<<<${SHARE_MARK}>>> 分享图标尺寸兜底（原页面缺 .gd-share-btn svg 定义导致图标 0x0）*/
.gd-share-btn svg { width: 16px; height: 16px; fill: currentColor; display: block; }
/*<<</${SHARE_MARK}>>>*/
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

/** 在最后一个 </style> 之前插入；无 style 则在 </head> 前新建 */
function insertCss(html, css) {
  const lower = html.toLowerCase();
  const idx = lower.lastIndexOf('</style>');
  if (idx !== -1) return html.slice(0, idx) + css + html.slice(idx);
  const h = lower.lastIndexOf('</head>');
  if (h === -1) return null;
  return html.slice(0, h) + '<style>' + css + '</style>\n' + html.slice(h);
}

const files = walk(ROOT);
const stat = { logoFit: 0, logoPath: 0, shareFull: 0, shareSvg: 0, skip: [] };

for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  let html = fs.readFileSync(f, 'utf8');
  let changed = false;

  /* ---- A. 窄屏 LOGO 区（仅对有 body>header 的页面） ---- */
  if (/<header[\s>]/.test(html) && !html.includes(LOGO_FIT_MARK)) {
    const next = insertCss(html, LOGO_FIT_CSS);
    if (next) { html = next; changed = true; stat.logoFit++; }
    else stat.skip.push(rel + ' (A无插入点)');
  }

  /* ---- B. LOGO 图片路径 404 自动纠正 ---- */
  const imgRe = /(<img[^>]*class="[^"]*brand-logo-img[^"]*"[^>]*>)/g;
  let m;
  const fixes = [];
  while ((m = imgRe.exec(html))) {
    const tag = m[1];
    const srcM = tag.match(/src="([^"]*)"/);
    if (!srcM) continue;
    const src = srcM[1];
    if (/^https?:|^\/\/|^\//.test(src)) continue;
    const cur = path.resolve(path.dirname(f), src.split('/').join(path.sep));
    if (fs.existsSync(cur)) continue;
    // 候选：去掉一层 ../ 或 加一层 ../
    const cands = [];
    if (src.startsWith('../')) cands.push(src.replace(/^\.\.\//, ''));
    cands.push('../' + src);
    let hit = null;
    for (const c of cands) {
      const p = path.resolve(path.dirname(f), c.split('/').join(path.sep));
      if (fs.existsSync(p)) { hit = c; break; }
    }
    if (hit) fixes.push([tag, src, hit]);
  }
  for (const [tag, src, hit] of fixes) {
    const newTag = tag.replace(`src="${src}"`, `src="${hit}"`);
    html = html.replace(tag, newTag);
    changed = true; stat.logoPath++;
    console.log(`  [LOGO路径] ${rel}: ${src} -> ${hit}`);
  }

  /* ---- C. 分享按钮 ---- */
  if (/class="[^"]*gd-share-btn[^"]*"/.test(html)) {
    const hasBtn = /\.gd-share-btn\s*\{/.test(html);
    const hasSvg = /\.gd-share-btn\s+svg\s*\{/.test(html);
    if (!hasBtn && !hasSvg) {
      const next = insertCss(html, SHARE_CSS);
      if (next) { html = next; changed = true; stat.shareFull++; console.log(`  [分享按钮] ${rel}: 补完整样式`); }
    } else if (!hasSvg) {
      const next = insertCss(html, SHARE_SVG_ONLY_CSS);
      if (next) { html = next; changed = true; stat.shareSvg++; console.log(`  [分享图标] ${rel}: 补 svg 尺寸`); }
    }
  }

  if (changed) fs.writeFileSync(f, html, 'utf8');
}

console.log('\n===== 修复统计 =====');
console.log('A 窄屏 LOGO 区补丁注入:', stat.logoFit, '页');
console.log('B LOGO 图片路径纠正:', stat.logoPath, '处');
console.log('C 分享按钮补全样式:', stat.shareFull, '页 / 仅补 svg:', stat.shareSvg, '页');
if (stat.skip.length) console.log('跳过:', stat.skip.join(', '));

/* ---- 自检 ---- */
let missLogoFit = 0, missShare = 0, badLogo = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  if (/<header[\s>]/.test(html) && !html.includes(LOGO_FIT_MARK)) missLogoFit++;
  if (/class="[^"]*gd-share-btn[^"]*"/.test(html) && !/\.gd-share-btn\s+svg\s*\{/.test(html)) missShare++;
  const mm = html.match(/<img[^>]*class="[^"]*brand-logo-img[^"]*"[^>]*>/g) || [];
  for (const tag of mm) {
    const s = (tag.match(/src="([^"]*)"/) || [])[1];
    if (!s || /^https?:|^\/\//.test(s)) continue;
    if (!fs.existsSync(path.resolve(path.dirname(f), s.split('/').join(path.sep)))) badLogo++;
  }
}
console.log(`自检 → 缺 LOGO 区补丁: ${missLogoFit} 页 | 缺分享 svg 规则: ${missShare} 页 | LOGO 仍 404: ${badLogo} 处`);
console.log(missLogoFit === 0 && missShare === 0 && badLogo === 0 ? '✅ 自检通过' : '⚠️ 自检仍有残留（见上）');
