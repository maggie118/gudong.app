const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
(async () => {
  const browser = await chromium.launch({ executablePath: path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92', 'chrome.exe'), headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    trustChips: document.querySelectorAll('.trust-chip').length,
    intelCards: document.querySelectorAll('.intel-card').length,
    seatsFill: !!document.getElementById('seatsFill'),
    seatsNum: !!document.getElementById('seatsNum'),
    servicesHtml: (document.getElementById('services') || {}).innerHTML ? document.getElementById('services').innerHTML.slice(0, 300) : 'NO services',
    scriptCount: document.querySelectorAll('script').length,
    styleCount: document.querySelectorAll('style').length
  }));
  console.log(JSON.stringify(r, null, 2));
  console.log('ERRORS:'); errs.slice(0, 10).forEach(e => console.log(' ', e));
  await browser.close();
})();
