const { chromium } = require('playwright-core');
const path = require('path');
const os = require('os');
(async () => {
  const browser = await chromium.launch({ executablePath: path.join(os.homedir(), '.agent-browser/browsers/chrome-154.0.8037.92', 'chrome.exe'), headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.setItem('gudong_lang', 'en'); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2000);
  const r = await page.evaluate(() => {
    const vis = el => el && el.getBoundingClientRect().width > 0;
    const badge = document.querySelector('.hero-privacy-badge');
    const stat = document.querySelector('.hero-stat');
    const label = document.querySelector('.pro-tags-label');
    const heat = document.querySelector('.intel-heat');
    const wa = document.querySelector('.gd-mobar-btn--wa');
    return {
      lang: document.body.dataset.lang,
      badgeEn: vis(badge.querySelector('.en')) && !vis(badge.querySelector('.zh')),
      badgeTxt: badge.querySelector('.en').innerText.trim(),
      statEn: stat.querySelector('.en').innerText.trim(),
      labelEn: label.innerText.trim(),
      heatEn: heat.innerText.trim(),
      waEn: wa.innerText.trim(),
      seatsHeadEn: document.querySelector('.seats-label .en').innerText.trim()
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await page.screenshot({ path: path.join(__dirname, 'home-revamp-en-390.png') });
  await browser.close();
})();
