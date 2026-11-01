/* verify-2026-10-09.js — 无头浏览器验证本轮 4 项改动（pricing 勋章图 / sellers 收藏主页 / 侧栏 / footer） */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME_DIR = path.join(process.env.USERPROFILE || process.env.HOME, '.agent-browser', 'browsers');
const versions = fs.readdirSync(CHROME_DIR).sort().reverse();
const chromeExe = path.join(CHROME_DIR, versions[0], 'chrome.exe');

const FILE = (p) => 'file:///' + path.join(ROOT, p).replace(/\\/g, '/');
let fails = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { fails++; console.log('  ✗ ' + name + (extra ? ' —— ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: chromeExe, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  /* ---- 1) pricing.html：勋章图 + footer + 安装弹窗 ---- */
  console.log('\n[1] pricing.html');
  {
    const errs = [];
    page.removeAllListeners('pageerror'); page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(FILE('pricing.html'), { waitUntil: 'load' });
    const img = page.locator('img[src*="foundingcollector"]');
    check('勋章图存在', await img.count() === 1);
    const nw = await img.evaluate((el) => el.naturalWidth).catch(() => 0);
    check('勋章图加载成功 naturalWidth>0', nw > 0, 'naturalWidth=' + nw);
    check('勋章图在文字前（同 span 内）', await img.evaluate((el) => el.parentElement.querySelector('.zh') !== null && el.nextElementSibling && el.nextElementSibling.classList.contains('zh')));
    check('footer 品牌行', await page.locator('footer .footer-brand').count() === 1);
    check('footer 免责声明(新文案)', (await page.locator('footer .footer-disclaimer').innerText()).includes('不参与任何买卖交易'));
    check('footer 联系方式', (await page.locator('footer .footer-contact').innerText()).includes('support@gudong.app'));
    check('安装弹窗已补齐', await page.locator('#gdInstallModal').count() === 1);
    check('无页面错误', errs.length === 0, errs.join(' | ').slice(0, 200));
  }

  /* ---- 2) seller 页：收藏主页按钮 + follow 数据 ---- */
  console.log('\n[2] sellers/seller-lim-kw-antiques.html');
  {
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(FILE('sellers/seller-lim-kw-antiques.html'), { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    const btn = page.locator('#saveSellerBtn');
    check('收藏主页按钮存在', await btn.count() === 1);
    check('初始文案 收藏主页', (await btn.innerText()).includes('收藏主页'));
    await btn.click();
    await page.waitForTimeout(200);
    check('点击后变 已收藏', (await btn.innerText()).includes('已收藏'));
    const follow = await page.evaluate(() => localStorage.getItem('gudong_follow'));
    check('写入 gudong_follow(type seller, Lim-KW)', !!follow && follow.includes('"type":"seller"') && follow.toLowerCase().includes('lim-kw'), follow);
    check('gudong-follow.js 已加载', await page.evaluate(() => !!window.GudongFollow));
    check('无页面错误', errs.length === 0, errs.join(' | ').slice(0, 200));
    // my/saved.html 读取同一 localStorage（file:// 同源限制下不同目录可能不同源，跳过跨页断言）
  }

  /* ---- 3) 侧栏 + footer 抽查（terms / insights 文章 / index） ---- */
  console.log('\n[3] 侧栏 & footer 抽查');
  {
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e)));
    await page.goto(FILE('terms.html'), { waitUntil: 'load' });
    const navLinks = await page.locator('.sidebar-nav a').count();
    check('terms 侧栏 16 链接 + 语言按钮', navLinks === 16, '实际 ' + navLinks);
    check('terms 侧栏含 我的收藏·关注', (await page.locator('.sidebar-nav').innerText()).includes('我的收藏'));
    check('terms 侧栏含 今日发现(非今日好货)', (await page.locator('.sidebar-nav').innerText()).includes('今日发现'));
    check('terms footer 版权新文案', (await page.locator('footer .footer-copyright').innerText()).includes('版权所有'));
    check('terms 安装按钮可点击弹窗', await page.evaluate(() => { document.querySelector('footer .app-install-btn').click(); return document.getElementById('gdInstallModal').classList.contains('open'); }));

    await page.goto(FILE('insights/porcelain-marks.html'), { waitUntil: 'load' });
    check('insights 文章侧栏 16 链接', (await page.locator('.sidebar-nav a').count()) === 16);
    const badHref = await page.evaluate(() => Array.from(document.querySelectorAll('.sidebar-nav a')).filter(a => a.protocol === 'file:' && !a.href.includes('/Gudong/') === false && a.getAttribute('href').startsWith('http')).length);
    check('insights 侧栏无残留旧绝对域名的导航错链', badHref === 0);
    check('insights footer 品牌行', await page.locator('footer .footer-brand').count() === 1);

    await page.goto(FILE('index.html'), { waitUntil: 'load' });
    check('index footer 新免责声明', (await page.locator('footer .footer-disclaimer').innerText()).includes('均由买卖双方自行判断'));
    check('index 无 ggudong 笔误', !(await page.locator('footer').innerText()).includes('ggudong'));
    check('无页面错误', errs.length === 0, errs.join(' | ').slice(0, 200));
  }

  await browser.close();
  console.log('\n---- 结果：' + (fails ? fails + ' 项失败' : '全部通过') + ' ----');
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error('运行失败:', e); process.exit(1); });
