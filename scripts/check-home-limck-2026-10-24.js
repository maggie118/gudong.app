// 线上首页：limck 卡片是否存在 + 链接指向 + 目标可访问性
const CHROME = 'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';
const { chromium } = require('playwright-core');
const https = require('https');

function status(url) {
  return new Promise(res => {
    https.get(url, r => { r.resume(); res(r.statusCode); }).on('error', () => res(0));
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('https://www.gudong.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  const cards = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a.finds-card').forEach(a => {
      const t = a.querySelector('.finds-card-title, .zh');
      out.push({
        href: a.getAttribute('href'),
        title: (t ? t.textContent : '').trim().slice(0, 30) || a.textContent.trim().slice(0, 30),
      });
    });
    return out;
  });
  console.log('首页卡片总数: ' + cards.length);
  const lim = cards.filter(c => c.href && c.href.includes('limck'));
  console.log('limck 卡片数: ' + lim.length);
  lim.forEach(c => console.log('   ' + c.href + '  |  ' + c.title));
  if (!lim.length) console.log('   (首页未渲染出 limck 卡片)');

  console.log('\n=== 各路由可访问性 ===');
  for (const u of [
    'https://www.gudong.app/items/item-limck-02.html',
    'https://www.gudong.app/items/item-limck-01.html',
    'https://www.gudong.app/items/item-lim-01.html',
    'https://www.gudong.app/item?id=item-limck-02',
  ]) {
    console.log('   ' + await status(u) + '  ' + u.replace('https://www.gudong.app', ''));
  }
  await browser.close();
})();
