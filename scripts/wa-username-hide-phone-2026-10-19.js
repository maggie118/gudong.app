#!/usr/bin/env node
/**
 * wa-username-hide-phone-2026-10-19.js
 *
 * 目标：全站「站内咨询」→ WhatsApp，并且**任何地方都不再出现手机号码**。
 *
 * 本脚本是 10-18 两个脚本的收尾补丁（那两个已先跑过）：
 *   1. replace-item-chat-with-whatsapp-2026-10-18.js  —— 藏品页聊天组件 → 绿色 WA 按钮
 *   2. wa-username-2026-10-18.js                       —— username 动态绑定（data-wa-bind + setWaContact）
 *
 * 本脚本负责剩下四类：
 *   A. 藏家页 meta description 里的「通过站内咨询联系发布者」→「通过 WhatsApp 联系发布者」
 *   B. 浏览器端彻底去掉「号码兜底」：wa_username 缺失时直接落到平台 username，
 *      且纯数字一律不当作 username（防止误填号码进 wa_username 列后泄漏）
 *   C. 精修/上架弹窗里硬编码的平台号 https://wa.me/6591888952 → https://wa.me/<PLATFORM_USERNAME>
 *   D. 生成器脚本里的平台号常量同步（避免下次重新生成页面又把号码带回来）
 *
 * 幂等：每段都有独立标记，重复运行结果不变。
 * 用法：node scripts/wa-username-hide-phone-2026-10-19.js          # 预览
 *       node scripts/wa-username-hide-phone-2026-10-19.js --write  # 落盘
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const PLATFORM_USERNAME = 'gudong.app';   // ← 平台 WhatsApp username，改这里后重跑即可全量生效
const MARK = 'gd-wa-hide-phone-2026-10-19';

const SKIP_DIR = /^(_backup[\w-]*|_upload[\w-]*|airtable-script|node_modules|\.git|\.workbuddy|prototypes|templates|content|docs|\.vercel)$/;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (SKIP_DIR.test(e.name)) continue; walk(p, out); }
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

const log = [];
function patch(rel, fn) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { log.push(['missing', rel, '']); return; }
  const src = fs.readFileSync(abs, 'utf8');
  const out = fn(src);
  if (!out || out.html === src) { log.push(['skip', rel, out && out.note || '']); return; }
  if (WRITE) fs.writeFileSync(abs, out.html, 'utf8');
  log.push([WRITE ? 'written' : 'would-write', rel, out.note || '']);
}

// ---------- A. 藏家页 meta：站内咨询 → WhatsApp ----------
const META_OLD = '浏览藏品并通过站内咨询联系发布者';
const META_NEW = '浏览藏品并通过 WhatsApp 联系发布者';

// ---------- B. 浏览器端去掉号码兜底 ----------
// 藏品页 setWaContact（wa-username-2026-10-18.js 注入的原文，逐行精确匹配）
const ITEM_OLD_1 = "            if (sl) raw = String(clean(first(sl.wa_username)) || clean(first(sl.whatsapp)) || '');";
const ITEM_NEW_1 = "            if (sl) raw = String(clean(first(sl.wa_username)) || '');";
const ITEM_OLD_2 = "            var norm = raw.trim().replace(/^@/, '').replace(isUsername ? /[^A-Za-z0-9_.]/g : /[^0-9]/g, '');";
const ITEM_NEW_2 = "            /* " + MARK + " —— 纯数字一律不输出（隐藏手机号码） */\n            var norm = /^[0-9]+$/.test(raw.trim()) ? '' : raw.trim().replace(/^@/, '').replace(/[^A-Za-z0-9_.]/g, '');";
const ITEM_OLD_3 = "            var from = norm ? (isUsername ? 'seller' : 'seller-phone') : 'platform';";
const ITEM_NEW_3 = "            var from = norm ? 'seller' : 'platform';";

// 藏家页 contactWhatsapp
const SELLER_OLD_1 = "            if (sl.wa_username || sl.whatsapp) {";
const SELLER_NEW_1 = "            /* " + MARK + " —— 只用 username，号码不再出现在链接里 */\n            if (sl.wa_username) {";
const SELLER_OLD_2 = "                const raw = String(sl.wa_username || sl.whatsapp || '').trim().replace(/^@/, '');";
const SELLER_NEW_2 = "                const raw = String(sl.wa_username || '').trim().replace(/^@/, '');";
const SELLER_OLD_3 = "                const norm = sl.wa_username ? raw.replace(/[^A-Za-z0-9_.]/g, '') : raw.replace(/[^0-9]/g, '');";
const SELLER_NEW_3 = "                const norm = /^[0-9]+$/.test(raw) ? '' : raw.replace(/[^A-Za-z0-9_.]/g, '');";

