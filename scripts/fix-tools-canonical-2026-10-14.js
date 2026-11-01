#!/usr/bin/env node
/**
 * fix-tools-canonical-2026-10-14.js
 * ---------------------------------------------------------------
 * 背景：vercel.json 开了 cleanUrls:true，线上 /tools/xxx.html 会被 308 重定向到
 *       /tools/xxx。但 tools 四个工具页的 canonical / hreflang / og:url / JSON-LD url
 *       仍写成带 .html 的地址 —— 等于「canonical 指向一个会重定向的 URL」，
 *       这正是 Google Search Console 报「网页会自动重定向」的同类问题。
 *
 * 顺带修 sitemap.xml 里把 currency-convert 写成了 currencyconvert 的错链（会 404）。
 *
 * 幂等：已是无扩展名形态时不再命中。
 */

const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const TOOLS = ['year-since', 'ganzhi', 'era-lookup', 'currency-convert'];
let total = 0;

for (const name of TOOLS) {
  const file = path.join(REPO, 'tools', `${name}.html`);
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  let n = 0;

  for (const [from, to] of [
    [`https://www.gudong.app/tools/${name}.html`, `https://www.gudong.app/tools/${name}`],
    [`gudong.app/tools/${name}.html`, `gudong.app/tools/${name}`],
  ]) {
    const c = html.split(from).length - 1;
    if (c > 0) { html = html.split(from).join(to); n += c; }
  }

  if (html !== before) { fs.writeFileSync(file, html); total += n; console.log(`  tools/${name}.html  (${n})`); }
}

// sitemap 错链修正
{
  const file = path.join(REPO, 'sitemap.xml');
  let xml = fs.readFileSync(file, 'utf8');
  const before = xml;
  xml = xml.split('https://www.gudong.app/tools/currencyconvert')
           .join('https://www.gudong.app/tools/currency-convert');
  if (xml !== before) { fs.writeFileSync(file, xml); total++; console.log('  sitemap.xml  (1)  currencyconvert -> currency-convert'); }
}

console.log(`共修改 ${total} 处`);
