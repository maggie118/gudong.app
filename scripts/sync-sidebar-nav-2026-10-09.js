#!/usr/bin/env node
/* sync-sidebar-nav-2026-10-09.js — 全站左侧导航与 index.html 对齐（2026-10-09）
 * 以 index.html 的 sidebar-nav 为唯一基准，整体替换其他页面的 <nav class="sidebar-nav"> 内容：
 *  - depth-1 页面（categories/ items/ sellers/ my/ insights/）自动加 ../ 前缀
 *  - 当前页对应链接自动加 active（仅 sidebar-link 有 active 样式，sidebar-sub 不加）
 *  - 幂等；保留各文件换行风格（\n / \r\n 均可）
 * 覆盖范围：根目录 + categories + items + sellers + my + insights + templates/article.html
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_FILES = new Set([
  'assets/images/lim-kw/item-lim-01.html',
  'assets/brand/logo-preview.html',
  'Untitled-5.html',
  'index.html', // 基准本身
]);

/* 基准导航（root-relative href, class, zh, en）。#锚点属于 index 区块锚 */
const NAV = [
  { cls: 'sidebar-link', href: 'index.html',            zh: '首页',            en: 'Home' },
  { cls: 'sidebar-link', href: 'my/saved.html',         zh: '我的收藏 · 关注', en: 'Saved &amp; Followed' },
  { cls: 'sidebar-link', href: 'my/briefing.html',      zh: '今日简报',        en: "Today's Brief" },
  { cls: 'sidebar-sub',  href: 'index.html#daily-intel', zh: '· 捡漏情报',     en: '· Insider Tips' },
  { cls: 'sidebar-sub',  href: 'index.html#today-finds', zh: '· 今日发现',     en: "· Today's Finds" },
  { cls: 'sidebar-sub',  href: 'index.html#new-listings', zh: '· 刚刚上新',    en: '· Just Listed' },
  { cls: 'sidebar-link', href: 'collection.html',       zh: '藏品库',          en: 'Collection' },
  { cls: 'sidebar-sub',  href: 'categories/porcelain.html', zh: '· 瓷器',       en: '· Porcelain' },
  { cls: 'sidebar-sub',  href: 'categories/jade.html',  zh: '· 玉器',          en: '· Jade' },
  { cls: 'sidebar-sub',  href: 'categories/bronze.html', zh: '· 铜器',         en: '· Bronzes' },
  { cls: 'sidebar-sub',  href: 'categories/coins.html', zh: '· 钱币',          en: '· Coins' },
  { cls: 'sidebar-sub',  href: 'categories/paintings.html', zh: '· 书画',      en: '· Paintings &amp; Calligraphy' },
  { cls: 'sidebar-sub',  href: 'categories/misc.html',  zh: '· 杂项',          en: '· Miscellaneous' },
  { cls: 'sidebar-link', href: 'sellers/index.html',    zh: '私家藏馆',      en: 'Private Gallery' },
  { cls: 'sidebar-link', href: 'insights.html',         zh: '情报 / 知识',     en: 'Insights' },
  /* 2026-10-11 新增：工具分组（收藏参考资源，与情报知识强相关但独立分组） */
  { cls: 'sidebar-link', href: 'tools/index.html',      zh: '工具',            en: 'Tools' },
  { cls: 'sidebar-sub',  href: 'tools/index.html',      zh: '· 工具汇总首页',  en: '· Tools Home' },
  { cls: 'sidebar-sub',  href: 'tools/year-since.html', zh: '· 年份距今计算器', en: '· Years-since-year Calculator' },
  { cls: 'sidebar-sub',  href: 'tools/ganzhi.html',     zh: '· 干支公历换算器', en: '· Sexagenary-Gregorian Converter' },
  { comment: '未上线先注释：· 古文化·朝代年代速查表 Culture & Dynasty Era Lookup → tools/era-lookup.html' },
  { cls: 'sidebar-link', href: 'about.html',            zh: '关于我们',        en: 'About' },
];

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

function buildNav(relFile, eol) {
  const depth = relFile.includes('/') ? 1 : 0;
  const P = depth === 1 ? '../' : '';
  const cur = path.posix.normalize(relFile); // e.g. categories/bronze.html
  const lines = [];
  for (const it of NAV) {
    if (it.comment) {
      lines.push('            <!-- ' + it.comment + ' -->');
      continue;
    }
    const active = it.href === cur ? ' active' : '';
    lines.push('            <a href="' + P + it.href + '" class="' + it.cls + active + '" onclick="closeSidebar()"><span class="zh">' + it.zh + '</span><span class="en">' + it.en + '</span></a>');
  }
  lines.push('            <button type="button" class="sidebar-lang-btn" onclick="toggleLang()" aria-label="Switch language"><span class="zh">🌐 English</span><span class="en">🌐 中文</span></button>');
  return lines.join(eol);
}

const files = [];
listHtml(ROOT, '', files);
files.push('templates/article.html');
const unique = [...new Set(files)];
unique.sort();

let synced = 0, already = 0, skipped = 0;
for (const rel of unique) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  const startRe = /<nav class="sidebar-nav">/;
  const sm = html.match(startRe);
  if (!sm) { console.log('[SKIP·无 sidebar-nav] ' + rel); skipped++; continue; }
  const navStart = sm.index + sm[0].length;
  const navEnd = html.indexOf('</nav>', navStart);
  if (navEnd === -1) { console.log('[SKIP·nav 未闭合] ' + rel); skipped++; continue; }

  const eol = (html.slice(navStart, navEnd).match(/\r\n/) || html.match(/\r\n/)) ? '\r\n' : '\n';
  const wanted = buildNav(rel, eol);
  const current = html.slice(navStart, navEnd);
  if (current === eol + wanted) { already++; continue; }
  if (current.replace(/\s+/g, ' ').trim() === wanted.replace(/\s+/g, ' ').trim()) { already++; continue; } // 仅空白差异

  const out = html.slice(0, navStart) + eol + wanted + html.slice(navEnd);
  fs.writeFileSync(file, out);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== out) { console.error('[FAIL·写回不一致] ' + rel); process.exitCode = 1; continue; }
  synced++;
  console.log('[SYNC] ' + rel);
}
console.log('---- 完成：同步 ' + synced + '，本已一致 ' + already + '，跳过 ' + skipped + ' ----');
