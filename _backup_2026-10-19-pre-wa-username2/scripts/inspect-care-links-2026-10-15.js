const { chromium } = require('playwright-core');
const os = require('os'), fs = require('fs'), path = require('path');

(async () => {
  const browsersDir = path.join(os.homedir(), '.agent-browser', 'browsers');
  const ver = fs.readdirSync(browsersDir)[0];
  const exe = path.join(browsersDir, ver, 'chrome.exe');
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  const target = 'file:///' + path.resolve('insights.html').replace(/\\/g, '/');
  await page.goto(target, { waitUntil: 'networkidle' });

  const links = await page.evaluate(() => {
    const block = document.querySelector('[data-series-id="care"]');
    if (!block) return { error: 'care block NOT FOUND' };
    return Array.from(block.querySelectorAll('a.insight-post')).map(a => ({
      href: a.getAttribute('href'),
      title: (a.querySelector('.post-title.zh') || {}).textContent
    }));
  });
  console.log('care 板块渲染结果:');
  if (links.error) console.log(links.error);
  else links.forEach(l => console.log(' ', l.href, '|', l.title));

  console.log('JS errors:', errors.length ? errors : '(none)');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
