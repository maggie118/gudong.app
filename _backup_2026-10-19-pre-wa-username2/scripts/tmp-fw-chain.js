const { chromium } = require('playwright-core');
const path = require('path');
const os = require('os');
const fs = require('fs');
const exe = fs.readdirSync(path.join(os.homedir(), '.agent-browser/browsers')).filter(d => d.startsWith('chrome-')).sort().pop();
(async () => {
  const browser = await chromium.launch({ executablePath: path.join(os.homedir(), '.agent-browser/browsers', exe, 'chrome.exe') });
  const page = await browser.newPage();
  await page.goto('file:///' + path.resolve('pricing.html').split(path.sep).join('/'));
  const chain = await page.evaluate(() => {
    const el = document.querySelector('footer .footer-disclaimer');
    const out = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      out.push(n.tagName + (n.className && typeof n.className === 'string' ? '.' + n.className.split(' ')[0] : '') + ' → fw=' + cs.fontWeight);
      n = n.parentElement;
    }
    return out;
  });
  console.log(chain.join('\n'));
  await browser.close();
})();
