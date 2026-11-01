// 线上实测：首页是否渲染出藏品卡片（API 挂掉时是否走本地快照兜底）
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright-core');
const base = 'C:/Users/Eastw Engineering/.agent-browser/browsers';
const CHROME = path.join(base, fs.readdirSync(base).filter(x => x.startsWith('chrome-')).sort().pop(), 'chrome.exe').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });

  await page.goto('https://www.gudong.app/', { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    findsCards: document.querySelectorAll('.finds-card').length,
    cardLinks: [...document.querySelectorAll('a[href*="item"]')].slice(0, 4).map(a => a.getAttribute('href')),
    warn: (document.body.innerText.match(/⚠[^\n]{0,80}/g) || []).slice(0, 3),
    diag: (document.body.innerText.match(/数据源[^\n]{0,60}/g) || []).slice(0, 2),
  }));
  console.log('首页: ' + JSON.stringify(r, null, 2));
  console.log('console 错误: ' + (errs.length ? errs.join(' | ') : '无'));

  await page.goto('https://www.gudong.app/item.html?id=item-limck-01', { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  const r2 = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const t = main.innerText.replace(/\s+/g, ' ').trim();
    return {
      长度: t.length,
      有标题: /帕尔瓦蒂|Parvati|四臂观音|Avalokiteshvara/.test(t),
      有图: [...document.querySelectorAll('img')].filter(i => i.naturalWidth > 0).length,
      正文片段: t.slice(0, 300),
    };
  });
  console.log('\nitem.html?id=item-limck-01: ' + JSON.stringify(r2, null, 2));
  await browser.close();
})();
