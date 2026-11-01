#!/usr/bin/env node
/**
 * smoke-file-protocol-2026-10-14.js
 * ---------------------------------------------------------------
 * 用真实 Chrome 以 file:// 协议（= 本地双击打开）加载若干代表页面，
 * 断言：CSS / JS / 图标 / 图片 等本地资源全部加载成功，无 404/加载失败。
 *
 * 预期的「失败」仅限这两类（file:// 下必然失败，与路径无关）：
 *   - /api/**           服务端接口，本地没有后端
 *   - data/listings.json   fetch 在 file:// 下被 CORS 拦截
 *
 * 用法：NODE_PATH=<workspace>/node_modules node scripts/smoke-file-protocol-2026-10-14.js
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const REPO = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME_PATH || path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.agent-browser', 'browsers', 'chrome-154.0.8037.92', 'chrome.exe'
);

const PAGES = [
  'index.html',
  'collection.html',
  'about.html',
  'pricing.html',
  'insights.html',
  'insights/what-is-jianlou.html',
  'items/item-lim-01.html',
  'categories/jade.html',
  'sellers/index.html',
  'sellers/seller-lim-kw-antiques.html',
  'tools/index.html',
  'tools/year-since.html',
  'my/saved.html',
];

const EXPECTED_FAIL = /\/api\/|data\/listings\.json/i;
const isLocal = (u) => u.startsWith('file:') || u.includes('127.0.0.1') || u.includes('localhost');

// 可选：BASE=http://127.0.0.1:8787 时改为走 HTTP（模拟部署后的相对路径解析）
const BASE = process.env.BASE || null;

function toFile(p) {
  if (BASE) return `${BASE.replace(/\/$/, '')}/${p}`;
  return 'file:///' + path.join(REPO, p).replace(/\\/g, '/');
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error(`找不到 Chrome: ${CHROME}\n可用 CHROME_PATH 环境变量覆盖。`);
    process.exit(2);
  }
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  let problems = 0;

  for (const page of PAGES) {
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    const failed = [];
    const badStatus = [];

    pg.on('requestfailed', (r) => {
      if (isLocal(r.url()) && !EXPECTED_FAIL.test(r.url())) {
        failed.push(`${r.url()}  (${(r.failure() || {}).errorText})`);
      }
    });
    pg.on('response', (r) => {
      if (isLocal(r.url()) && !EXPECTED_FAIL.test(r.url()) && r.status() >= 400) badStatus.push(`${r.status()} ${r.url()}`);
    });

    await pg.goto(toFile(page), { waitUntil: 'load', timeout: 30000 }).catch((e) => failed.push('goto: ' + e.message));
    await pg.waitForTimeout(1200);

    const info = await pg.evaluate(() => {
      const imgs = [...document.images];
      return {
        imgTotal: imgs.length,
        imgBrokenLocal: imgs.filter((i) => i.currentSrc.startsWith('file:') ? i.naturalWidth === 0 : false).length,
        hasCss: getComputedStyle(document.body).fontFamily.indexOf('serif') > -1 || document.styleSheets.length > 0,
        sheets: document.styleSheets.length,
        scripts: document.scripts.length,
      };
    });

    const ok = failed.length === 0 && badStatus.length === 0 && info.imgBrokenLocal === 0;
    if (!ok) problems++;
    console.log(`${ok ? '✓' : '✗'} ${page}  stylesheet=${info.sheets} script=${info.scripts} img=${info.imgTotal}(brokenLocal=${info.imgBrokenLocal})`);
    for (const f of failed) console.log(`    ✗ 资源加载失败: ${f}`);
    for (const b of badStatus) console.log(`    ✗ 状态码异常: ${b}`);

    await ctx.close();
  }

  await browser.close();
  console.log(problems ? `\n有 ${problems} 个页面存在问题` : '\n全部页面本地资源加载正常 ✓');
  process.exit(problems ? 1 : 0);
})();
