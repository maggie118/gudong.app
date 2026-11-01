// 线上实测：item-limck-01 / 02 在首页渲染成什么样、链接指向哪、是否 404
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const base = 'C:/Users/Eastw Engineering/.agent-browser/browsers';
const CHROME = path.join(base, fs.readdirSync(base).filter(x => x.startsWith('chrome-')).sort().pop(), 'chrome.exe').replace(/\\/g, '/');

const KEYS = ['帕尔瓦蒂', 'Parvati', '四臂观音', 'Avalokiteshvara', 'limck'];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  for (const url of ['https://www.gudong.app/', 'https://www.gudong.app/collection']) {
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const cards = await page.evaluate((KEYS) => {
      const out = [];
      document.querySelectorAll('a[href]').forEach(a => {
        const t = a.innerText || '';
        const h = a.getAttribute('href') || '';
        if (KEYS.some(k => t.includes(k) || h.includes(k))) {
          const img = a.querySelector('img');
          out.push({
            href: h,
            text: t.replace(/\s+/g, ' ').trim().slice(0, 60),
            imgSrc: img ? img.getAttribute('src') : null,
            imgLoaded: img ? img.naturalWidth > 0 : null,
            visible: a.getBoundingClientRect().height > 0,
          });
        }
      });
      return out;
    }, KEYS);
    console.log('\n=== ' + url + ' ===');
    if (!cards.length) console.log('  未渲染出 limck 卡片');
    cards.forEach(c => console.log('  ' + JSON.stringify(c)));
  }

  // 逐个探测链接是否 404
  console.log('\n=== 链接可达性 ===');
  for (const u of ['https://www.gudong.app/items/item-limck-01.html',
                   'https://www.gudong.app/items/item-limck-02.html',
                   'https://www.gudong.app/item.html?id=item-limck-01',
                   'https://www.gudong.app/item.html?id=item-limck-02']) {
    const res = await page.goto(u, { waitUntil: 'domcontentloaded' });
    const body = (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 90);
    console.log('  ' + res.status() + '  ' + u + '\n        → ' + body);
  }
  await browser.close();
})();
