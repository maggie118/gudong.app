const { chromium } = require('playwright-core');
const path = require('path');
const os = require('os');
const fs = require('fs');
const exe = fs.readdirSync(path.join(os.homedir(), '.agent-browser/browsers')).filter(d => d.startsWith('chrome-')).sort().pop();
(async () => {
  const browser = await chromium.launch({ executablePath: path.join(os.homedir(), '.agent-browser/browsers', exe, 'chrome.exe') });
  const page = await browser.newPage();
  const read = async (f) => {
    await page.goto('file:///' + path.resolve(f).split(path.sep).join('/'));
    return await page.evaluate(() => {
      const out = {};
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { fw: cs.fontWeight, ff: cs.fontFamily.slice(0, 40), fs: cs.fontSize };
      };
      out.brand = pick('footer .footer-brand');
      out.disclaimer = pick('footer .footer-disclaimer');
      out.copyright = pick('footer .footer-copyright');
      out.navA = pick('footer .footer-nav a');
      out.body = (() => { const cs = getComputedStyle(document.body); return { fw: cs.fontWeight, ff: cs.fontFamily.slice(0, 40) }; })();
      return out;
    });
  };
  console.log('index  :', JSON.stringify(await read('index.html'), null, 1));
  console.log('pricing:', JSON.stringify(await read('pricing.html'), null, 1));
  await browser.close();
})();
