/**
 * WhatsApp 用户名动态绑定 —— 端到端验证（2026-10-18）
 *
 * 用 playwright 拦截 /api/airtable-proxy，注入不同卖家的假数据，
 * 断言 <a data-wa-bind="seller"> 的 href 真的跟着当前卖家变。
 *
 * 场景：
 *   1. 卖家有 wa_username           → https://wa.me/<username>        data-wa-from=seller
 *   2. 卖家只有 whatsapp 号码       → https://wa.me/<号码>            data-wa-from=seller-phone
 *   3. 卖家什么都没有               → https://wa.me/<平台常量>        data-wa-from=platform
 *   4. 接口挂掉（abort）            → 保持静态兜底，不报错            data-wa-from 不设置
 */
'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/Eastw Engineering/.workbuddy/binaries/node/workspace/node_modules/playwright-core');

const ROOT = process.cwd();
const CHROME = 'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';
const PAGES = ['items/item-lim-02.html', 'items/item-yak-03.html', 'items/item-ngcy-05.html'];

const SCENARIOS = [
  {
    name: '卖家有 username',
    sellers: [{ seller_id: 'T1', display_zh: '测试藏家', display_en: 'Test Collector', wa_username: 'wa_test_user_99' }],
    expectHref: 'https://wa.me/wa_test_user_99',
    expectFrom: 'seller'
  },
  {
    name: '卖家只有号码',
    sellers: [{ seller_id: 'T1', display_zh: '测试藏家', display_en: 'Test Collector', whatsapp: '+65 9123 4567' }],
    expectHref: 'https://wa.me/6591234567',
    expectFrom: 'seller-phone'
  },
  {
    name: '卖家无联系方式',
    sellers: [{ seller_id: 'T1', display_zh: '测试藏家', display_en: 'Test Collector' }],
    expectHref: 'https://wa.me/gudong.app',
    expectFrom: 'platform'
  },
  {
    name: '接口挂掉',
    abort: true,
    expectHref: 'https://wa.me/gudong.app',
    expectFrom: null
  }
];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  let pass = 0, fail = 0;
  const errs = [];

  for (const file of PAGES) {
    const itemId = path.basename(file, '.html');
    const url = 'file:///' + path.join(ROOT, file).replace(/\\/g, '/');

    for (const sc of SCENARIOS) {
      const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
      const page = await ctx.newPage();
      const IGNORE = /ServiceWorker|The URL protocol of the current origin/i;
      page.on('pageerror', e => { if (!IGNORE.test(e.message)) errs.push(file + ' [' + sc.name + '] JS报错: ' + e.message); });

      await page.route('**/api/airtable-proxy*', route => {
        if (sc.abort) return route.abort();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            newListing: [{ item_id: itemId, seller_id: 'T1', title_zh: '测试藏品', title_en: 'Test Item' }],
            sellers: sc.sellers
          })
        });
      });

      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);

      const r = await page.evaluate(() => {
        const a = document.querySelector('a[data-wa-bind="seller"]');
        return a ? { href: a.getAttribute('href'), from: a.getAttribute('data-wa-from'), user: a.getAttribute('data-wa-username') } : null;
      });

      if (!r) { fail++; errs.push(file + ' [' + sc.name + '] 找不到绑定链接'); await ctx.close(); continue; }
      const okHref = r.href === sc.expectHref;
      const okFrom = sc.expectFrom === null ? r.from === null : r.from === sc.expectFrom;
      if (okHref && okFrom) pass++;
      else { fail++; errs.push(file + ' [' + sc.name + '] href=' + r.href + ' from=' + r.from + '（期望 ' + sc.expectHref + ' / ' + sc.expectFrom + '）'); }

      await ctx.close();
    }
  }

  console.log('=== WhatsApp 用户名动态绑定 · 端到端 ===');
  console.log('  页面: ' + PAGES.length + '  场景: ' + SCENARIOS.length + '  组合: ' + (PAGES.length * SCENARIOS.length));
  console.log('  通过: ' + pass + '   失败: ' + fail);
  if (errs.length) errs.slice(0, 12).forEach(e => console.log('  ✗ ' + e));

  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
