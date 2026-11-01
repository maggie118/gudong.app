// 核对本次待上传 8 个文件：线上是否已是本地这一版
// 判据：① 判别性标记（能区分修复前后） ② 线上正文与本地逐字节比对
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const BASE = (process.env.BASE || 'https://www.gudong.app').replace(/\/$/, '');

const FILES = [
  'tools/contract.html','tools/currency-convert.html','tools/era-lookup.html',
  'tools/ganzhi.html','tools/mark-lookup.html','tools/valuation.html','tools/year-since.html',
  'sw.js',
];
// 判别性标记：修复后才有，修复前一定没有
const GOOD = '<a href="../about.html" class="sidebar-link" onclick="closeSidebar()">';
// 裸 href（无论是否带 <a 前缀）都会命中这一串，再结合 GOOD 才能区分修复前后
const ANY_HREF = 'href="../about.html" class="sidebar-link"';

function onlinePath(rel) {
  let p = '/' + rel.split('/').join('/');
  p = p.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return p === '' ? '/' : p;
}
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');

(async () => {
  console.log('BASE =', BASE, '\n');
  for (const rel of FILES) {
    const local = fs.readFileSync(rel, 'utf8');
    const url = BASE + onlinePath(rel);
    let online = '';
    try {
      const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } });
      online = res.ok ? await res.text() : '';
      if (!res.ok) { console.log('HTTP ' + res.status + '  ' + rel); continue; }
    } catch (e) { console.log('FETCH-ERR ' + rel + ' :: ' + e.message); continue; }

    const same = md5(local) === md5(online);
    let verdict;
    if (rel === 'sw.js') {
      const lv = (local.match(/CACHE_NAME = '([^']+)'/) || [])[1];
      const ov = (online.match(/CACHE_NAME = '([^']+)'/) || [])[1];
      verdict = (lv === ov) ? 'OK  线上已是 v' + ov : 'STALE  线上=' + ov + '  本地=' + lv;
    } else {
      const g = online.includes(GOOD);
      const anyHref = online.includes(ANY_HREF);
      verdict = same ? 'OK  线上与本地逐字节相同'
        : g ? 'OK  修复标记已上线（内容还有别的差异）'
        : anyHref ? 'STALE  线上仍是坏版本（缺 <a>）' : 'DIFF  内容不同且未找到该标记';
    }
    console.log((same ? '[同] ' : '[异] ') + rel.padEnd(32) + verdict);
  }
})();
