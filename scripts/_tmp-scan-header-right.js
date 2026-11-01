// 全站扫描：header-right 结构 + 窄屏(360px)下分享按钮/LOGO区几何
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const bd = path.join(process.env.USERPROFILE || '', '.agent-browser', 'browsers');
const CHROME = path.join(bd, fs.readdirSync(bd).filter(d => d.startsWith('chrome-')).sort().pop(), 'chrome.exe');
const SKIP = /^(_backup[\w-]*|_upload[\w-]*|airtable-script|node_modules|\.git|\.workbuddy|prototypes|scripts|templates|content|docs|\.vercel)$/;
const W = Number(process.env.W || 360);

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) { if (SKIP.test(e.name)) continue; walk(path.join(d, e.name), o); }
    else if (e.name.endsWith('.html')) o.push(path.join(d, e.name));
  }
  return o;
}
const files = walk(ROOT).map(f => path.relative(ROOT, f).split(path.sep).join('/'));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const structMap = new Map();
  const problems = [];
  for (const rel of files) {
    const ctx = await browser.newContext({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    try { await page.goto('file:///' + path.join(ROOT, rel).split(path.sep).join('/'), { waitUntil: 'load', timeout: 20000 }); }
    catch { await ctx.close(); continue; }
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const h = document.querySelector('body > header');
      if (!h) return null;
      const hr = h.querySelector('.header-right');
      const R = e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) }; };
      const kids = hr ? [...hr.children].map(c => c.tagName.toLowerCase() + '.' + String(c.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')) : [];
      const share = h.querySelector('.gd-share-btn');
      const bt = h.querySelector('.brand-text');
      const logo = h.querySelector('.brand-logo-img');
      return {
        kids,
        shareR: share ? R(share).r : null, shareL: share ? R(share).l : null, shareW: share ? R(share).w : null,
        hrR: hr ? R(hr).r : null, hrL: hr ? R(hr).l : null,
        brandTextClipped: bt ? bt.scrollWidth > bt.clientWidth + 1 : null,
        logoW: logo ? Math.round(logo.getBoundingClientRect().width) : null,
        winW: window.innerWidth,
        docOv: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    await ctx.close();
    if (!r) continue;
    const key = r.kids.join(' | ');
    if (!structMap.has(key)) structMap.set(key, []);
    structMap.get(key).push(rel);
    const bad = [];
    if (r.shareR !== null && r.shareR > r.winW + 1) bad.push(`分享按钮右边界${r.shareR}>${r.winW}`);
    if (r.hrR !== null && r.hrR > r.winW + 1) bad.push(`headerRight溢出${r.hrR - r.winW}px`);
    if (r.brandTextClipped) bad.push('品牌文字被裁');
    if (r.docOv > 1) bad.push(`页面横向溢出${r.docOv}px`);
    if (bad.length) problems.push([rel, bad.join(' / ')]);
  }
  await browser.close();
  console.log(`\n===== header-right 结构分布 (视口 ${W}px) =====`);
  [...structMap.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => {
    console.log(`${String(v.length).padStart(4)} 页 | ${k}`);
    console.log(`      样例: ${v.slice(0, 2).join(', ')}`);
  });
  console.log(`\n===== 问题页 ${problems.length} 个 =====`);
  problems.forEach(([f, i]) => console.log(`  ${f} -> ${i}`));
})();
