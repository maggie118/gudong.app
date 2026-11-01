// 全站锚点开闭标签配平检查（<a> vs </a>），用于发现「缺开标签」类破坏
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();
const EX = new Set(['airtable-script','node_modules','.git','.workbuddy','prototypes','scripts','templates','content','docs','.vercel','api']);
const EXF = new Set(['assets/images/lim-kw/item-lim-01.html','assets/brand/logo-preview.html','Untitled-5.html']);

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    if (e.isDirectory()) { if (EX.has(e.name)) continue; walk(path.join(d, e.name), o); }
    else if (e.isFile() && e.name.endsWith('.html')) {
      const r = path.relative(ROOT, path.join(d, e.name)).replace(/\\/g, '/');
      if (!EXF.has(r)) o.push([path.join(d, e.name), r]);
    }
  }
  return o;
}

let bad = 0, total = 0;
for (const [f, rel] of walk(ROOT)) {
  total++;
  const h = fs.readFileSync(f, 'utf8');
  // 注意：闭合标签可能是 </a >（带空格，合法 HTML），正则必须容忍空白
  const open = (h.match(/<a[\s>]/gi) || []).length;
  const close = (h.match(/<\/a\s*>/gi) || []).length;
  if (open !== close) { bad++; console.log('  ' + rel + ' : <a>=' + open + '  </a>=' + close); }
}
console.log('扫描页面:', total);
console.log('锚点标签不平衡的页面数:', bad);
