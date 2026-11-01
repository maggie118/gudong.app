#!/usr/bin/env node
/* seller-save-page.js — sellers 藏家主页「分享主页」→「收藏主页」改造（2026-10-09）
 * 1) 修复嵌套 <script> 标签（gudong-follow.js 之前根本没加载）
 * 2) 简介区「分享主页」按钮 → 「收藏主页」收藏切换按钮（GudongFollow, type:'seller'）
 * 3) body 末尾挂载 mount 脚本：点击后写入 localStorage gudong_follow，
 *    在 my/saved.html「我的收藏 · 关注」可见；header 的分享图标按钮保留不动
 * 幂等；保留原文件换行风格。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGES = [
  'sellers/seller-lim-kw-antiques.html',
  'sellers/seller-ng-cy-antiques.html',
  'sellers/seller-ng-lk-antiques.html',
  'sellers/seller-yak-bc-antiques.html',
];

const BAD_INCLUDE =
  '<script src="https://gudong.app/assets/js/gudong-data.js" data-root="https://gudong.app/">\n' +
  '        <script src="https://gudong.app/assets/js/gudong-follow.js"></script></script>';
const GOOD_INCLUDE =
  '<script src="https://gudong.app/assets/js/gudong-data.js" data-root="https://gudong.app/"></script>\n' +
  '        <script src="https://gudong.app/assets/js/gudong-follow.js"></script>';

const OLD_BTN = '<button type="button" class="contact-btn outline" onclick="shareMuseum()">\n' +
  '                    <span class="zh">分享主页</span><span class="en">Share</span>\n' +
  '                </button>';
const NEW_BTN = '<button type="button" class="contact-btn outline" id="saveSellerBtn" title="收藏该藏家主页">\n' +
  '                    <span class="zh">收藏主页</span><span class="en">Save Page</span>\n' +
  '                </button>';

const MOUNT_MARK = 'gd-seller-save-mount';
const MOUNT_SCRIPT = [
  '<script id="' + MOUNT_MARK + '">',
  '/* 2026-10-09：收藏主页 —— 接入「我的收藏 · 关注」关注体系（gudong_follow） */',
  '(function () {',
  "    var btn = document.getElementById('saveSellerBtn');",
  "    if (!btn || !window.GudongFollow || typeof SELLER_ID === 'undefined') return;",
  '    var toastEl = null, toastTimer = null;',
  '    function showToast(msg) {',
  "        if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'gd-toast'; document.body.appendChild(toastEl); }",
  "        toastEl.textContent = msg; toastEl.classList.add('show');",
  '        clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove(\'show\'); }, 2400);',
  '    }',
  '    GudongFollow.mount(btn, {',
  "        type: 'seller', term: SELLER_ID,",
  "        followZh: '\\u6536\\u85cf\\u4e3b\\u9875', followEn: 'Save Page',",   // 收藏主页
  "        doneZh: '\\u5df2\\u6536\\u85cf', doneEn: 'Saved',",                   // 已收藏
  '        onToggle: function (on) {',
  "            btn.title = on ? '\\u5df2\\u6536\\u85cf\\uff0c\\u53ef\\u5728\\u300c\\u6211\\u7684\\u6536\\u85cf \\u00b7 \\u5173\\u6ce8\\u300d\\u67e5\\u770b' : '\\u6536\\u85cf\\u8be5\\u85cf\\u5bb6\\u4e3b\\u9875';",
  "            var lang = (document.body.dataset && document.body.dataset.lang) || 'zh';",
  "            showToast(on ? (lang === 'zh' ? '\\u5df2\\u6536\\u85cf\\u4e3b\\u9875\\uff0c\\u53ef\\u5728\\u300c\\u6211\\u7684\\u6536\\u85cf \\u00b7 \\u5173\\u6ce8\\u300d\\u67e5\\u770b' : 'Page saved \\u2014 see it in Saved & Followed')",
  "                         : (lang === 'zh' ? '\\u5df2\\u53d6\\u6d88\\u6536\\u85cf' : 'Removed from saved'));",
  '        }',
  '    });',
  '})();',
  '</script>',
].join('\n');

let changed = 0;
for (const rel of PAGES) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, 'utf8');
  let out = html;
  const log = [];

  // 1) 修复嵌套 script（兼容 \n 与 \r\n：先把坏块按宽松方式定位）
  if (out.includes('gudong-data.js" data-root')) {
    const re = /<script src="https:\/\/gudong\.app\/assets\/js\/gudong-data\.js"[^>]*>\s*<script src="https:\/\/gudong\.app\/assets\/js\/gudong-follow\.js"><\/script><\/script>/;
    const m = out.match(re);
    if (m) {
      const eol = m[0].includes('\r\n') ? '\r\n' : '\n';
      const indent2 = m[0].match(/\n(\s*)<script src="https:\/\/gudong\.app\/assets\/js\/gudong-follow/);
      const ind = indent2 ? indent2[1] : '        ';
      out = out.replace(re, GOOD_INCLUDE.replace(/\n/g, eol).replace('\n        <script', '\n' + ind + '<script'));
      log.push('修复嵌套 script 标签');
    }
  }

  // 2) 分享主页 → 收藏主页（宽松空白匹配，保留原缩进与 EOL）
  const btnRe = /<button type="button" class="contact-btn outline" onclick="shareMuseum\(\)">\s*<span class="zh">分享主页<\/span><span class="en">Share<\/span>\s*<\/button>/;
  const btnM = out.match(btnRe);
  if (btnM) {
    const eol = btnM[0].includes('\r\n') ? '\r\n' : '\n';
    const indM = btnM[0].match(/\n(\s*)<span class="zh">分享主页/);
    const ind = indM ? indM[1] : '                    ';
    const lines = NEW_BTN.split('\n');
    const rebuilt = lines.map((l, i) => (i === 0 ? l : (i === lines.length - 1 ? ind + l.trimEnd() : ind + l))).join(eol);
    out = out.replace(btnRe, rebuilt);
    log.push('分享主页 → 收藏主页');
  }

  // 3) 挂载脚本
  if (!out.includes(MOUNT_MARK)) {
    const closeIdx = out.lastIndexOf('</body>');
    if (closeIdx === -1) { console.log('[SKIP] ' + rel + '：未找到 </body>'); continue; }
    // 探测 </body> 前的缩进风格（直接顶格插入，与现有页尾一致）
    out = out.slice(0, closeIdx) + MOUNT_SCRIPT + '\n' + out.slice(closeIdx);
    log.push('注入 mount 脚本');
  }

  if (out === html) { console.log('[OK·无改动] ' + rel); continue; }
  // 往返自检
  fs.writeFileSync(file, out);
  const back = fs.readFileSync(file, 'utf8');
  if (back !== out) { console.error('[FAIL] ' + rel + '：写回不一致'); process.exitCode = 1; continue; }
  changed++;
  console.log('[OK] ' + rel + ' → ' + log.join('；'));
}
console.log('---- 完成：' + changed + ' / ' + PAGES.length + ' 个文件有改动 ----');
