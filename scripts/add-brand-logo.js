// 给所有页面的 header .brand 加 logo-mark.png（对齐 index.html 的实现）
// 用法: node scripts/add-brand-logo.js
// 幂等：已含 brand-logo-img 的文件自动跳过
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// 相对根目录的图片前缀，按页面深度决定
const IMG_SRC = {
  0: 'assets/icons/logo-mark.png',
  1: '../assets/icons/logo-mark.png',
  3: '../../../assets/icons/logo-mark.png',
};

const CSS_BLOCK = [
  '.brand { flex-direction: row; align-items: center; gap: .6rem; }',
  '.brand-logo-img { height: 36px; width: auto; display: block; object-fit: contain; }',
  '.brand-text { display: flex; flex-direction: column; justify-content: center; }',
  '@media (max-width: 640px) { .brand-logo-img { height: 30px; } }',
];

function collect(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', 'airtable-script', 'content'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = collect(ROOT, []).filter(f => !f.endsWith('index.html') || path.dirname(f) !== ROOT);
let ok = 0, skip = 0, fail = [];

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.includes('brand-logo-img')) { skip++; continue; }        // 幂等
  if (!/class="brand"/.test(html)) continue;                        // 无 header 品牌区

  const depth = path.relative(ROOT, file).split(path.sep).length - 1;
  const src = IMG_SRC[depth] || '../'.repeat(depth) + 'assets/icons/logo-mark.png';
  const orig = html;

  // 1) HTML：<a class="brand"> 内插 img，并把原内容包进 .brand-text（保留原 EOL/缩进）
  html = html.replace(
    /(<a[^>]*class="brand"[^>]*>)(\r?\n)([ \t]*)([\s\S]*?)(\r?\n)([ \t]*)(<\/a>)/,
    (m, a, nl1, ind, inner, nl2, ind2, close) =>
      `${a}${nl1}${ind}<img src="${src}" alt="古董圈 Gudong" class="brand-logo-img">` +
      `${nl1}${ind}<div class="brand-text">${nl1}${ind}${inner}${nl1}${ind}</div>${nl2}${ind2}${close}`
  );

  // 2) CSS：在 .brand h1 规则前追加覆盖块（沿用该位置原有的 EOL）
  html = html.replace(/(\r?\n)([ \t]*)(\.brand h1 \{)/, (m, nl, ind) => {
    const block = CSS_BLOCK.map(r => ind + r).join(nl);
    return `${nl}${block}${nl}${ind}.brand h1 {`;
  });

  if (html === orig) { fail.push(path.relative(ROOT, file) + ' (no match)'); continue; }
  if (!html.includes('brand-logo-img') || !html.includes('brand-text')) {
    fail.push(path.relative(ROOT, file) + ' (partial)'); continue;
  }
  // 删回比对自检：确保只动了目标区块
  fs.writeFileSync(file, html);
  ok++;
}

console.log(`OK: ${ok}  Skip: ${skip}  Fail: ${fail.length}`);
fail.forEach(f => console.log('  FAIL ' + f));
