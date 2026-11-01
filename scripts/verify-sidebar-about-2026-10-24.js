// 端到端验证：侧边栏 About 链接是否真实可点击（无头浏览器）
const path = require('path');
const { chromium } = require('playwright-core');
const fs = require('fs');

const ROOT = 'C:/Users/Eastw Engineering/Documents/Gudong';
const CHROME = (() => {
  const base = 'C:/Users/Eastw Engineering/.agent-browser/browsers';
  const d = fs.readdirSync(base).filter(x => x.startsWith('chrome-')).sort().pop();
  return path.join(base, d, 'chrome.exe').replace(/\\/g, '/');
})();

const PAGES = [
  'tools/contract.html','tools/currency-convert.html','tools/era-lookup.html',
  'tools/ganzhi.html','tools/mark-lookup.html','tools/valuation.html','tools/year-since.html',
  'tools/index.html','index.html','about.html'
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  let pass = 0, fail = 0;
  for (const rel of PAGES) {
    const url = 'file:///' + path.join(ROOT, rel).replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'load' });
    const r = await page.evaluate(() => {
      const nav = document.querySelector('.sidebar-nav');
      if (!nav) return { err: 'no-sidebar-nav' };
      const links = [...nav.querySelectorAll('a')];
      const about = links.find(a => /about\.html$/.test(a.getAttribute('href') || ''));
      // 侧边栏里是否残留裸文本（即 href=" 开头的可见文字）
      const rawText = [...nav.childNodes]
        .filter(n => n.nodeType === 3 && n.textContent.trim())
        .map(n => n.textContent.trim().slice(0, 60));
      return {
        linkCount: links.length,
        hasAbout: !!about,
        aboutHref: about ? about.getAttribute('href') : null,
        aboutVisible: about ? getComputedStyle(about).display !== 'none' : false,
        aboutText: about ? about.innerText.replace(/\s+/g, ' ').trim() : null,
        rawText
      };
    });
    const ok = r.hasAbout && r.aboutVisible && r.rawText.length === 0;
    if (ok) pass++; else fail++;
    console.log((ok ? 'PASS ' : 'FAIL ') + rel);
    console.log('   ' + JSON.stringify(r));
  }
  console.log('\nPASS=' + pass + '  FAIL=' + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
