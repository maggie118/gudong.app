// 线上实测：about.html 分享按钮是否有 JS 报错
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const base = 'C:/Users/Eastw Engineering/.agent-browser/browsers';
const CHROME = path.join(base, fs.readdirSync(base).filter(x => x.startsWith('chrome-')).sort().pop(), 'chrome.exe').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  for (const url of ['https://www.gudong.app/about', 'https://www.gudong.app/']) {
    errs.length = 0;
    await page.goto(url, { waitUntil: 'load' });
    const info = await page.evaluate(() => {
      const btn = document.querySelector('.gd-share-btn');
      return {
        hasBtn: !!btn,
        fnDefined: typeof window.gdSharePage,
        rect: btn ? [Math.round(btn.getBoundingClientRect().width), Math.round(btn.getBoundingClientRect().height)] : null,
      };
    });
    if (info.hasBtn) {
      await page.click('.gd-share-btn').catch(e => errs.push('click failed: ' + e.message));
      await page.waitForTimeout(600);
    }
    const modal = await page.evaluate(() => {
      const m = document.querySelector('.gd-install-modal') || document.querySelector('[class*="install-modal"]');
      return m ? getComputedStyle(m).display : 'no-modal';
    });
    console.log(url);
    console.log('   ' + JSON.stringify(info) + '  弹窗display=' + modal);
    console.log('   错误: ' + (errs.length ? errs.join(' | ') : '无'));
  }
  await browser.close();
})();
