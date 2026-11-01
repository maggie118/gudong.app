/**
 * 把「图片精修申请」弹窗（CSS + HTML + JS）从 categories/porcelain.html
 * 完整移植到 collection.html，并在藏品网格标题行右侧加入口链接。
 *
 * 幂等：已注入过则跳过注入，可安全重跑。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'categories', 'porcelain.html');
const DST = path.join(ROOT, 'collection.html');

const src = fs.readFileSync(SRC, 'utf8');
let dst = fs.readFileSync(DST, 'utf8');

// collection.html 用什么换行就沿用什么，不改动目标文件既有风格
const dstEol = dst.includes('\r\n') ? '\r\n' : '\n';
const normalizeEol = (s) => s.replace(/\r\n/g, '\n').replace(/\n/g, dstEol);

/* ---------- 1. 抽取 CSS ---------- */
const cssStart = src.indexOf('.pr-modal-overlay{');
if (cssStart === -1) throw new Error('源文件未找到 .pr-modal-overlay');
const cssEndMarker = '.pr-submit-btn:active{transform:translateY(1px);}';
const cssEndIdx = src.indexOf(cssEndMarker, cssStart);
if (cssEndIdx === -1) throw new Error('源文件未找到 .pr-submit-btn:active');
const prCss = src.slice(cssStart, cssEndIdx + cssEndMarker.length);

/* ---------- 2. 抽取弹窗 HTML ---------- */
// 源文件该区块为 CRLF，用与 EOL 无关的方式定位
const htmlStart = src.indexOf('<div class="pr-modal-overlay" id="photoRetouchModal"');
if (htmlStart === -1) throw new Error('源文件未找到弹窗 HTML');
const submitAt = src.indexOf('class="pr-submit-btn" onclick="submitPhotoRetouch()"', htmlStart);
if (submitAt === -1) throw new Error('源文件未找到弹窗提交按钮');
const tailAt = src.indexOf('</button>', submitAt);
if (tailAt === -1) throw new Error('源文件未找到弹窗按钮结尾');
// 按钮之后还有两层闭合：</div>(pr-modal-box) + </div>(pr-modal-overlay)
const afterBtn = src.slice(tailAt + '</button>'.length);
const closeMatch = afterBtn.match(/^\s*<\/div>\s*<\/div>/);
if (!closeMatch) throw new Error('源文件未找到弹窗两层闭合标签');
const htmlEnd = tailAt + '</button>'.length + closeMatch[0].length;
const prHtml = src.slice(htmlStart, htmlEnd);

/* ---------- 3. 抽取弹窗 JS ---------- */
const scriptOpenAt = src.indexOf('<script>', htmlEnd);
if (scriptOpenAt === -1) throw new Error('源文件未找到弹窗 script 开始标签');
const jsStart = scriptOpenAt + '<script>'.length;
// 注意：closePhotoRetouchModal() 在 Escape 处理器里也会出现，
// 必须用 lastIndexOf 定位到 submitPhotoRetouch 末尾那一次调用。
const closeCallAt = src.lastIndexOf('closePhotoRetouchModal();');
if (closeCallAt <= jsStart) throw new Error('源文件未找到 closePhotoRetouchModal 调用');
const braceEnd = src.indexOf('}', closeCallAt);
if (braceEnd === -1) throw new Error('源文件未找到函数结尾大括号');
const prJs = src.slice(jsStart, braceEnd + 1);

// 号码应已统一为 6591888952，这里做兜底断言
if (!prJs.includes('wa.me/6591888952')) {
  throw new Error('弹窗 JS 内号码不是 6591888952，请先跑 update-nav-copy-whatsapp.js');
}

const prCssN = normalizeEol(prCss);
const prHtmlN = normalizeEol(prHtml);
const prJsN = normalizeEol(prJs);

/* ---------- 4. 注入 CSS + HTML + JS ---------- */
if (dst.includes('id="photoRetouchModal"')) {
  console.log('· collection.html 已有精修弹窗，跳过注入（如需重建请先手动移除）');
} else {
  const styleClose = dst.indexOf('    </style>');
  if (styleClose === -1) throw new Error('collection.html 未找到 </style>');
  dst =
    dst.slice(0, styleClose) +
    dstEol +
    '    /* ---------- 图片精修申请弹窗（与 categories 6 页保持同一份实现） ---------- */' +
    dstEol +
    '    ' +
    prCssN +
    dstEol +
    dst.slice(styleClose);

  const footerAt = dst.indexOf('    <footer>');
  if (footerAt === -1) throw new Error('collection.html 未找到 <footer>');
  dst =
    dst.slice(0, footerAt) +
    '    ' +
    prHtmlN +
    dstEol +
    '    <script>' +
    dstEol +
    '    ' +
    prJsN +
    dstEol +
    '    </script>' +
    dstEol +
    dstEol +
    dst.slice(footerAt);

  console.log('✓ 已注入精修弹窗 CSS + HTML + JS');
}

/* ---------- 5. 藏品网格上方加入口链接 ---------- */
const GRID_ANCHOR = '        <div class="col-grid" id="allItemsGrid"></div>';
if (!dst.includes(GRID_ANCHOR)) throw new Error('collection.html 未找到藏品网格锚点');

if (dst.includes('id="retouchEntry"')) {
  console.log('· collection.html 已有精修入口链接，跳过');
} else {
  // 用不含缩进的关键串定位，避免缩进差异导致匹配失败
  const CSS_ANCHOR = '/* ---------- 图片精修申请弹窗（与 categories 6 页保持同一份实现） ---------- */';
  if (!dst.includes(CSS_ANCHOR)) throw new Error('collection.html 未找到样式插入锚点');
  const headCss = [
    '        /* ---------- 区块标题行（含「想要同款图片效果？」入口） ---------- */',
    '        .section-head2 { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; margin: .4rem 0 1rem; }',
    '        .section-head2 .title { font-size: 1.2rem; font-weight: 700; color: var(--color-text); }',
    '        .section-head2 .more { font-size: .85rem; color: var(--color-text-secondary); text-decoration: none; white-space: nowrap; }',
    '        .section-head2 .more:hover { color: var(--color-primary); }',
    '    ' + CSS_ANCHOR,
  ].join(dstEol);
  dst = dst.replace(CSS_ANCHOR, headCss);

  const head = [
    '        <div class="section-head2">',
    '            <div>',
    '                <span class="title zh">全部藏品</span><span class="title en">All Listings</span>',
    '            </div>',
    '            <a href="javascript:void(0)" class="more zh" id="retouchEntry" onclick="openPhotoRetouchModal()">想要同款图片效果？ →</a>',
    '            <a href="javascript:void(0)" class="more en" onclick="openPhotoRetouchModal()">Want the Same Photo Finish? →</a>',
    '        </div>',
  ].join(dstEol);

  dst = dst.replace(GRID_ANCHOR, head + dstEol + GRID_ANCHOR);
  console.log('✓ 已在藏品网格上方加入「想要同款图片效果？」入口');
}

fs.writeFileSync(DST, dst, 'utf8');
console.log('\ncollection.html 处理完成，大小：', (dst.length / 1024).toFixed(1), 'KB');