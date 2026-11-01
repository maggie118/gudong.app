#!/usr/bin/env node
/**
 * verify-item-whatsapp-btn-2026-10-18.js — 无头断言：藏品页的 WhatsApp 咨询按钮
 *
 * 检查项（每个藏品页 × 中英两种 lang）：
 *  1. 存在且仅有一个 .pwa-wa-username-btn
 *  2. 可见（非 0 尺寸、display 不是 none）
 *  3. href 为 https://wa.me（空占位，等后台填卖家号）
 *  4. target=_blank + rel 含 noopener
 *  5. 品牌绿 #25D366 生效、圆角 12px、字号 16px
 *  6. 图标 24×24 且白色
 *  7. 双语：data-lang=zh 时中文可见、英文隐藏；data-lang=en 时相反
 *  8. 旧的聊天组件（data-gudong-chat / gd-chat-panel）已彻底移除
 *
 * 用法：node scripts/verify-item-whatsapp-btn-2026-10-18.js
 */
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const WORKSPACE = 'C:/Users/Eastw Engineering/.workbuddy/binaries/node/workspace/node_modules';
const { chromium } = require(WORKSPACE + '/playwright-core');
const CHROME = 'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';

const files = fs.readdirSync(path.join(ROOT, 'items')).filter(function (f) { return f.endsWith('.html'); }).sort();

(async function () {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  let pass = 0, fail = 0;
  const failures = [];

  for (const f of files) {
    const url = 'file:///' + path.join(ROOT, 'items', f).replace(/\\/g, '/');
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(function () { return document.fonts.ready; });
    // 页面有淡入动画 + 按钮自带 background-color .2s 过渡，必须等它稳定再采样
    await page.waitForTimeout(700);

    for (const lang of ['zh', 'en']) {
      const r = await page.evaluate(function (lang) {
        document.body.setAttribute('data-lang', lang);
        const btns = document.querySelectorAll('.pwa-wa-username-btn');
        const out = { count: btns.length, ok: [], bad: [] };
        function chk(cond, msg) { (cond ? out.ok : out.bad).push(msg); }
        chk(out.count === 1, '按钮数量=1');
        chk(!document.querySelector('[data-gudong-chat]'), '旧聊天组件已移除');
        chk(!document.querySelector('[data-chat-panel]'), '旧聊天面板已移除');
        if (out.count !== 1) return out;
        const b = btns[0];
        const cs = getComputedStyle(b);
        const rect = b.getBoundingClientRect();
        chk(rect.width > 200 && rect.height >= 44, '尺寸 ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
        chk(cs.display !== 'none' && cs.visibility !== 'hidden', '可见');
        chk(b.getAttribute('href') === 'https://wa.me', 'href=' + b.getAttribute('href'));
        chk(b.getAttribute('target') === '_blank' && (b.getAttribute('rel') || '').indexOf('noopener') !== -1, 'target/rel 安全');
        chk(cs.backgroundColor === 'rgb(37, 211, 102)', '品牌绿 ' + cs.backgroundColor);
        chk(cs.borderTopLeftRadius === '12px', '圆角 ' + cs.borderTopLeftRadius);
        chk(cs.fontSize === '16px', '字号 ' + cs.fontSize);
        const svg = b.querySelector('.wa-svg-icon');
        const sr = svg ? svg.getBoundingClientRect() : null;
        chk(sr && Math.round(sr.width) === 24 && Math.round(sr.height) === 24, '图标 24x24');
        chk(svg && getComputedStyle(svg).fill === 'rgb(255, 255, 255)', '图标白色');
        const zh = b.querySelector('.zh'), en = b.querySelector('.en');
        const vis = function (el) { return el ? getComputedStyle(el).display !== 'none' : false; };
        if (lang === 'zh') { chk(vis(zh) && !vis(en), '中文显示/英文隐藏'); }
        else { chk(vis(en) && !vis(zh), '英文显示/中文隐藏'); }
        return out;
      }, lang);

      const tag = f + ' [' + lang + ']';
      if (r.bad.length === 0) { pass++; }
      else { fail++; failures.push(tag + ' → ' + r.bad.join('; ')); }
    }
  }

  await browser.close();
  console.log('断言：' + (pass + fail) + ' 组（' + files.length + ' 页 × 2 语言）  通过 ' + pass + '  失败 ' + fail);
  if (failures.length) { console.log('\n失败明细：'); failures.forEach(function (x) { console.log('  ✗ ' + x); }); process.exitCode = 1; }
  else console.log('✅ 全部通过');
})();
