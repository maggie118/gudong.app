// 线上端到端：侧边栏 About 是否为可点击链接（而非裸文本）
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const base = 'C:/Users/Eastw Engineering/.agent-browser/browsers';
const CHROME = path.join(base, fs.readdirSync(base).filter(x => x.startsWith('chrome-')).sort().pop(), 'chrome.exe').replace(/\\/g, '/');

const URLS = [
  'https://www.gudong.app/tools/contract','https://www.gudong.app/tools/currency-convert',
  'https://www.gudong.app/tools/era-lookup','https://www.gudong.app/tools/ganzhi',
  'https://www.gudong.app/tools/mark-lookup','https://www.gudong.app/tools/valuation',
  'https://www.gudong.app/tools/year-since',
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  let pass = 0, fail = 0;
  for (const url of URLS) {
    await page.goto(url, { waitUntil: 'load' });
    const r = await page.evaluate(() => {
      const nav = document.querySelector('.sidebar-nav');
      if (!nav) return { err: 'no-sidebar-nav' };
      const about = [...nav.querySelectorAll('a')].find(a => /about\.html$/.test(a.getAttribute('href') || ''));
      const raw = [...nav.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())
        .map(n => n.textContent.trim().slice(0, 50));
      return {
        hasAbout: !!about,
        text: about ? about.innerText.replace(/\s+/g, ' ').trim() : null,
        visible: about ? getComputedStyle(about).display !== 'none' : false,
        clickable: about ? about.getBoundingClientRect().height > 0 : false,
        raw
      };
    });
    const ok = r.hasAbout && r.visible && r.clickable && r.raw.length === 0;
    ok ? pass++ : fail++;
    console.log((ok ? 'PASS ' : 'FAIL ') + url);
    console.log('     ' + JSON.stringify(r));
  }
  console.log('\n线上 PASS=' + pass + '  FAIL=' + fail);
  await browser.close();
})();
