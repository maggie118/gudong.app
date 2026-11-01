const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92', 'chrome.exe');
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  for (const rel of ['categories/jade.html','sellers/index.html','my/saved.html','items/item-lim-04.html','tools/valuation.html']) {
    const page = await ctx.newPage();
    const bad = [];
    page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    await page.goto('http://127.0.0.1:8123/' + rel, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    const ov = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      widest: (() => {
        let best = null, bw = 0;
        document.querySelectorAll('body *').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right > bw) { bw = r.right; best = (el.tagName + '.' + (el.className||'')).slice(0,60); }
        });
        return best + ' right=' + Math.round(bw);
      })()
    }));
    console.log(rel, '| local 4xx/5xx:', bad.filter(x => x.includes('127.0.0.1')).slice(0,5));
    console.log('   scrollW=' + ov.sw + ' innerW=' + ov.iw + ' 最右元素: ' + ov.widest);
    await page.close();
  }
  await browser.close();
})();
