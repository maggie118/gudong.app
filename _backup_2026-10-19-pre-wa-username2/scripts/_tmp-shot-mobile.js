// 生成移动端截图（首屏 + 滚动后），人工核对 LOGO 不遮挡内容
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.workbuddy', 'shots-mobile-header');
const bd = path.join(process.env.USERPROFILE || '', '.agent-browser', 'browsers');
const CHROME = path.join(bd, fs.readdirSync(bd).filter(d => d.startsWith('chrome-')).sort().pop(), 'chrome.exe');
const PAGES = (process.env.PAGES || 'index.html,items/item-lim-01.html,collection.html,insights/provenance-basics.html,pricing.html').split(',');
const DEVICES = [
  { n: 'iphone', w: 390, h: 844 },
  { n: 'android', w: 360, h: 800 },
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  for (const d of DEVICES) for (const p of PAGES) {
    const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto('file:///' + path.join(ROOT, p).split(path.sep).join('/'), { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const name = `${d.n}__${p.replace(/[\/\\]/g, '_')}`;
    await page.screenshot({ path: path.join(OUT, name + '__top.png') });
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, name + '__scrolled.png') });
    await ctx.close();
    console.log('shot', name);
  }
  await browser.close();
})();
