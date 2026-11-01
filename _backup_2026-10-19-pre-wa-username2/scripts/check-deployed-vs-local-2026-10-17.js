#!/usr/bin/env node
/**
 * check-deployed-vs-local-2026-10-17.js
 *
 * 用途：核对「线上已部署版本」与「本地文件」在关键公共组件上是否一致。
 *
 * 背景：本站是纯静态站、无 git，靠手动上传到 Vercel 部署。
 *       公共组件（分享按钮 CSS/JS、安装弹窗、页脚安装按钮、窄屏 LOGO 补丁）
 *       都是逐页内联注入的 —— 一旦某个文件上传时漏更新，就只有那一个页面坏，
 *       现象极易误判成"CSS 写错了"。
 *
 *       2026-10-17 实例：insights.html 本地已有 gd-header-logo-fit 补丁，
 *       线上文件恰好比本地少 1280 字符（正好是该补丁块），导致线上 390px 下
 *       LOGO 文字被裁 20px。其余 115 页线上都已同步。
 *
 * 判据：只比对"标记是否存在"，不比对全文，避免误报。
 *
 * 用法：
 *   node scripts/check-deployed-vs-local-2026-10-17.js
 *   BASE=https://www.gudong.app node scripts/check-deployed-vs-local-2026-10-17.js
 *   LIMIT=20 node scripts/check-deployed-vs-local-2026-10-17.js   # 只查前 20 页
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = (process.env.BASE || 'https://www.gudong.app').replace(/\/$/, '');
const LIMIT = Number(process.env.LIMIT || 0);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);

const SKIP_DIRS = new Set([
  '_backup_2026-10-14', '_backup_2026-10-16-pre-header', '_backup_2026-10-16-pre-logo-fit',
  '_backup_2026-10-16-pre-share-fix', 'airtable-script', 'node_modules', '.git', '.workbuddy',
  'prototypes', 'content', 'assets', 'docs', 'templates', 'scripts',
]);

// 每项：本地必须出现该标记，线上也必须出现 —— 否则说明线上是旧版
const REQUIRED = [
  { key: 'logoFit', marker: 'gd-header-logo-fit-2026-10-16', label: '窄屏 LOGO 补丁' },
  { key: 'mobHeader', marker: 'gd-mobile-header-fix-2026-10-16', label: '移动端 header 补丁' },
  { key: 'shareCss', marker: '.gd-share-btn svg {', label: '分享按钮 CSS' },
  { key: 'shareJs', marker: 'window.gdSharePage = function', label: '分享 JS' },
  { key: 'installCss', marker: '.gd-install-modal {', label: '安装弹窗 CSS' },
];

function isDraft(name) {
  // 根目录 _live-*.tmp.html 之类草稿、以及本脚本自建的临时抓取文件都不参与核对
  return name.startsWith('_') || /\.tmp(\.html)?$/i.test(name) || /^(cb|online)-/i.test(name);
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p).split(path.sep)[0];
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(rel) || e.name.startsWith('_') || e.name.startsWith('.')) continue;
      walk(p, out);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.html')) {
      if (isDraft(e.name)) continue;
      out.push(p);
    }
  }
  return out;
}

function onlinePath(rel) {
  // vercel.json 开启 cleanUrls：foo/bar.html -> /foo/bar，根 index.html -> /
  let p = '/' + rel.split(path.sep).join('/');
  p = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return p === '' ? '/' : p;
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) return { ok: false, status: res.status, text: '' };
  return { ok: true, status: res.status, text: await res.text() };
}

(async () => {
  console.log('BASE =', BASE);
  let files = walk(ROOT, []).filter((f) => {
    const s = fs.readFileSync(f, 'utf8');
    return s.includes('class="brand-text"'); // 只查带公共 header 的真实页面
  });
  files.sort();
  if (LIMIT) files = files.slice(0, LIMIT);
  console.log('待核对页面:', files.length, '\n');

  const problems = [];
  let done = 0;

  async function worker(queue) {
    while (queue.length) {
      const file = queue.shift();
      const rel = path.relative(ROOT, file);
      const local = fs.readFileSync(file, 'utf8');
      const url = BASE + onlinePath(rel);

      // 先看本地缺什么（本地缺 = 修复脚本没覆盖到，属更严重的问题）
      for (const r of REQUIRED) {
        if (!local.includes(r.marker)) {
          problems.push({ rel, kind: 'LOCAL-MISSING', what: r.label, detail: r.marker });
        }
      }

      let online;
      try {
        online = await fetchText(url);
      } catch (e) {
        problems.push({ rel, kind: 'FETCH-ERROR', what: '请求失败', detail: String(e.message).slice(0, 80) });
        done++;
        continue;
      }
      if (!online.ok) {
        problems.push({ rel, kind: 'HTTP-' + online.status, what: '线上不可达', detail: url });
        done++;
        continue;
      }

      const stale = [];
      for (const r of REQUIRED) {
        const inLocal = local.includes(r.marker);
        const inOnline = online.text.includes(r.marker);
        if (inLocal && !inOnline) stale.push(r.label);
      }
      if (stale.length) {
        problems.push({ rel, kind: 'ONLINE-STALE', what: stale.join(' / '), detail: url });
      }

      done++;
      if (done % 20 === 0) process.stdout.write(`  ...${done}/${files.length}\n`);
    }
  }

  const queue = files.slice();
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log('\n================ 结果 ================');
  if (!problems.length) {
    console.log('✅ 全部一致：本地有的组件，线上都有。');
    process.exit(0);
  }

  const byKind = new Map();
  for (const p of problems) {
    if (!byKind.has(p.kind)) byKind.set(p.kind, []);
    byKind.get(p.kind).push(p);
  }
  for (const [kind, list] of byKind) {
    console.log(`\n【${kind}】${list.length} 项`);
    for (const p of list) {
      console.log(`  - ${p.rel}`);
      console.log(`      ${p.what}`);
      if (kind === 'ONLINE-STALE') console.log(`      重新上传这个文件即可：${p.detail}`);
      else console.log(`      ${p.detail}`);
    }
  }

  const stale = problems.filter((p) => p.kind === 'ONLINE-STALE').map((p) => p.rel);
  if (stale.length) {
    console.log('\n================ 需要重新上传的文件 ================');
    for (const s of stale) console.log('  ' + s);
    console.log(`共 ${stale.length} 个。上传后重跑本脚本即可确认（应输出"全部一致"）。`);
  }
  console.log('\n提示：ONLINE-STALE 只是"线上文件旧"，本地是对的；补传对应文件即可。');
  console.log('      LOCAL-MISSING 才是本地真的缺组件，需要跑修复脚本。');
  process.exit(1);
})();
