// 线上实测：首页 390px 下 header 是否完好（LOGO/品牌文字是否被裁）
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const base = 'C:/Users/Eastw Engineering/.agent-browser/browsers';
const CHROME = path.join(base, fs.readdirSync(base).filter(x => x.startsWith('chrome-')).sort().pop(), 'chrome.exe').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://www.gudong.app/', { waitUntil: 'load' });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const pick = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), clipped: e.scrollWidth > e.clientWidth + 1 }; };
    const logo = document.querySelector('.brand-logo-img');
    return {
      header: pick('header'),
      brandText: pick('.brand-text'),
      logo: pick('.brand-logo-img'),
      logoComplete: logo ? (logo.naturalWidth > 0 && logo.getBoundingClientRect().width > 0) : null,
      headerH: Math.round((document.querySelector('header') || {}).getBoundingClientRect?.().height || 0),
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await browser.close();
})();
