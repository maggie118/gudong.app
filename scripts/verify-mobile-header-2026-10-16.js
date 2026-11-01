/**
 * 验证移动端顶部导航修复（真实 Chrome 无头）
 * 断言：桌面端不变 / 移动端 fixed + 高度变量 / main padding-top / scroll-padding-top
 *      / LOGO 尺寸与左对齐且不降透明度 / 首屏内容不被遮挡 / 锚点跳转不被遮挡
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const browsersDir = path.join(process.env.USERPROFILE || '', '.agent-browser', 'browsers');
const CHROME = path.join(browsersDir, fs.readdirSync(browsersDir).filter(d => d.startsWith('chrome-')).sort().pop(), 'chrome.exe');

const MOBILE = [
  { name: 'iPhone-390x844', width: 390, height: 844 },
  { name: 'Android-360x800', width: 360, height: 800 },
  { name: 'iPhonePlus-414x896', width: 414, height: 896 },
];
const DESKTOP = { name: 'Desktop-1280x800', width: 1280, height: 800 };

const PAGES = (process.env.PAGES || [
  'index.html', 'collection.html', 'about.html', 'pricing.html', 'insights.html',
  'categories/jade.html', 'items/item-lim-01.html', 'insights/provenance-basics.html',
  'tools/index.html', 'sellers/index.html', 'terms.html',
].join(',')).split(',').filter(Boolean);
const DEVICES = (process.env.DEVICES || 'all') === 'all'
  ? MOBILE
  : MOBILE.filter(d => d.name.toLowerCase().includes(process.env.DEVICES.toLowerCase()));

const results = [];
function assert(name, cond, detail) { results.push({ name, ok: !!cond, detail }); }

async function probe(page) {
  return page.evaluate(() => {
    const h = document.querySelector('body > header');
    const main = document.querySelector('body > main');
    const logo = h ? h.querySelector('.brand-logo-img') : null;
    const cs = h ? getComputedStyle(h) : null;
    const hb = h ? h.getBoundingClientRect() : null;
    const lb = logo ? logo.getBoundingClientRect() : null;
    const lcs = logo ? getComputedStyle(logo) : null;
    const mcs = main ? getComputedStyle(main) : null;
    const mb = main ? main.getBoundingClientRect() : null;
    const rootCS = getComputedStyle(document.documentElement);

    // main 内首个可见"内容"元素（标题 / 图片 / 卡片 / 首屏主标题块）
    let first = null;
    if (main) {
      const sel = 'h1,h2,h3,.item-card,.card,img,a.tool-card,.gallery-card,.finds-card,' +
        '.hero-title-main,.hero-title,.article-title,.item-detail-title,.page-title';
      for (const c of main.querySelectorAll(sel)) {
        const b = c.getBoundingClientRect();
        if (b.width > 24 && b.height > 14 && b.top > -50 && b.top < innerHeight) { first = c; break; }
      }
    }
    const fb = first ? first.getBoundingClientRect() : null;
    // 兜底：main 内容区顶部（= main.top + paddingTop）必须落在 header 下方
    const mainContentTop = mb && mcs ? Math.round(mb.top + parseFloat(mcs.paddingTop)) : null;
    const firstChild = main && main.firstElementChild ? main.firstElementChild.getBoundingClientRect() : null;

    return {
      headerPos: cs && cs.position,
      headerTop: hb && Math.round(hb.top),
      headerH: hb && Math.round(hb.height),
      headerZ: cs && cs.zIndex,
      headerTrans: cs && cs.transitionProperty,
      headerPadTop: cs && cs.paddingTop,
      logoH: lb && Math.round(lb.height),
      logoW: lb && Math.round(lb.width),
      logoOpacity: lcs && lcs.opacity,
      logoLeft: lb && Math.round(lb.left),
      headerLeft: hb && Math.round(hb.left),
      logoTrans: lcs && lcs.transitionProperty,
      mainPadTop: mcs && Math.round(parseFloat(mcs.paddingTop)),
      mainTop: mb && Math.round(mb.top),
      scrollPadTop: rootCS.scrollPaddingTop,
      firstTag: first && (first.tagName + (first.className ? '.' + String(first.className).split(' ')[0] : '')),
      firstTop: fb && Math.round(fb.top),
      firstOverlapped: hb && fb ? fb.top < hb.bottom - 0.5 : null,
      mainContentTop,
      firstChildTop: firstChild && Math.round(firstChild.top),
      brandLeft: (() => { const b = h && h.querySelector('.brand'); return b ? Math.round(b.getBoundingClientRect().left) : null; })(),
      headerRightLeft: (() => { const b = h && h.querySelector('.header-right'); return b ? Math.round(b.getBoundingClientRect().left) : null; })(),
      docScrollW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });

  // ---------- 桌面端：必须保持原样 ----------
  for (const p of PAGES) {
    process.stderr.write(`[desktop] ${p}\n`);
    const ctx = await browser.newContext({ viewport: { width: DESKTOP.width, height: DESKTOP.height } });
    const page = await ctx.newPage();
    await page.goto('file:///' + path.join(ROOT, p).split(path.sep).join('/'), { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const r = await probe(page);
    assert(`[桌面] ${p} header 仍为 sticky`, r.headerPos === 'sticky', `position=${r.headerPos}`);
    assert(`[桌面] ${p} header 高度未被移动端改动(>60)`, r.headerH > 60, `height=${r.headerH}`);
    assert(`[桌面] ${p} LOGO 仍为 38px`, r.logoH === 38, `logoH=${r.logoH}`);
    assert(`[桌面] ${p} main padding-top 未加 header 补偿`, r.mainPadTop < 60, `padTop=${r.mainPadTop}`);
    await ctx.close();
  }

  // ---------- 移动端 ----------
  for (const dev of DEVICES) {
    for (const p of PAGES) {
      process.stderr.write(`[${dev.name}] ${p}\n`);
      const ctx = await browser.newContext({
        viewport: { width: dev.width, height: dev.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      });
      const page = await ctx.newPage();
      await page.goto('file:///' + path.join(ROOT, p).split(path.sep).join('/'), { waitUntil: 'load' });
      await page.waitForTimeout(500);

      const top = await probe(page);
      assert(`[${dev.name}] ${p} header=fixed`, top.headerPos === 'fixed', `position=${top.headerPos}`);
      assert(`[${dev.name}] ${p} header 高度=58(+safe)`, top.headerH >= 58 && top.headerH <= 60, `height=${top.headerH}`);
      assert(`[${dev.name}] ${p} header top=0`, top.headerTop === 0, `top=${top.headerTop}`);
      assert(`[${dev.name}] ${p} header z-index=80`, top.headerZ === '80', `z=${top.headerZ}`);
      assert(`[${dev.name}] ${p} LOGO=30px 且 ≤76px 宽`, top.logoH === 30 && top.logoW <= 76, `logo=${top.logoW}x${top.logoH}`);
      assert(`[${dev.name}] ${p} LOGO 不降透明度`, top.logoOpacity === '1', `opacity=${top.logoOpacity}`);
      assert(`[${dev.name}] ${p} LOGO 左对齐(与 .brand 左侧一致)`, top.brandLeft !== null && Math.abs(top.logoLeft - top.brandLeft) <= 2 &&
        top.brandLeft < top.winW * 0.5 && (top.headerRightLeft === null || top.brandLeft < top.headerRightLeft),
        `logoLeft=${top.logoLeft} brandLeft=${top.brandLeft} rightLeft=${top.headerRightLeft}`);
      assert(`[${dev.name}] ${p} main padding-top ≥ header 高度`, top.mainPadTop >= top.headerH, `padTop=${top.mainPadTop} headerH=${top.headerH}`);
      assert(`[${dev.name}] ${p} scroll-padding-top 已设置`, parseFloat(top.scrollPadTop) >= top.headerH, `scrollPad=${top.scrollPadTop}`);
      assert(`[${dev.name}] ${p} main 内容区起点在 header 下方`, top.mainContentTop >= top.headerH - 1, `contentTop=${top.mainContentTop} headerBottom=${top.headerH}`);
      assert(`[${dev.name}] ${p} main 首个子元素未被遮挡`, top.firstChildTop !== null && top.firstChildTop >= top.headerH - 1, `childTop=${top.firstChildTop} headerBottom=${top.headerH}`);
      assert(`[${dev.name}] ${p} 首屏标题/卡片未被遮挡`, top.firstOverlapped === false || top.firstTop === null, `first=${top.firstTag} top=${top.firstTop} headerBottom=${top.headerH}`);
      assert(`[${dev.name}] ${p} 有过渡动画`, /height/.test(top.headerTrans) && /height|max-width/.test(top.logoTrans), `header=${top.headerTrans} logo=${top.logoTrans}`);
      assert(`[${dev.name}] ${p} 无横向溢出`, top.docScrollW <= top.winW + 1, `scrollW=${top.docScrollW} win=${top.winW}`);

      // 滚动 600px：header 仍钉在顶部，且内容在其下方滚动（不重叠判定针对首屏）
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(350);
      const sc = await probe(page);
      assert(`[${dev.name}] ${p} 滚动后 header 仍吸顶`, sc.headerTop === 0 && sc.headerH >= 58, `top=${sc.headerTop} h=${sc.headerH}`);

      // 锚点跳转：目标标题不能被 header 盖住
      const anchored = await page.evaluate(async () => {
        const links = [...document.querySelectorAll('a[href^="#"]')].filter(a => {
          const id = a.getAttribute('href').slice(1);
          const t = id && document.getElementById(id);
          if (!t) return false;
          const b = t.getBoundingClientRect();
          return b.height > 0;
        });
        if (!links.length) return null;
        const a = links[0];
        const id = a.getAttribute('href').slice(1);
        location.hash = '';
        location.hash = '#' + id;
        await new Promise(r => setTimeout(r, 500));
        const h = document.querySelector('body > header').getBoundingClientRect();
        const t = document.getElementById(id).getBoundingClientRect();
        return { id, targetTop: Math.round(t.top), headerBottom: Math.round(h.bottom) };
      });
      if (anchored) {
        assert(`[${dev.name}] ${p} 锚点 #${anchored.id} 未被 header 遮挡`,
          anchored.targetTop >= anchored.headerBottom - 1,
          `targetTop=${anchored.targetTop} headerBottom=${anchored.headerBottom}`);
      }
      await ctx.close();
    }
  }

  await browser.close();

  const fail = results.filter(r => !r.ok);
  console.log(`\n断言总数 ${results.length}，通过 ${results.length - fail.length}，失败 ${fail.length}`);
  if (fail.length) { console.log('\n--- 失败明细 ---'); fail.forEach(f => console.log('❌', f.name, '|', f.detail)); process.exitCode = 1; }
  else console.log('✅ 全部通过');
})();
