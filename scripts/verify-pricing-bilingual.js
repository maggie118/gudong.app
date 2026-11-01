/* 无头浏览器验证 pricing.html 双语切换与锚点 */
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const exe = path.join(process.env.HOME || '', '.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe');
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const url = 'file:///' + path.resolve('pricing.html').replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load' });

  const vis = async (sel) => page.$eval(sel, el => getComputedStyle(el).display !== 'none');

  // 1. 默认中文
  const zhDefault = await vis('.sec-title .zh');
  const enHidden = !(await vis('.sec-title .en'));
  console.log(`默认中文显示: zh=${zhDefault} en隐藏=${enHidden}`);

  // 2. 切英文（点 header 语言按钮）
  await page.click('.lang-btn');
  const zhHidden2 = !(await vis('.sec-title .zh'));
  const enShown2 = await vis('.sec-title .en');
  const btnText = await page.textContent('.lang-btn');
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  console.log(`切换英文: en显示=${enShown2} zh隐藏=${zhHidden2} 按钮文案=${btnText.trim()} html.lang=${htmlLang}`);

  // 3. 英文下抽查几个关键文案
  const checks = [
    ['.card h3 .en >> nth=0', 'List For Me'],
    ['.card h3 .en >> nth=1', 'Build My Online Gallery'],
    ['.founding-badge .en', 'Founder Dealer'],
    ['.footer-disclaimer.en', 'premium antiques discovery platform'],
    ['.gd-install-title.en', 'Add Gudong.app'],
  ];
  for (const [sel, kw] of checks) {
    const t = await page.textContent(sel).catch(() => null);
    console.log(`${sel}: ${t && t.includes(kw) ? 'OK' : 'FAIL -> ' + t}`);
  }

  // 4. 锚点存在且可跳转
  for (const id of ['seller-services', 'buyer-services', 'price-table', 'faq']) {
    const ok = await page.evaluate(i => !!document.getElementById(i), id);
    console.log(`anchor #${id}: ${ok ? 'OK' : 'MISSING'}`);
  }

  // 5. FAQ 数量 = 5，已删两条
  const faqCount = await page.$$eval('.faq-item', els => els.length);
  console.log(`FAQ 条目数: ${faqCount}（应为 5）`);

  // 6. localStorage 偏好持久化 + 侧栏语言按钮（先开抽屉）
  await page.click('#menuToggle');
  await page.click('.sidebar-lang-btn');
  const stored = await page.evaluate(() => localStorage.getItem('gudong_lang'));
  const zhBack = await vis('.sec-title .zh');
  console.log(`侧栏按钮切回: gudong_lang=${stored} zh显示=${zhBack}`);

  console.log('JS 错误: ' + (errors.length ? errors.join(' | ') : '无'));
  await browser.close();
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
