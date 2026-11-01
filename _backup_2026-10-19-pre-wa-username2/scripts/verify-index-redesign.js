/* 无头浏览器验证 index.html 首页改版（2026-10-04 十项改动） */
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const exe = path.join(process.env.HOME || '', '.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe');
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    // file:// 下加载 Google 字体 / sw.js 失败属正常
    if (m.type() === 'error' && !/net::ERR|Failed to load resource|serviceWorker/.test(t)) errors.push('console: ' + t);
  });

  const url = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
  await page.goto(url, { waitUntil: 'load' });

  const vis = async (sel) => page.$eval(sel, el => getComputedStyle(el).display !== 'none').catch(() => false);
  const has = async (sel) => page.$(sel).then(el => !!el);

  const r = [];
  const check = (name, ok) => r.push(`${ok ? 'OK ' : 'FAIL'} ${name}`);

  // 1. 公告栏已删除（HTML + CSS 全无）
  check('公告栏已删除', !(await has('.announce-bar')) && !(await has('#announceBar')));
  // 2. Header 轻量文字按钮
  check('Header「发布藏品」文字按钮', (await has('.header-right .btn-publish-text')) && !(await has('.header-right .btn-publish')));
  const hdrBtn = await page.textContent('.header-right .btn-publish-text').catch(() => '');
  check(`Header 按钮文案 = 发布藏品（实际 "${hdrBtn.trim()}"）`, hdrBtn.includes('发布藏品'));
  // 3. Hero 数据行已删（藏家/藏品数字不显示，仅剩新加坡本地直供）
  const heroStats = await page.textContent('.hero-stats').catch(() => '');
  check('Hero 无「位藏家入驻/件藏品在线」数字', !/位藏家入驻|件藏品在线/.test(heroStats));
  check('Hero 保留「新加坡本地直供」', heroStats.includes('新加坡本地直供'));
  // 4. 今日发现
  const t1 = await page.textContent('#today-finds .title.zh').catch(() => '');
  check(`#today-finds 标题 = 今日发现（实际 "${t1.trim()}"）`, t1.trim() === '今日发现');
  const t1en = await page.textContent('#today-finds .title.en').catch(() => '');
  check(`英文 = Today's Finds（实际 "${t1en.trim()}"）`, t1en.trim() === "Today's Finds");
  const t1sub = await page.textContent('#today-finds .sub-line.zh').catch(() => '');
  check(`副标题 = 今天值得看看的一些藏品（实际 "${t1sub.trim()}"）`, t1sub.trim() === '今天值得看看的一些藏品');
  // 5. 刚刚上新
  const t2 = await page.textContent('#new-listings .title.zh').catch(() => '');
  check(`#new-listings 标题 = 刚刚上新（实际 "${t2.trim()}"）`, t2.trim() === '刚刚上新');
  const t2sub = await page.textContent('#new-listings .sub-line.zh').catch(() => '');
  check(`副标题 = 最新发布的藏品（实际 "${t2sub.trim()}"）`, t2sub.trim() === '最新发布的藏品');
  // 6. 按类别逛藏品
  const t3 = await page.textContent('#browse .title.zh').catch(() => '');
  check(`#browse 标题 = 按类别逛藏品（实际 "${t3.trim()}"）`, t3.trim() === '按类别逛藏品');
  // 7. 按价位寻宝已删除
  check('「按价位寻宝」区块已删除', !(await has('.price-hunt')) && !(await has('.price-hunt-btn')));
  // 8. 三卡改版
  const howTitles = await page.$$eval('#services .how-title.zh', els => els.map(e => e.textContent.trim()));
  check(`三卡标题 = 看藏品/联系藏家/自己判断（实际 ${JSON.stringify(howTitles)}）`,
    JSON.stringify(howTitles) === JSON.stringify(['看藏品', '联系藏家', '自己判断']));
  const h2 = await page.textContent('#services h2.zh').catch(() => '');
  check(`#services 标题 = 为什么在古董圈找藏品？（实际 "${h2.trim()}"）`, h2.trim() === '为什么在古董圈找藏品？');
  const sub = await page.textContent('#services .how-sub.zh').catch(() => '');
  check(`副标题 = 信息展示 · 行情参考 · 直接联系藏家（实际 "${sub.trim()}"）`, sub.trim() === '信息展示 · 行情参考 · 直接联系藏家');
  // 9. FAQ 4 条、无「发布我的藏品收费吗」
  const faqCount = await page.$$eval('.faq-item', els => els.length);
  check(`FAQ 条目数 = 4（实际 ${faqCount}）`, faqCount === 4);
  const faqText = await page.textContent('.faq-list').catch(() => '');
  check('FAQ 无「发布我的藏品收费吗」', !faqText.includes('发布我的藏品收费吗'));
  // 10. 卖家招募 CTA 在 FAQ 之后 + 新文案
  const orderOk = await page.evaluate(() => {
    const faq = document.getElementById('faq');
    const cta = document.getElementById('seller-cta');
    return !!(faq && cta && faq.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  check('卖家招募 CTA 位于 FAQ 之后', orderOk);
  const ctaTitle = await page.textContent('#seller-cta .title.zh').catch(() => '');
  check(`CTA 标题 = 你也有藏品想展示？（实际 "${ctaTitle.trim()}"）`, ctaTitle.trim() === '你也有藏品想展示？');
  const ctaDesc = await page.textContent('#seller-cta .desc.zh').catch(() => '');
  check(`CTA 副标题含「创始藏家 · 2026 现开放限量席位」（实际 "${ctaDesc.trim()}"）`, ctaDesc.includes('创始藏家 · 2026 现开放限量席位'));
  const ctaBtn = await page.textContent('#seller-cta .btn-publish .zh').catch(() => '');
  check(`CTA 按钮 = 发布我的藏品 →（实际 "${ctaBtn.trim()}"）`, ctaBtn.trim() === '发布我的藏品 →');

  // 11. 语言切换仍然正常（今日发现的 en 文案）
  await page.click('.lang-btn');
  const enShown = await vis('#today-finds .title.en');
  const zhHidden = !(await vis('#today-finds .title.zh'));
  check('语言切换后 en 显示 / zh 隐藏', enShown && zhHidden);
  await page.click('.lang-btn');

  // 12. 侧栏锚点文案同步
  await page.click('#menuToggle');
  const sb = await page.textContent('.sidebar-nav').catch(() => '');
  check('侧栏含「今日发现」「刚刚上新」', sb.includes('今日发现') && sb.includes('刚刚上新'));
  check('侧栏无「今日好货」「新上架好货」', !sb.includes('今日好货') && !sb.includes('新上架好货'));

  r.forEach(l => console.log(l));
  console.log('JS 错误: ' + (errors.length ? errors.join(' | ') : '无'));
  await browser.close();
  if (r.some(l => l.startsWith('FAIL'))) process.exit(1);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
