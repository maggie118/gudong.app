/* 临时验证：藏家展馆 more-btn 样式 */
const path = require('path');
const { chromium } = require('playwright-core');
(async () => {
  const exe = path.join(process.env.HOME || '', '.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe');
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage();
  await page.goto('file:///' + path.resolve('index.html').replace(/\\/g, '/'), { waitUntil: 'load' });
  const s = await page.$eval('.more-btn.zh', el => {
    const c = getComputedStyle(el);
    return { border: c.borderTopColor + ' ' + c.borderTopWidth, bg: c.backgroundColor, radius: c.borderRadius, color: c.color, textDecoration: c.textDecorationLine };
  });
  console.log('zh 按钮样式:', JSON.stringify(s));
  const enHidden = await page.$eval('.more-btn.en', el => getComputedStyle(el).display === 'none');
  console.log('中文下 en 隐藏:', enHidden);
  await page.click('.lang-btn');
  const enShown = await page.$eval('.more-btn.en', el => getComputedStyle(el).display !== 'none');
  const enText = await page.textContent('.more-btn.en');
  console.log('英文下 en 显示:', enShown, '文案:', enText.trim());
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
