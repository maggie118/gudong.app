// 本地起 http server，实测 item.html 快照兜底是否生效
// 关键：API 线上确实 502，所以会真实走回退分支
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end('nf');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const CASES = [
  ['/item.html?id=item-limck-02', 'limck-02'],
  ['/item.html?id=item-limck-01', 'limck-01'],
  ['/item.html?id=item-lim-01', 'lim-01(对照)'],
];

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  let pass = 0, fail = 0;

  for (const [route, name] of CASES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const snaps = [];
    page.on('response', r => {
      if (r.url().includes('listings.json')) snaps.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, ''));
    });
    try {
      await page.goto('http://127.0.0.1:' + port + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      const r = await page.evaluate(() => {
        const img = document.getElementById('mainImage');
        const t = document.querySelector('.item-detail-title.zh');
        const meta = document.querySelector('.item-detail-meta.zh');
        return {
          src: document.documentElement.dataset.source,
          title: t ? t.textContent.trim() : '(无)',
          meta: meta ? meta.textContent.trim().slice(0, 50) : '(无)',
          imgSrc: img ? img.getAttribute('src') : null,
          nat: img ? img.naturalWidth + 'x' + img.naturalHeight : 'n/a',
          docTitle: document.title.slice(0, 55),
        };
      });
      // 期望：snapshot 源 + 真实图片 + 真实标题
      const isSnapshot = r.src === 'snapshot';
      const hasRealImg = r.imgSrc && !r.imgSrc.includes('placeholder');
      const imgLoaded = r.nat && r.nat !== '0x0';
      const hasRealTitle = r.title && r.title !== '藏品详情';
      const ok = isSnapshot && hasRealImg && imgLoaded && hasRealTitle;
      ok ? pass++ : fail++;
      console.log('\n── ' + name + ' ── ' + (ok ? '✅ PASS' : '❌ FAIL'));
      console.log('   data-source : ' + r.src + (isSnapshot ? '' : '   ← 期望 snapshot'));
      console.log('   标题(zh)    : ' + r.title);
      console.log('   年代/类别   : ' + r.meta);
      console.log('   主图        : ' + r.imgSrc);
      console.log('   naturalSize : ' + r.nat);
      console.log('   document.title: ' + r.docTitle);
      console.log('   快照请求    : ' + (snaps.join(', ') || '(无)'));
    } catch (e) {
      fail++;
      console.log('\n── ' + name + ' ── ❌ 异常: ' + e.message.slice(0, 110));
    }
    await page.close();
  }
  await browser.close();
  server.close();
  console.log('\n════ PASS ' + pass + ' / FAIL ' + fail + ' ════');
})();