// ---------- C. 硬编码平台号 ----------
const NUM_RE = /https:\/\/wa\.me\/6591888952/g;
const NUM_NEW = 'https://wa.me/' + PLATFORM_USERNAME;

// ---------- main ----------
const all = walk(ROOT);

const SELF = 'scripts/wa-username-hide-phone-2026-10-19.js';

for (const abs of all) {
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  if (rel === SELF) continue;   // ⚠️ 脚本自身含有同样的字符串，必须排除，否则会把源码改坏
  const isItem = /^items\/[^/]+\.html$/.test(rel);
  const isSeller = /^sellers\/seller-[^/]+\.html$/.test(rel);
  const isPage = /\.(html)$/.test(rel) && !rel.startsWith('scripts/');

  patch(rel, (src) => {
    let html = src;
    const notes = [];

    // A：meta 文案（藏家页 / 任何页面都适用）
    if (html.includes(META_OLD)) {
      html = html.split(META_OLD).join(META_NEW);
      notes.push('meta×' + (src.split(META_OLD).length - 1));
    }

    // B1：藏品页——去掉号码兜底
    if (isItem && !html.includes(MARK)) {
      if (html.includes(ITEM_OLD_1)) { html = html.split(ITEM_OLD_1).join(ITEM_NEW_1); notes.push('item-no-phone'); }
      if (html.includes(ITEM_OLD_2)) { html = html.split(ITEM_OLD_2).join(ITEM_NEW_2); notes.push('item-digit-guard'); }
      if (html.includes(ITEM_OLD_3)) { html = html.split(ITEM_OLD_3).join(ITEM_NEW_3); notes.push('item-from'); }
    }

    // B2：藏家页——只用 username
    if (isSeller && !html.includes(MARK)) {
      if (html.includes(SELLER_OLD_1)) { html = html.split(SELLER_OLD_1).join(SELLER_NEW_1); notes.push('seller-only-username'); }
      if (html.includes(SELLER_OLD_2)) { html = html.split(SELLER_OLD_2).join(SELLER_NEW_2); notes.push('seller-raw'); }
      if (html.includes(SELLER_OLD_3)) { html = html.split(SELLER_OLD_3).join(SELLER_NEW_3); notes.push('seller-digit-guard'); }
    }

    // C：页面里硬编码的平台号 → username
    //    ⚠️ 用 includes 判断而非 NUM_RE.test()，避免 /g 正则的 lastIndex 副作用
    if (isPage && html.includes('https://wa.me/6591888952')) {
      html = html.replace(NUM_RE, NUM_NEW);
      notes.push('wa.me→username');
    }

    // D：生成器/注入脚本里的 URL 形式平台号（只改 URL 形式，避免破坏 wa-username 脚本里的旧串匹配）
    if (rel.startsWith('scripts/') && html.includes('https://wa.me/6591888952')) {
      html = html.replace(NUM_RE, NUM_NEW);
      notes.push('script-wa.me→username');
    }
    // 生成器常量：const PLATFORM_WHATSAPP = '6591888952';
    if (rel === 'scripts/generate-items.js' && /const PLATFORM_WHATSAPP\s*=\s*'6591888952'/.test(html)) {
      html = html.replace(/const PLATFORM_WHATSAPP\s*=\s*'6591888952'/, "const PLATFORM_WHATSAPP = '" + PLATFORM_USERNAME + "'");
      notes.push('PLATFORM_WHATSAPP');
    }

    return { html, note: notes.join(',') };
  });
}

// ---------- 汇总 ----------
const counts = {};
log.forEach(([st]) => counts[st] = (counts[st] || 0) + 1);
console.log('模式: ' + (WRITE ? 'WRITE（已落盘）' : 'DRY-RUN（预览）'));
console.log('平台 username: ' + PLATFORM_USERNAME);
console.log('统计: ' + JSON.stringify(counts));
log.filter(([st]) => st !== 'skip').forEach(([st, rel, note]) => console.log('  ' + st.padEnd(12) + rel + (note ? '  [' + note + ']' : '')));
