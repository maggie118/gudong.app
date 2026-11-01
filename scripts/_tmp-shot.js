const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
(async () => {
  const browser = await chromium.launch({ executablePath: path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92', 'chrome.exe'), headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('.trust-strip').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(__dirname, 'home-trust-strip.png') });
  await page.evaluate(() => document.querySelector('.seats-meter').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(__dirname, 'home-seats-meter.png') });
  await page.evaluate(() => document.getElementById('daily-intel').scrollIntoView());
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(__dirname, 'home-intel-heat.png') });
  await browser.close();
  console.log('done');
})();
