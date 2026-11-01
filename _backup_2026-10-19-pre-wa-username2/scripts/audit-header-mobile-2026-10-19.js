/**
 * 手机端顶部区审计（修复前/后基线对比用）
 * 检查项：LOGO 是否显示、品牌文字是否被裁、分享按钮是否完整可见、header 是否溢出
 * 用法: node scripts/audit-header-mobile-2026-10-19.js [宽度,默认360]
 */
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const bd = path.join(process.env.USERPROFILE || '', '.agent-browser', 'browsers');
const CHROME = path.join(bd, fs.readdirSync(bd).filter(d => d.startsWith('chrome-')).sort().pop(), 'chrome.exe');
const SKIP = /^(_backup[\w-]*|_upload[\w-]*|airtable-script|node_modules|\.git|\.workbuddy|prototypes|scripts|templates|content|docs|\.vercel)$/;
const W = Number(process.env.W || 360);
const ONLY = process.env.PAGES ? process.env.PAGES.split(',') : null;

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (SKIP.test(e.name)) continue; walk(path.join(d, e.name), o); }
    else if (e.name.endsWith('.html')) o.push(path.join(d, e.name));
  }
  return o;
}
let files = walk(ROOT).map(f => path.relative(ROOT, f).split(path.sep).join('/'));
if (ONLY) files = files.filter(f => ONLY.includes(f));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const problems = [];
  let n = 0;
  for (const rel of files) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    try { await page.goto('file:///' + path.join(ROOT, rel).split(path.sep).join('/'), { waitUntil: 'load', timeout: 20000 }); }
    catch { await ctx.close(); continue; }
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const h = document.querySelector('body > header');
      if (!h) return null;
      const R = e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
      const logo = h.querySelector('.brand-logo-img');
      const bt = h.querySelector('.brand-text');
      const line1 = h.querySelector('.brand-line1');
      const small = h.querySelector('.brand-text small');
      const share = h.querySelector('.gd-share-btn');
      const shareSvg = share && share.querySelector('svg');
      const lang = h.querySelector('.lang-btn');
      const hr = h.querySelector('.header-right');
      const clipped = e => e ? e.scrollWidth > e.clientWidth + 1 : null;
      return {
        logoW: logo ? Math.round(logo.getBoundingClientRect().width) : null,
        logoH: logo ? Math.round(logo.getBoundingClientRect().height) : null,
        logoShown: logo ? getComputedStyle(logo).display !== 'none' && logo.getBoundingClientRect().width > 4 : false,
        brandTextClipped: clipped(bt),
        line1Clipped: clipped(line1),
        smallClipped: small && getComputedStyle(small).display !== 'none' ? clipped(small) : false,
        share: share ? R(share) : null,
        shareSvg: shareSvg ? R(shareSvg) : null,
        lang: lang ? R(lang) : null,
        hr: hr ? R(hr) : null,
        headerOv: h.scrollWidth - h.clientWidth,
        docOv: document.documentElement.scrollWidth - window.innerWidth,
        winW: window.innerWidth,
      };
    });
    await ctx.close();
    if (!r) continue;
    n++;
    const bad = [];
    if (!r.logoShown) bad.push(`LOGO未显示(${r.logoW}x${r.logoH})`);
    if (r.brandTextClipped) bad.push('品牌文字被裁');
    if (r.smallClipped) bad.push('副标题被裁');
    if (r.share && (r.share.w < 36 || r.share.h < 36)) bad.push(`分享按钮塌陷${r.share.w}x${r.share.h}`);
    if (r.share && r.share.r > r.winW + 1) bad.push(`分享按钮超出屏幕(r=${r.share.r}>${r.winW})`);
    if (r.shareSvg && (r.shareSvg.w < 12 || r.shareSvg.h < 12)) bad.push(`分享图标过小${r.shareSvg.w}x${r.shareSvg.h}`);
    if (r.lang && r.lang.r > r.winW + 1) bad.push(`语言按钮超出屏幕`);
    if (r.headerOv > 1) bad.push(`header内溢出${r.headerOv}px`);
    if (r.docOv > 1) bad.push(`页面横向溢出${r.docOv}px`);
    if (bad.length) problems.push([rel, bad.join(' / ')]);
  }
  await browser.close();
  console.log(`\n===== 视口 ${W}px | 已审计 ${n} 页 | 问题页 ${problems.length} 个 =====`);
  problems.forEach(([f, i]) => console.log(`  ${f} -> ${i}`));
  if (!problems.length) console.log('  ✅ 全部正常');
})();
