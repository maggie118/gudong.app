const { chromium } = require('playwright-core');
const path = require('path'), os = require('os');
const EXE = path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92', 'chrome.exe');
(async () => {
  const browser = await chromium.launch({ executablePath: EXE, headless: true });
  // 桌面：深层文章页
  const p1 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p1.goto('http://127.0.0.1:8123/insights/qing-porcelain-dating.html', { waitUntil: 'domcontentloaded' });
  await p1.evaluate(() => document.fonts.ready);
  await p1.waitForTimeout(1500);
  await p1.evaluate(() => openSidebar());
  await p1.waitForTimeout(700);
  await p1.screenshot({ path: path.join(__dirname, 'nav-desktop-insights.png') });
  await p1.close();
  // 桌面：工具页（英文）
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await p2.goto('http://127.0.0.1:8123/tools/index.html', { waitUntil: 'domcontentloaded' });
  await p2.evaluate(() => { localStorage.setItem('gudong_lang','en'); });
  await p2.reload({ waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(1500);
  await p2.evaluate(() => openSidebar());
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: path.join(__dirname, 'nav-desktop-tools-en.png') });
  await p2.close();
  // 移动：藏品页
  const p3 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p3.goto('http://127.0.0.1:8123/items/item-lim-04.html', { waitUntil: 'domcontentloaded' });
  await p3.evaluate(() => document.fonts.ready);
  await p3.waitForTimeout(1500);
  await p3.evaluate(() => openSidebar());
  await p3.waitForTimeout(700);
  await p3.screenshot({ path: path.join(__dirname, 'nav-mobile-item.png') });
  await p3.close();
  await browser.close(); console.log('done');
})();
