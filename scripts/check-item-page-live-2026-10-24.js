// 实测 /item?id=xxx 线上渲染状态 + 抓取失败请求
const CHROME = process.env.CHROME_PATH ||
  'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';
const { chromium } = require('playwright-core');

const PAGES = [
  ['https://www.gudong.app/item?id=item-limck-02', 'limck-02'],
  ['https://www.gudong.app/item?id=item-lim-01', 'lim-01(对照)'],
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  for (const [url, name] of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const bad = [];
    page.on('response', r => {
      if (r.status() >= 400) bad.push(r.status() + '  ' + r.url().slice(0, 110));
    });
    page.on('requestfailed', r => bad.push('FAILED  ' + r.url().slice(0, 110)));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(6000);
      const r = await page.evaluate(() => {
        const img = document.getElementById('mainImage');
        const t = document.querySelector('.item-detail-title.zh');
        return {
          source: document.documentElement.dataset.source || '(未设置)',
          title: t ? t.textContent.trim() : '(无)',
          src: img ? img.getAttribute('src') : null,
          nat: img ? img.naturalWidth + 'x' + img.naturalHeight : 'n/a',
          thumbs: document.querySelectorAll('.image-thumb').length,
        };
      });
      console.log('\n══ ' + name + ' ══');
      console.log('  data-source : ' + r.source);
      console.log('  标题(zh)    : ' + r.title);
      console.log('  主图 src    : ' + r.src);
      console.log('  naturalSize : ' + r.nat);
      console.log('  缩略图数量  : ' + r.thumbs);
      console.log('  --- 失败请求 (' + bad.length + ') ---');
      [...new Set(bad)].slice(0, 8).forEach(b => console.log('    ' + b));
    } catch (e) {
      console.log('\n══ ' + name + ' ══ 异常: ' + e.message.slice(0, 100));
    }
    await page.close();
  }
  await browser.close();
})();
