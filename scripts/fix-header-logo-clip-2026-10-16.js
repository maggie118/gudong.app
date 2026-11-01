#!/usr/bin/env node
/**
 * fix-header-logo-clip-2026-10-16.js
 *
 * 问题：窄屏（≤480px）时顶部 header 的横向空间不够，`.brand-text` 本身带
 *       `overflow:hidden; white-space:nowrap`，于是 LOGO 文字「古董圈 Gudong」
 *       与副行「COLLECTORS' NETWORK」被静默截断，视觉上像是被右侧的分享按钮压住。
 *
 * 做法：在每个页面**最后一个 <style> 块末尾**（紧跟 gd-mobile-header-fix-2026-10-16
 *       之后，保证层叠顺序最后）追加一段只在 ≤480px / ≤360px 生效的收缩规则：
 *         - 收紧 header 左右内边距与各段 gap
 *         - 收紧 LOGO 图高度到 28px
 *         - LOGO 文字改为 min(1.05rem, 4.2vw) 随视口平滑缩放（≤360px 用 4.6vw）
 *         - 副行文字缩小；≤360px 直接隐藏副行以保证主标题完整
 *       桌面端（>480px）样式完全不变。
 *
 * 幂等：凡已包含标记 /*<<<gd-header-logo-fit-2026-10-16>>> 的文件直接跳过。
 *
 * 用法： node scripts/fix-header-logo-clip-2026-10-16.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARK_OPEN = '/*<<<gd-header-logo-fit-2026-10-16>>>';
const MARK_CLOSE = '/*<<</gd-header-logo-fit-2026-10-16>>>*/';
const ANCHOR = '/*<<</gd-mobile-header-fix-2026-10-16>>>*/';

const SKIP_DIRS = new Set([
  '_backup_2026-10-14',
  '_backup_2026-10-16-pre-header',
  'airtable-script',
  'node_modules',
  '.git',
  '.workbuddy',
  'prototypes',
  'scripts',
  'docs',
  '.vercel',
  'content', // 正文片段，无 header
]);

const BLOCK_LINES = [
  '',
  MARK_OPEN + " 窄屏 LOGO 完整性修复（仅 ≤480px 生效，桌面端保持原样）*/",
  '@media (max-width: 480px){',
  '  body > header { padding-left: 3% !important; padding-right: 3% !important; gap: .45rem !important; }',
  '  body > header > div:first-child { gap: .45rem !important; }',
  '  body > header .brand-logo-img { height: 28px !important; }',
  '  .brand { gap: .45rem !important; }',
  '  .brand-zh, .brand-en { font-size: min(1.05rem, 4.2vw) !important; }',
  '  .brand-text small { font-size: .58rem !important; letter-spacing: .05em !important; }',
  '  .header-right { gap: .4rem !important; }',
  '}',
  '@media (max-width: 360px){',
  '  body > header { padding-left: 2% !important; padding-right: 2% !important; gap: .35rem !important; }',
  '  body > header > div:first-child { gap: .35rem !important; }',
  '  .brand { gap: .35rem !important; }',
  '  .header-right { gap: .3rem !important; }',
  '  .brand-zh, .brand-en { font-size: min(1.05rem, 4vw) !important; }',
  '  .brand-text small { display: none !important; }',
  '  .menu-toggle { width: 40px !important; height: 40px !important; }',
  '  .gd-share-btn { min-width: 40px !important; min-height: 40px !important; padding: .35rem !important; }',
  '  .lang-btn { min-width: 40px !important; min-height: 40px !important; padding: .35rem .5rem !important; }',
  '}',
  MARK_CLOSE,
];

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // 跳过所有以 _ 开头的本地回滚快照目录，以及工具/片段目录
      if (entry.name.startsWith('_')) continue;
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      if (entry.name.startsWith('_')) continue; // 跳过本地临时/快照页
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = walk(ROOT, []);
let changed = 0;
let skipped = 0;
const problems = [];

for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');

  // 只处理带公共 header（含 LOGO 文字块）的页面
  if (!html.includes('<span class="brand-text">')) continue;

  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const block = BLOCK_LINES.join(eol);

  // ---- 已打过补丁：用最新参数原地替换（方便以后微调数值后一键重刷）----
  if (html.includes(MARK_OPEN)) {
    let s = html.indexOf(MARK_OPEN);
    if (html.slice(s - eol.length, s) === eol) s -= eol.length;
    const closeIdx = html.indexOf(MARK_CLOSE, s);
    if (closeIdx === -1) {
      problems.push(file + ' : open marker without close marker');
      continue;
    }
    const e = closeIdx + MARK_CLOSE.length;
    const next = html.slice(0, s) + block + html.slice(e);
    const openCount = next.split(MARK_OPEN).length - 1;
    const closeCount = next.split(MARK_CLOSE).length - 1;
    if (openCount !== 1 || closeCount !== 1) {
      problems.push(file + ' : marker count after replace ' + openCount + '/' + closeCount);
      continue;
    }
    if (next.length !== html.length + block.length - (e - s)) {
      problems.push(file + ' : unexpected length delta on replace');
      continue;
    }
    if (next === html) {
      skipped += 1;
      continue; // 内容已是最新
    }
    fs.writeFileSync(file, next, 'utf8');
    changed += 1;
    console.log('UPDATE ' + path.relative(ROOT, file));
    continue;
  }

  let next = null;
  let anchorKind = '';
  let expectedDelta = block.length;
  const anchorIdx = html.indexOf(ANCHOR);
  if (anchorIdx !== -1) {
    // 插到移动端 header 修复块之后（同一 <style> 内，保证层叠顺序最后）
    const at = anchorIdx + ANCHOR.length;
    next = html.slice(0, at) + block + html.slice(at);
    anchorKind = 'after-mobile-header-fix';
  } else {
    // 兜底：插到最后一个 </style> 之前（保证在最后一个样式块内）
    const at = html.lastIndexOf('</style>');
    if (at === -1) {
      problems.push(file + ' : no </style> found');
      continue;
    }
    next = html.slice(0, at) + block + eol + html.slice(at);
    anchorKind = 'before-last-style-close';
    expectedDelta = block.length + eol.length;
  }

  // 自检：插入后必须刚好 1 个开标记 + 1 个闭标记，且文件长度只增量变化
  const openCount = next.split(MARK_OPEN).length - 1;
  const closeCount = next.split(MARK_CLOSE).length - 1;
  if (openCount !== 1 || closeCount !== 1) {
    problems.push(file + ' : marker count ' + openCount + '/' + closeCount);
    continue;
  }
  if (next.length !== html.length + expectedDelta) {
    problems.push(file + ' : unexpected length delta');
    continue;
  }

  fs.writeFileSync(file, next, 'utf8');
  changed += 1;
  console.log('FIXED  [' + anchorKind + '] ' + path.relative(ROOT, file));
}

console.log('\n---------------');
console.log('changed : ' + changed);
console.log('skipped (already patched): ' + skipped);
console.log('problems: ' + problems.length);
for (const p of problems) console.log('  ! ' + p);
