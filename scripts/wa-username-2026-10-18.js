/**
 * WhatsApp 用户名动态绑定（2026-10-18，v2）
 *
 * 需求：用户在 gudong.app 浏览不同古董商品时，页面把 <a> 的 href 动态拼接为「当前卖家」的
 *       WhatsApp 用户名 —— 同一个页面模板，换商品即换卖家，换卖家即换 username。
 *
 * 绑定机制（属性驱动，通用）：
 *   页面上任意 <a data-wa-bind="seller"> 都会被自动绑定，不再只认某一个按钮。
 *   优先级：卖家 wa_username → 卖家 whatsapp（号码兜底）→ 平台常量 PLATFORM_USERNAME。
 *   绑定结果写回 DOM：data-wa-username（实际用户名）/ data-wa-from（seller|seller-phone|platform），便于调试。
 *
 * 覆盖范围：
 *   A. items/*.html（15 个藏品页）：主按钮加 data-wa-bind="seller"；注入/升级 setWaContact(sl)
 *   B. sellers/*.html（4 个藏家页）：修 el.href 拼接（旧的 replace(/[^\d]/g,'') 会把 username 洗没）
 *   C. items/*.html 专家预约：平台号 6591888952 → 平台 username
 *
 * 幂等标记：gd-wa-bind-v2。默认预览，加 --write 落盘。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const WRITE = process.argv.includes('--write');
const MARK = 'gd-wa-username-2026-10-18';   // 注释标记（人类可读）
const MARK2 = 'gd-wa-bind-v2';              // 幂等版本标记
const PLATFORM_USERNAME = 'gudong.app';     // ← 平台兜底 username，改这里后重跑脚本即可全量生效

const SKIP_DIRS = new Set(['airtable-script', 'node_modules', '.git', '.workbuddy', 'prototypes', 'scripts', 'templates', 'content', 'docs', '.vercel']);

function listHtml(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(f => f.endsWith('.html')).map(f => path.join(dir, f));
}

// ---------- 藏品页 ----------
const OLD_LABEL = '<span class="zh">🟢 通过 WhatsApp 匿名咨询藏家</span><span class="en">🟢 Message the collector on WhatsApp</span>';
const NEW_LABEL = '<span class="zh">🟢 通过 WhatsApp 用户名咨询藏家</span><span class="en">🟢 Message the collector on WhatsApp</span>';

const PRIVACY_NOTE =
  '\n                    <p class="gd-wa-privacy-note">' +
  '<span class="zh">通过 WhatsApp 用户名联系，双方均不会看到对方手机号。</span>' +
  '<span class="en">Connect by WhatsApp username — neither side sees the other\u2019s phone number.</span>' +
  '</p>';

const PRIVACY_CSS =
  '.gd-wa-privacy-note{margin:8px 0 0;padding:0 4px;font-size:12px;line-height:1.55;color:rgba(28,25,22,.62);text-align:center;}' +
  '.pwa-wa-username-btn+.gd-wa-privacy-note,[data-gd-wa-btn] .gd-wa-privacy-note{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}\n';

// 注意：以下每行是写进 HTML 的 JS 源码，引号要转义；最终按目标文件 eol 拼接。
const WA_FN_LINES = [
  '        /* ' + MARK + ' · ' + MARK2 + ' —— 卖家 WhatsApp 用户名动态绑定：所有 a[data-wa-bind="seller"] 一并处理 */',
  '        function setWaContact(sl) {',
  '            var PLATFORM_WA_USERNAME = ' + JSON.stringify(PLATFORM_USERNAME) + ';',
  '            var links = document.querySelectorAll(\'a[data-wa-bind="seller"]\');',
  '            if (!links.length) return;',
  '            var raw = \'\';',
  '            if (sl) raw = String(clean(first(sl.wa_username)) || clean(first(sl.whatsapp)) || \'\');',
  '            var isUsername = !!(sl && clean(first(sl.wa_username)));',
  '            var norm = raw.trim().replace(/^@/, \'\').replace(isUsername ? /[^A-Za-z0-9_.]/g : /[^0-9]/g, \'\');',
  '            var from = norm ? (isUsername ? \'seller\' : \'seller-phone\') : \'platform\';',
  '            if (!norm) norm = PLATFORM_WA_USERNAME;',
  '            if (!norm) return;',
  '            for (var i = 0; i < links.length; i++) {',
  '                links[i].href = \'https://wa.me/\' + norm;',
  '                links[i].setAttribute(\'data-wa-username\', norm);',
  '                links[i].setAttribute(\'data-wa-from\', from);',
  '            }',
  '        }'
];

const FN_START = '/* ' + MARK;

