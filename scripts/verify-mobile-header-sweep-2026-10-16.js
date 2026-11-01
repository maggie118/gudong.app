/**
 * 全站扫描（真实 Chrome）：移动端 390x844 + 桌面端 1280x800
 * 检查所有含 header 的页面是否都拿到了移动端修复，且桌面端保持原样。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const bd = path.join(process.env.USERPROFILE || '', '.agent-browser', 'browsers');
const CHROME = path.join(bd, fs.readdirSync(bd).filter(d => d.startsWith('chrome-')).sort().pop(), 'chrome.exe');
const SKIP_DIR = /^(_backup[\w-]*|_upload[\w-]*|airtable-script|node_modules|\.git|\.workbuddy|prototypes|scripts|templates|content|docs|\.vercel)$/;
// 不参与检查的游离/验证文件
const SKIP_FILE = new Set([
  'assets/images/lim-kw/item-lim-01.html', // 无入链的废弃旧版（正式版在 items/）
  'google83a67404841a5314.html',           // Google 站点验证文件
]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (SKIP_DIR.test(e.name)) continue; walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.html')) {
      const rel = path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join('/');
      if (!SKIP_FILE.has(rel)) out.push(path.join(dir, e.name));
    }
  }
  return out;
}
const files = walk(ROOT).map(f => path.relative(ROOT, f).split(path.sep).join('/'));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const bad = [];
  let checked = 0, noHeader = [];

  for (const rel of files) {
    const url = 'file:///' + path.join(ROOT, rel).split(path.sep).join('/');

    // ---- 移动端 ----
    let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let page = await ctx.newPage();
    let err = null;
    page.on('pageerror', e => { err = e.message; });
    try { await page.goto(url, { waitUntil: 'load', timeout: 20000 }); } catch (e) { await ctx.close(); bad.push([rel, 'LOAD ' + e.message]); continue; }
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const h = document.querySelector('body > header');
      if (!h) return null;
      const main = document.querySelector('body > header ~ main');
      const cs = getComputedStyle(h), hb = h.getBoundingClientRect();
      const logo = h.querySelector('.brand-logo-img');
      const mcs = main ? getComputedStyle(main) : null;
      const mb = main ? main.getBoundingClientRect() : null;
      return {
        pos: cs.position, h: Math.round(hb.height), top: Math.round(hb.top), z: cs.zIndex,
        padTop: cs.paddingTop, logoH: logo ? Math.round(logo.getBoundingClientRect().height) : null,
        logoW: logo ? Math.round(logo.getBoundingClientRect().width) : null,
        mainPadTop: mcs ? Math.round(parseFloat(mcs.paddingTop)) : null,
        contentTop: mb && mcs ? Math.round(mb.top + parseFloat(mcs.paddingTop)) : null,
        scrollPad: parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    await ctx.close();
    if (!m) { noHeader.push(rel); continue; }
    checked++;
    const issues = [];
    if (m.pos !== 'fixed') issues.push(`pos=${m.pos}`);
    if (m.h < 58 || m.h > 60) issues.push(`h=${m.h}`);
    if (m.top !== 0) issues.push(`top=${m.top}`);
    if (m.z !== '80') issues.push(`z=${m.z}`);
    // 窄屏补丁(≤480px)会把 LOGO 压到 28px，30px 是未触发该补丁时的值，均属正常
    if (![28, 30].includes(m.logoH)) issues.push(`logoH=${m.logoH}`);
    if (m.logoW > 76) issues.push(`logoW=${m.logoW}`);
    if (m.mainPadTop === null || m.mainPadTop < m.h) issues.push(`mainPadTop=${m.mainPadTop}`);
    if (m.contentTop === null || m.contentTop < m.h - 1) issues.push(`contentTop=${m.contentTop}`);
    if (!(m.scrollPad >= m.h)) issues.push(`scrollPad=${m.scrollPad}`);
    if (m.overflow > 1) issues.push(`hOverflow=${m.overflow}px`);
    // file:// 下 ServiceWorker 注册失败是固有噪声，不算页面问题
    if (err && !/ServiceWorker[\s\S]*file:/i.test(err)) issues.push(`jserr=${err}`);
    if (issues.length) bad.push([rel, issues.join(' ')]);

    // ---- 桌面端 ----
    ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    try { await page.goto(url, { waitUntil: 'load', timeout: 20000 }); } catch (e) { await ctx.close(); continue; }
    await page.waitForTimeout(200);
    const d = await page.evaluate(() => {
      const h = document.querySelector('body > header');
      if (!h) return null;
      const cs = getComputedStyle(h);
      const logo = h.querySelector('.brand-logo-img');
      const main = document.querySelector('body > header ~ main');
      return {
        pos: cs.position, h: Math.round(h.getBoundingClientRect().height),
        logoH: logo ? Math.round(logo.getBoundingClientRect().height) : null,
        mainPadTop: main ? Math.round(parseFloat(getComputedStyle(main).paddingTop)) : null,
      };
    });
    await ctx.close();
    if (!d) continue;
    const dIssues = [];
    if (d.pos !== 'sticky') dIssues.push(`desktop pos=${d.pos}`);
    if (d.h <= 60) dIssues.push(`desktop h=${d.h}`);
    if (d.logoH !== 38) dIssues.push(`desktop logoH=${d.logoH}`);
    if (d.mainPadTop !== null && d.mainPadTop >= 60) dIssues.push(`desktop mainPadTop=${d.mainPadTop}`);
    if (dIssues.length) bad.push([rel, dIssues.join(' ')]);
  }

  await browser.close();
  console.log(`扫描 ${files.length} 页，含 header 且已校验 ${checked} 页，无 header 跳过 ${noHeader.length} 页`);
  if (noHeader.length) console.log('  无 header:', noHeader.join(', '));
  if (bad.length) { console.log(`\n❌ 异常 ${bad.length} 页:`); bad.forEach(([f, i]) => console.log('  ', f, '|', i)); process.exitCode = 1; }
  else console.log('✅ 全站通过：移动端 header fixed/58px/LOGO30px/main补偿/scroll-padding 均生效，桌面端保持原样');
})();
