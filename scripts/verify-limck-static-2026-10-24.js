// 本地起 http server，验证新生成的 limck 静态页（主图 / LOGO / 标题 / 规格）
const http = require('http');
const fs = require('fs');
const path = require('path');
const CHROME = 'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json',
  '.js': 'application/javascript', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.css': 'text/css',
};

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

const PAGES = ['items/item-limck-02.html', 'items/item-limck-01.html'];

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  let pass = 0, fail = 0;

  for (const pg of PAGES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto('http://127.0.0.1:' + port + '/' + pg, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => {
      const img = document.getElementById('mainImage');
      const logo = document.querySelector('.brand-logo-img');
      const t = document.querySelector('.item-detail-title.zh');
      const m = document.querySelector('.item-detail-meta.zh');
      const sp = [...document.querySelectorAll('.spec-value')]
        .map(x => x.textContent.trim()).filter(Boolean).slice(0, 5);
      return {
        title: t ? t.textContent.trim() : '(无)',
        meta: m ? m.textContent.trim().slice(0, 45) : '(无)',
        img: img ? img.getAttribute('src') : null,
        nat: img ? img.naturalWidth + 'x' + img.naturalHeight : 'n/a',
        logo: logo ? logo.getAttribute('src') : null,
        logoNat: logo ? logo.naturalWidth + 'x' + logo.naturalHeight : 'n/a',
        spec: sp.join(' | '),
      };
    });
    const ok = r.img && r.img.includes('limck') && r.nat !== '0x0'
      && r.logo && r.logo.includes('logo-mark') && r.title !== '藏品详情';
    ok ? pass++ : fail++;
    console.log('--- ' + pg + ' --- ' + (ok ? 'PASS' : 'FAIL'));
    console.log('  标题   : ' + r.title);
    console.log('  元信息 : ' + r.meta);
    console.log('  主图   : ' + r.img + '  (' + r.nat + ')');
    console.log('  LOGO   : ' + r.logo + '  (' + r.logoNat + ')');
    console.log('  规格   : ' + r.spec);
    await page.close();
  }
  await browser.close();
  server.close();
  console.log('\n==== PASS ' + pass + ' / FAIL ' + fail + ' ====');
  process.exit(0);
})();