function patchItem(rel) {
  const abs = path.join(ROOT, rel);
  let html = fs.readFileSync(abs, 'utf8');
  // 上一版曾因前导空格偏移留下 16 空格缩进，遇到就重跑修正
  // ⚠️ 判「调用点是否插入」必须用带分号的 setWaContact(sl);
  //    否则会被函数定义行 function setWaContact(sl) { 误判为已插入，导致函数定义了却从不被调用
  const BAD_INDENT = '                /* ' + MARK;
  if (html.includes(MARK2) && !html.includes(BAD_INDENT) && html.includes('setWaContact(sl);')) {
    return { rel, status: 'skip' };
  }

  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const before = html;

  // 1) 主文案
  if (html.includes(OLD_LABEL)) html = html.replace(OLD_LABEL, NEW_LABEL);

  // 2) href 静态兜底（Airtable 连不上时也能用）
  html = html.replace('<a href="https://wa.me" target="_blank" rel="noopener noreferrer" class="pwa-wa-username-btn">',
    '<a href="https://wa.me/' + PLATFORM_USERNAME + '" target="_blank" rel="noopener noreferrer" class="pwa-wa-username-btn">');

  // 3) 给按钮加绑定标记（负向前瞻保证幂等）
  html = html.replace(/<a href="([^"]*)"(\s+)target="_blank" rel="noopener noreferrer" class="pwa-wa-username-btn"(?![^>]*data-wa-bind)/g,
    '<a href="$1"$2target="_blank" rel="noopener noreferrer" class="pwa-wa-username-btn" data-wa-bind="seller"');

  // 4) 隐私说明（插在按钮 </a> 之后）
  const btnRe = /(<div class="pwa-action-container" data-gd-wa-btn>[\s\S]*?<\/a>)/;
  if (btnRe.test(html) && !html.includes('gd-wa-privacy-note')) {
    html = html.replace(btnRe, (m) => m + PRIVACY_NOTE.split('\n').join(eol));
  }

  // 5) CSS
  const cssAnchor = '.pwa-wa-username-btn .wa-svg-icon{width:24px;height:24px;margin-right:10px;fill:#FFFFFF;flex-shrink:0;}';
  if (html.includes(cssAnchor)) html = html.replace(cssAnchor, cssAnchor + '\n' + PRIVACY_CSS);

  // 6) 注入或升级 setWaContact 函数块
  //    fnBlock 自带结尾的 "}"，所以替换旧块时必须连同旧块的 endMark（含那个 "}"）一起吃掉，
  //    否则页面会多出一个 "}" → Unexpected token 'function'，整页 JS 崩。
  const fnBlock = WA_FN_LINES.join(eol);
  if (html.includes(FN_START)) {
    // 从「注释所在行的行首」开始替换，避免前导空格残留导致缩进错位
    const p = html.indexOf(FN_START);
    const nl = html.lastIndexOf(eol, p);
    const s = nl >= 0 ? nl + eol.length : p;
    const endMark = eol + '        }' + eol;
    const e = html.indexOf(endMark, s);
    if (e > s) html = html.slice(0, s) + fnBlock + eol + html.slice(e + endMark.length);
  } else {
    const fnAnchor = 'function setSellerCard(f, data) {';
    if (html.includes(fnAnchor)) html = html.replace(fnAnchor, fnBlock + eol + fnAnchor);
  }

  // 7) 调用点：必须放在 fetch 成功分支里，且用带分号的形式判断，避免被函数定义行误判
  const callAnchor = 'setSellerCard(f, data);';
  if (html.includes(callAnchor) && !html.includes('setWaContact(sl);')) {
    html = html.replace(callAnchor, callAnchor + eol + '                setWaContact(sl);');
  }

  // 8) 专家预约平台号 → 平台 username（联系平台顾问，不是当前卖家）
  html = html.replace(/const platformWa = "6591888952";/, 'const platformWa = "' + PLATFORM_USERNAME + '";');

  if (html === before) return { rel, status: 'nochange' };
  if (WRITE) fs.writeFileSync(abs, html, 'utf8');
  return { rel, status: WRITE ? 'written' : 'would-write' };
}

// ---------- 藏家页 ----------
// 注意：站点存在 CRLF/LF 混用，旧片段必须按目标文件的 eol 现场拼接，
// 否则 Windows 文件匹配不上 → 千万别用「匹配单句再替换多行」的兜底，会破坏外层 if 块。
const SELLER_OLD_LINES = [
  "            if (sl.whatsapp) {",
  "                const el = document.getElementById('contactWhatsapp');",
  "                el.href = 'https://wa.me/' + String(sl.whatsapp).replace(/[^\\d]/g, '');",
  "                el.hidden = false;",
  "            }"
];

function sellerNew(eol) {
  return [
    '            /* ' + MARK + ' —— username 优先；旧的纯数字清洗会毁掉 username，故分开处理 */',
    '            if (sl.wa_username || sl.whatsapp) {',
    '                const el = document.getElementById(\'contactWhatsapp\');',
    '                const PLATFORM_WA_USERNAME = ' + JSON.stringify(PLATFORM_USERNAME) + ';',
    '                const raw = String(sl.wa_username || sl.whatsapp || \'\').trim().replace(/^@/, \'\');',
    '                const norm = sl.wa_username ? raw.replace(/[^A-Za-z0-9_.]/g, \'\') : raw.replace(/[^0-9]/g, \'\');',
    '                el.href = \'https://wa.me/\' + (norm || PLATFORM_WA_USERNAME);',
    '                el.hidden = false;',
    '            }'
  ].join(eol);
}

function patchSeller(rel) {
  const abs = path.join(ROOT, rel);
  let html = fs.readFileSync(abs, 'utf8');
  if (html.includes(MARK)) return { rel, status: 'skip' };
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const before = html;

  const oldBlock = SELLER_OLD_LINES.join(eol);
  if (!html.includes(oldBlock)) return { rel, status: 'nochange' }; // 匹配不上就原样放过，绝不猜着改
  html = html.replace(oldBlock, sellerNew(eol));

  if (html === before) return { rel, status: 'nochange' };
  if (WRITE) fs.writeFileSync(abs, html, 'utf8');
  return { rel, status: WRITE ? 'written' : 'would-write' };
}

// ---------- main ----------
const results = [];
listHtml('items').forEach(f => results.push(patchItem(f)));
listHtml('sellers').forEach(f => results.push(patchSeller(f)));

const counts = {};
results.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);
console.log('模式: ' + (WRITE ? 'WRITE（已落盘）' : 'DRY-RUN（预览）'));
console.log('平台兜底 username: ' + PLATFORM_USERNAME);
console.log('统计: ' + JSON.stringify(counts));
results.filter(r => r.status !== 'skip').forEach(r => console.log('  ' + r.status + '  ' + r.rel));
