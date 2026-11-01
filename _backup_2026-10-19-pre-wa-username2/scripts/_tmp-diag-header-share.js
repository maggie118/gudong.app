// 诊断：手机端 header 内 LOGO / 品牌文字 / 分享按钮 的实际几何与溢出情况
const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(__dirname, '..');
const bd = path.join(process.env.USERPROFILE || '', '.agent-browser', 'browsers');
const CHROME = path.join(bd, fs.readdirSync(bd).filter(d => d.startsWith('chrome-')).sort().pop(), 'chrome.exe');
const WIDTHS = (process.env.W || '320,360,390,414,480,600,767').split(',').map(Number);
const PAGES = (process.env.PAGES || 'categories/porcelain.html,index.html,items/item-lim-01.html,collection.html,insights/provenance-basics.html,pricing.html,tools/index.html').split(',');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  for (const w of WIDTHS) {
    console.log(`\n########## 视口宽度 ${w}px ##########`);
    for (const p of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      try { await page.goto('file:///' + path.join(ROOT, p).split(path.sep).join('/'), { waitUntil: 'load', timeout: 20000 }); }
      catch (e) { console.log(p, 'LOAD-FAIL'); await ctx.close(); continue; }
      await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const h = document.querySelector('body > header');
        if (!h) return null;
        const R = e => { const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
        const q = s => h.querySelector(s);
        const logo = q('.brand-logo-img'), brand = q('.brand'), bt = q('.brand-text');
        const small = q('.brand-text small'), line1 = q('.brand-line1');
        const share = q('.gd-share-btn'), lang = q('.lang-btn'), menu = q('.menu-toggle');
        const hr = q('.header-right'), hl = h.children[0];
        const clipped = e => e ? (e.scrollWidth > e.clientWidth + 1) : null;
        return {
          header: R(h),
          headerScrollOverflow: h.scrollWidth > h.clientWidth + 1 ? h.scrollWidth - h.clientWidth : 0,
          menu: menu ? R(menu) : null,
          logo: logo ? R(logo) : null,
          brand: brand ? R(brand) : null,
          brandText: bt ? R(bt) : null,
          brandTextClipped: clipped(bt),
          line1Clipped: clipped(line1),
          smallClipped: clipped(small),
          smallDisplay: small ? getComputedStyle(small).display : null,
          share: share ? R(share) : null,
          shareVisible: share ? (R(share).r <= window.innerWidth + 1 && R(share).l >= -1 && R(share).w > 0) : null,
          lang: lang ? R(lang) : null,
          langVisible: lang ? (R(lang).r <= window.innerWidth + 1 && R(lang).l >= -1 && R(lang).w > 0) : null,
          headerRight: hr ? R(hr) : null,
          headerRightVisible: hr ? R(hr).r <= window.innerWidth + 1 : null,
          winW: window.innerWidth,
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      await ctx.close();
      if (!r) { console.log(`${p}: 无 body>header`); continue; }
      const flags = [];
      if (r.headerScrollOverflow > 0) flags.push(`header内溢出${r.headerScrollOverflow}px`);
      if (r.brandTextClipped) flags.push('品牌文字被裁');
      if (r.line1Clipped) flags.push('主标题行被裁');
      if (r.smallClipped && r.smallDisplay !== 'none') flags.push('副标题被裁');
      if (r.shareVisible === false) flags.push('❗分享按钮超出屏幕');
      if (r.langVisible === false) flags.push('❗语言按钮超出屏幕');
      if (r.docOverflow > 1) flags.push(`页面横向溢出${r.docOverflow}px`);
      console.log(`\n${p}`);
      console.log(`  header ${r.header.w}x${r.header.h} | menu ${r.menu ? r.menu.w : '-'} | logo ${r.logo ? r.logo.w + 'x' + r.logo.h : '-'} | brandText w=${r.brandText ? r.brandText.w : '-'} | share ${r.share ? `l${r.share.l} r${r.share.r} w${r.share.w}` : '-'} | lang ${r.lang ? `l${r.lang.l} r${r.lang.r} w${r.lang.w}` : '-'}`);
      console.log(`  headerRight r=${r.headerRight ? r.headerRight.r : '-'} / win=${r.winW}`);
      console.log(`  ${flags.length ? '⚠️ ' + flags.join(' | ') : '✅ 正常'}`);
    }
  }
  await browser.close();
})();
