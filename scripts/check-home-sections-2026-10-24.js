// 线上首页：所有指向 items/ 的链接，按区块归类
const CHROME = 'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const apiCalls = [];
  page.on('response', r => {
    if (r.url().includes('airtable-proxy') || r.url().includes('listings.json'))
      apiCalls.push(r.status() + '  ' + r.url().slice(0, 90));
  });
  await page.goto('https://www.gudong.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(8000);
  const r = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a[href*="items/"]').forEach(a => {
      const sec = a.closest('section, div[id]');
      out.push({
        href: a.getAttribute('href'),
        section: sec ? (sec.id || sec.className || '(匿名)').toString().slice(0, 40) : '(无容器)',
        cls: a.className.slice(0, 40),
      });
    });
    return { links: out, total: document.querySelectorAll('a[href*="items/"]').length };
  });
  console.log('指向 items/ 的链接总数: ' + r.total);
  console.log('\n按区块统计:');
  const by = {};
  r.links.forEach(l => { by[l.section] = (by[l.section] || 0) + 1; });
  Object.keys(by).forEach(k => console.log('   ' + by[k] + ' 个  ' + k + '  [class: ' + r.links.find(l => l.section === k).cls + ']'));
  console.log('\nlimck 链接:');
  const lim = r.links.filter(l => l.href.includes('limck'));
  lim.length ? lim.forEach(l => console.log('   ' + l.href + '  区块=' + l.section))
             : console.log('   (无)');
  console.log('\n数据请求:');
  [...new Set(apiCalls)].forEach(c => console.log('   ' + c));
  await browser.close();
})();
