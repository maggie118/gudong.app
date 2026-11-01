/**
 * WhatsApp Username 改造校验（2026-10-18）
 *  1) 19 个文件所有内联 <script> 语法检查（vm.Script）
 *  2) 无头浏览器：15 个藏品页按钮 href / 隐私说明双语 / 页面无 JS 报错
 *  3) 无头浏览器：4 个藏家页加载无 JS 报错，contactWhatsapp 逻辑就位
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { chromium } = require('C:/Users/Eastw Engineering/.workbuddy/binaries/node/workspace/node_modules/playwright-core');

const ROOT = process.cwd();
const CHROME = 'C:/Users/Eastw Engineering/.agent-browser/browsers/chrome-154.0.8037.92/chrome.exe';

function listHtml(dir) {
  const abs = path.join(ROOT, dir);
  return fs.readdirSync(abs).filter(f => f.endsWith('.html')).map(f => path.join(dir, f));
}

// ---------- 1) 语法检查 ----------
function syntaxCheck(file) {
  const html = fs.readFileSync(file, 'utf8');
  // 只检查可执行 JS；JSON-LD / 模板型 script 用 vm.Script 解析会误报 Unexpected token ':'
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, i = 0, bad = [];
  while ((m = re.exec(html))) {
    i++;
    const attrs = m[1] || '';
    if (attrs.includes('src')) continue;
    const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
    if (typeMatch && !/javascript|module|^$/i.test(typeMatch[1])) continue; // ld+json 等跳过
    const code = m[2];
    if (!code.trim()) continue;
    try { new vm.Script(code, { filename: file + '#script' + i }); }
    catch (e) { bad.push('script#' + i + ': ' + e.message); }
  }
  return bad;
}

const targets = [...listHtml('items'), ...listHtml('sellers').filter(f => !f.endsWith('index.html'))];
let synFail = 0;
console.log('=== 1) 内联脚本语法检查 (' + targets.length + ' 个文件) ===');
for (const f of targets) {
  const bad = syntaxCheck(f);
  if (bad.length) { synFail++; console.log('  ✗ ' + f); bad.forEach(b => console.log('      ' + b)); }
}
console.log(synFail === 0 ? '  ✔ 全部通过' : '  ✗ ' + synFail + ' 个文件语法错误');

// ---------- 2) 无头浏览器 ----------
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  let pass = 0, fail = 0;
  const errors = [];

  for (const file of targets) {
    const url = 'file:///' + path.join(ROOT, file).replace(/\\/g, '/');
    const page = await ctx.newPage();
    const pageErrors = [];
    // file:// 下 ServiceWorker 必然注册失败，属协议固有噪声，与本次改动无关
    const IGNORE = /ServiceWorker|The URL protocol of the current origin/i;
    page.on('pageerror', e => { if (!IGNORE.test(e.message)) pageErrors.push(e.message); });
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);

    if (pageErrors.length) { fail++; errors.push(file + ' → JS 报错: ' + pageErrors[0]); await page.close(); continue; }

    if (file.startsWith('items')) {
      for (const lang of ['zh', 'en']) {
        await page.evaluate(l => document.body.setAttribute('data-lang', l), lang);
        await page.waitForTimeout(120);
        const r = await page.evaluate(() => {
          const btn = document.querySelector('[data-gd-wa-btn] .pwa-wa-username-btn');
          const note = document.querySelector('[data-gd-wa-btn] .gd-wa-privacy-note');
          if (!btn) return { ok: false, why: '按钮不存在' };
          const vis = s => { const e = note && note.querySelector(s); return e ? getComputedStyle(e).display !== 'none' : false; };
          return {
            ok: true,
            href: btn.getAttribute('href'),
            target: btn.getAttribute('target'),
            rel: btn.getAttribute('rel'),
            bg: getComputedStyle(btn).backgroundColor,
            radius: getComputedStyle(btn).borderTopLeftRadius,
            zhVis: vis('.zh'), enVis: vis('.en'),
            noteText: note ? (note.querySelector('.' + document.body.dataset.lang) || {}).textContent || '' : ''
          };
        });
        const wantNote = lang === 'zh' ? '手机号' : 'phone number';
        const okHref = /^https:\/\/wa\.me\/[A-Za-z0-9_.]+$/.test(r.href || '');
        const okNote = r.noteText && r.noteText.includes(wantNote);
        const okSwitch = lang === 'zh' ? (r.zhVis && !r.enVis) : (r.enVis && !r.zhVis);
        if (!r.ok || !okHref || !okNote || !okSwitch || r.target !== '_blank' || r.bg !== 'rgb(37, 211, 102)' || r.radius !== '12px') {
          fail++;
          errors.push(file + ' [' + lang + '] ' + JSON.stringify(r));
        } else pass++;
      }
    } else {
      const r = await page.evaluate(() => {
        const s = document.querySelectorAll('script');
        let has = false;
        s.forEach(x => { if (x.textContent.includes('wa_username')) has = true; });
        return { hasUsernameLogic: has };
      });
      if (!r.hasUsernameLogic) { fail++; errors.push(file + ' → 缺少 wa_username 逻辑'); }
      else pass++;
    }
    await page.close();
  }

  console.log('\n=== 2) 无头浏览器断言 ===');
  console.log('  通过: ' + pass + '   失败: ' + fail);
  if (errors.length) errors.slice(0, 10).forEach(e => console.log('  ✗ ' + e));

  await browser.close();
  process.exit(synFail === 0 && fail === 0 ? 0 : 1);
})();
