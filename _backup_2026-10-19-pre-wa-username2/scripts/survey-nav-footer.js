#!/usr/bin/env node
/* survey-nav-footer.js — 只读勘察：
 * 1) 全站侧栏导航与 index.html 的条目差异（href 归一化到站点根相对路径）
 * 2) footer 内容变体聚类（归一化后统计相同结构）
 * 用法：node survey-nav-footer.js            # 侧栏 + footer 都查
 *       node survey-nav-footer.js nav        # 只查侧栏
 *       node survey-nav-footer.js footer     # 只查 footer
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

function listHtml(dir, rel, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const relPath = rel ? rel + '/' + name : name;
    if (fs.statSync(full).isDirectory()) {
      if (['node_modules', '.git', '.workbuddy', 'airtable-script', 'scripts', 'templates', 'content', 'docs', '.vercel', 'prototypes'].includes(name)) continue;
      listHtml(full, relPath, out);
    } else if (name.endsWith('.html')) {
      if (!SKIP_FILES.has(relPath)) out.push(relPath);
    }
  }
}

/* 把 href 归一化到站点根相对路径（按文件所在目录解析） */
function normHref(href, relFile) {
  let h = href.trim();
  if (h.startsWith('javascript:') || h.startsWith('mailto:') || h.startsWith('tel:')) return h;
  h = h.replace(/^https?:\/\/(www\.)?gudong\.app\//, '');
  if (h.startsWith('#')) return 'index.html' + h; // 纯锚点：只可能是 index 的区块锚
  const dir = path.posix.dirname(relFile);
  const resolved = path.posix.normalize(path.posix.join(dir, h));
  return resolved === '.' ? h : resolved;
}

function decodeEntities(s) {
  return s.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
}

function fileDepth(relPath) {
  return relPath.includes('/') ? 1 : 0; // 站点只有两层
}

function extractBlock(html, startRe, endTag) {
  const sm = html.match(startRe);
  if (!sm) return null;
  const start = sm.index;
  const end = html.indexOf(endTag, start);
  if (end === -1) return null;
  return html.slice(start, end + endTag.length);
}

function parseSidebar(html, relFile) {
  const block = extractBlock(html, /<aside class="sidebar"[^>]*>/i, '</aside>');
  if (!block) return null;
  const items = [];
  const re = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(block))) {
    const attrs = m[2];
    const inner = m[3];
    const hrefM = attrs.match(/href="([^"]*)"/);
    const href = hrefM ? normHref(hrefM[1], relFile) : '(button)';
    const cls = (attrs.match(/class="([^"]*)"/) || [, ''])[1].replace(/\bactive\b/g, '').trim();
    const zh = decodeEntities((inner.match(/<span class="zh">([\s\S]*?)<\/span>/) || [, ''])[1]);
    const en = decodeEntities((inner.match(/<span class="en">([\s\S]*?)<\/span>/) || [, ''])[1]);
    const onclick = (attrs.match(/onclick="([^"]*)"/) || [, ''])[1];
    items.push({ tag: m[1], cls, href, zh, en, onclick });
  }
  return items;
}

function parseFooter(html, relFile) {
  const block = extractBlock(html, /<footer[^>]*>/i, '</footer>');
  if (!block) return null;
  const inner = block.replace(/^<footer[^>]*>/i, '').replace(/<\/footer>$/i, '');
  // 归一化：href 前缀、空白
  let n = inner.replace(/href="([^"]*)"/g, (_, h) => 'href="' + normHref(h, relFile) + '"');
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

function keyOf(item) {
  return [item.tag, item.cls, item.href, item.zh, item.en, item.onclick].join(' | ');
}

const mode = process.argv[2] || 'all';
const files = [];
listHtml(ROOT, '', files);
files.sort();

/* ---- 基准：index.html ---- */
const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const idxSidebar = parseSidebar(idxHtml, 'index.html');
const idxKeys = idxSidebar.map(keyOf);

if (mode === 'all' || mode === 'nav') {
  console.log('==== 侧栏对比（基准 index.html，共 ' + idxSidebar.length + ' 项）====');
  let clean = 0, dirty = 0;
  for (const f of files) {
    if (f === 'index.html') continue;
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const sb = parseSidebar(html, f);
    if (!sb) { console.log('\n[NO SIDEBAR] ' + f); dirty++; continue; }
    const keys = sb.map(keyOf);
    if (keys.length === idxKeys.length && keys.every((k, i) => k === idxKeys[i])) { clean++; continue; }
    dirty++;
    console.log('\n[DIFF] ' + f + '（' + keys.length + ' 项 vs 基准 ' + idxKeys.length + ' 项）');
    // 对齐展示：找最长公共子序列太重，直接按 "缺失/多余/文案不同" 汇总
    const idxMap = new Map(idxKeys.map((k, i) => [k, i]));
    const curSet = new Set(keys);
    idxKeys.forEach((k, i) => {
      if (!curSet.has(k)) {
        const partial = keys.find(x => x && x.split(' | ')[3] === k.split(' | ')[3]);
        if (partial) console.log('  文案不同 #' + i + '：基准[' + k.replace(/\s+/g, ' ') + '] 实际[' + partial.replace(/\s+/g, ' ') + ']');
        else console.log('  缺失 #' + i + '：' + k.replace(/\s+/g, ' '));
      }
    });
    keys.forEach((k, i) => {
      if (!idxMap.has(k)) {
        const partial = idxKeys.find(x => x && x.split(' | ')[3] === k.split(' | ')[3]);
        if (!partial) console.log('  多余 #' + i + '：' + k.replace(/\s+/g, ' '));
      }
    });
  }
  console.log('\n==== 小计：一致 ' + clean + ' 个，有差异 ' + dirty + ' 个 ====');
}

if (mode === 'all' || mode === 'footer') {
  console.log('\n==== footer 变体聚类 ====');
  const variants = new Map();
  for (const f of files) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const ft = parseFooter(html, f);
    if (!ft) { console.log('[NO FOOTER] ' + f); continue; }
    if (!variants.has(ft)) variants.set(ft, []);
    variants.get(ft).push(f);
  }
  let vi = 0;
  for (const [k, fl] of variants) {
    vi++;
    console.log('\n--- 变体 ' + vi + '：' + fl.length + ' 个文件 ---');
    console.log('  文件: ' + fl.join(', '));
    console.log('  内容: ' + k.slice(0, 500).replace(/\s+/g, ' '));
    if (k.length > 500) console.log('  ……（共 ' + k.length + ' 字符）');
  }
}
