// 勘察：全站 header CSS 规则变体（定位用，一次性）
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIR = /^(_backup_2026-10-14|airtable-script|node_modules|\.git|\.workbuddy|prototypes|scripts|templates|content|docs|\.vercel)$/;
const SKIP_FILE = new Set(['assets/images/lim-kw/item-lim-01.html', 'assets/brand/logo-preview.html', 'Untitled-5.html']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (SKIP_DIR.test(e.name)) continue; walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith('.html')) {
      const rel = path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join('/');
      if (!SKIP_FILE.has(rel)) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const files = walk(ROOT);
const variants = new Map();
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  // 抓取 `header {` 或 `header{` 开始到第一个 `}` 的块
  const re = /(^|\n)\s*header\s*\{/g;
  let m, found = [];
  while ((m = re.exec(html))) {
    const start = m.index + m[0].length - 1;
    let i = start, depth = 0;
    for (; i < html.length; i++) {
      if (html[i] === '{') depth++;
      else if (html[i] === '}') { depth--; if (depth === 0) break; }
    }
    found.push(html.slice(start, i + 1).replace(/\s+/g, ' ').trim());
  }
  const key = found.join(' || ') || '(无 header 规则)';
  if (!variants.has(key)) variants.set(key, []);
  variants.get(key).push(rel);
}
console.log('总文件数:', files.length, ' 变体数:', variants.size);
[...variants.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, v], i) => {
  console.log(`\n--- 变体 #${i + 1}  (${v.length} 页) ---`);
  console.log(k);
  console.log('样例:', v.slice(0, 4).join(', '));
});
