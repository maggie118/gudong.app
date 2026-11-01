const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
(async () => {
  const browser = await chromium.launch({ executablePath: path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92', 'chrome.exe'), headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const el = await page.$('.trust-strip');
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(__dirname, 'home-trust-mobile.png') });
  await browser.close(); console.log('done');
})();
