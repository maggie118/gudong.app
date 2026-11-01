#!/usr/bin/env node
/**
 * verify-header-logo-fit-2026-10-16.js
 *
 * 校验：所有含公共 header 的页面，在 320px ~ 1280px 的常见视口下，
 *       LOGO 文字块（.brand-text / .brand-text small）都不会被裁切，
 *       且 LOGO 文字与右侧分享按钮之间始终留有安全间距。
 *
 * 背景：.brand-text 带 overflow:hidden; white-space:nowrap，一旦 header 横向
 *       空间不足就会静默截断「古董圈 Gudong」，视觉上像被分享按钮遮住。
 *       修复见 scripts/fix-header-logo-clip-2026-10-16.js。
 *
 * 判定标准：
 *   - clipBrandText <= 0（.brand-text 内容宽度不超过容器）
 *   - clipSmall     <= 0 或副行被隐藏（≤360px 允许 display:none）
 *   - gapToShare    >= 2px（LOGO 文字与分享按钮不重叠）
 *   - header 高度在 320~767 为 58~62px、>767 为 68px（页头未被撑高）
 *
 * 用法：node scripts/verify-header-logo-fit-2026-10-16.js [--quick]
 *       加 --quick 只抽查每个目录的第一个文件。
 */

const fs = require('fs');
const path = require('path');

const NODE_PATH_HINT = 'C:/Users/Eastw Engineering/.workbuddy/binaries/node/workspace/node_modules';
if (!process.env.NODE_PATH || !process.env.NODE_PATH.includes('workbuddy')) {
  process.env.NODE_PATH = process.env.NODE_PATH
    ? process.env.NODE_PATH + path.delimiter + NODE_PATH_HINT
    : NODE_PATH_HINT;
  require('module').Module._initPaths();
}

const playwright = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME_CANDIDATES = [
  'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe',
  'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-153.0.8010.52/chrome.exe',
];
const WIDTHS = [320, 360, 375, 390, 414, 480, 481, 640, 768, 1024, 1280];

const SKIP_DIRS = new Set([
  'airtable-script',
  'node_modules',
  '.git',
  '.workbuddy',
  'prototypes',
  'scripts',
  'docs',
  '.vercel',
  'content',
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      if (entry.name.startsWith('_')) continue;
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function measure(page) {
  return page.evaluate(() => {
    const rect = (e) => (e ? e.getBoundingClientRect() : null);
    const header = document.querySelector('header');
    const bt = document.querySelector('.brand-text');
    if (!header || !bt) return { missing: true };
    const small = bt.querySelector('small');
    const rb = rect(bt);
    const rs = rect(document.querySelector('.gd-share-btn'));
    const smallVisible = !!small && getComputedStyle(small).display !== 'none';
    return {
      clipBrandText: bt.scrollWidth - Math.round(rb.width),
      clipSmall: small ? (smallVisible ? small.scrollWidth - Math.round(small.getBoundingClientRect().width) : 0) : 0,
      smallVisible,
      gapToShare: rs ? Math.round(rs.x - (rb.x + rb.width)) : 0,
      headerHeight: Math.round(rect(header).height),
    };
  });
}

(async () => {
  const quick = process.argv.includes('--quick');
  const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!chrome) {
    console.error('Chrome not found. Checked:\n' + CHROME_CANDIDATES.join('\n'));
    process.exit(2);
  }

  let files = walk(ROOT, []).filter((f) => fs.readFileSync(f, 'utf8').includes('<span class="brand-text">'));
  if (quick) {
    const byDir = new Map();
    for (const f of files) {
      const d = path.relative(ROOT, path.dirname(f));
      if (!byDir.has(d)) byDir.set(d, f);
    }
    files = [...byDir.values()];
  }
  files.sort();
  console.log('checking ' + files.length + ' pages x ' + WIDTHS.length + ' widths\n');

  const browser = await playwright.chromium.launch({ executablePath: chrome });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  const failures = [];
  let checks = 0;

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'domcontentloaded' });
    // 必须等 webfont（Playfair Display / Noto Serif SC）真正生效，否则量到的是
    // 回退字体的宽度，会低估 LOGO 文字实际占宽
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(80);

    const bad = [];
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.waitForTimeout(40);
      const m = await measure(page);
      checks += 1;
      if (m.missing) {
        bad.push(w + ':no header/brand-text');
        continue;
      }
      const expectHeaderH = w <= 767 ? 58 : 68;
      if (m.clipBrandText > 0) bad.push(w + ':brandText clip ' + m.clipBrandText);
      if (m.clipSmall > 0) bad.push(w + ':tagline clip ' + m.clipSmall);
      if (m.gapToShare < 2) bad.push(w + ':gap ' + m.gapToShare);
      if (Math.abs(m.headerHeight - expectHeaderH) > 6) bad.push(w + ':header h ' + m.headerHeight);
    }
    if (bad.length) {
      failures.push(rel + ' -> ' + bad.join(', '));
      console.log('FAIL ' + rel + ' : ' + bad.join(', '));
    } else {
      console.log('ok   ' + rel);
    }
  }

  await browser.close();
  console.log('\n---------------');
  console.log('pages   : ' + files.length);
  console.log('checks  : ' + checks);
  console.log('failures: ' + failures.length);
  process.exit(failures.length ? 1 : 0);
})();
