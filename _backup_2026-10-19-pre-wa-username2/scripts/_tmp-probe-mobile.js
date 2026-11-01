// 移动端遮挡问题探针：真实 Chrome，390x844 竖屏，滚动后测量 header 是否压住首个内容元素
const path = require('path');
const { chromium } = require('playwright-core');
const fs = require('fs');

const CHROME = process.env.CHROME_BIN || (() => {
  const base = path.join(process.env.USERPROFILE || '', '.agent-browser', 'browsers');
  const dirs = fs.readdirSync(base).filter(d => d.startsWith('chrome-')).sort();
  return path.join(base, dirs[dirs.length - 1], 'chrome.exe');
})();

const PAGES = (process.env.PAGES || 'index.html,collection.html,about.html,insights/provenance-basics.html,items/item-lim-01.html,categories/jade.html,pricing.html,tools/index.html,sellers/index.html,insights.html').split(',');
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const url = 'file:///' + path.join(ROOT, p).split(path.sep).join('/');
    try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); } catch (e) { console.log(p, 'LOAD-FAIL', e.message); await ctx.close(); continue; }
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const h = document.querySelector('header');
      const main = document.querySelector('main');
      const cs = h ? getComputedStyle(h) : null;
      const hb = h ? h.getBoundingClientRect() : null;
      // 取 main 内第一个可见的标题或图片
      let first = null;
      if (main) {
        const cands = main.querySelectorAll('h1,h2,h3,img,.card,.item-card,a');
        for (const c of cands) {
          const b = c.getBoundingClientRect();
          if (b.width > 20 && b.height > 12 && b.bottom > 0 && b.top < innerHeight) { first = c; break; }
        }
      }
      const fb = first ? first.getBoundingClientRect() : null;
      return {
        headerPos: cs ? cs.position : null,
        headerZ: cs ? cs.zIndex : null,
        headerH: hb ? Math.round(hb.height) : null,
        headerTop: hb ? Math.round(hb.top) : null,
        headerBottom: hb ? Math.round(hb.bottom) : null,
        mainPadTop: main ? getComputedStyle(main).paddingTop : null,
        mainTag: main ? (main.className || '(no class)') : null,
        firstTag: first ? first.tagName + '.' + (first.className || '') : null,
        firstTop: fb ? Math.round(fb.top) : null,
        overlapped: (hb && fb) ? (fb.top < hb.bottom && fb.bottom > hb.top) : null,
        scrollY: Math.round(window.scrollY),
        bodyOverflowX: getComputedStyle(document.body).overflowX,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
      };
    });
    console.log(p.padEnd(42), JSON.stringify(r));
    await ctx.close();
  }
  await browser.close();
})();
