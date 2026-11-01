// 审计：侧边栏 nav 的锚点标签完整性 + about 链接存在性
// 用法: node scripts/audit-sidebar-about-2026-10-24.js [--fix]
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(['airtable-script','node_modules','.git','.workbuddy','prototypes','scripts','templates','content','docs','.vercel','api']);
const EXCLUDE_FILES = new Set(['assets/images/lim-kw/item-lim-01.html','assets/brand/logo-preview.html','Untitled-5.html']);
const FIX = process.argv.includes('--fix');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.')) continue;
    if (e.isDirectory()) { if (EXCLUDE_DIRS.has(e.name)) continue; walk(path.join(dir, e.name), out); }
    else if (e.isFile() && e.name.endsWith('.html')) {
      const rel = path.relative(ROOT, path.join(dir, e.name)).replace(/\\/g, '/');
      if (!EXCLUDE_FILES.has(rel)) out.push(path.join(dir, e.name));
    }
  }
  return out;
}
const files = walk(ROOT);
const issues = [];
const missingAbout = [];
let fixed = 0;

for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const html = fs.readFileSync(f, 'utf8');
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const lines = html.split(/\r?\n/);
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    // 行首就是 href=" 且整行以 </a> 结尾，且不是 <a 开头 -> 缺 <a 开标签
    if (/^\s*href="/.test(L) && /<\/a>\s*$/.test(L) && !/^\s*<a[\s>]/i.test(L)) {
      const indent = (L.match(/^\s*/) || [''])[0];
      issues.push({ rel, line: i + 1, text: L.trim().slice(0, 120) });
      if (FIX) { lines[i] = indent + '<a ' + L.trim(); changed = true; fixed++; }
    }
  }

  const hasAboutLink = /<a[^>]+href="[^"]*about\.html"/i.test(html);
  const hasAboutText = /关于我们|About Us/.test(html);
  if (!hasAboutLink) missingAbout.push({ rel, hasAboutText });

  if (changed) fs.writeFileSync(f, lines.join(eol));
}

console.log('扫描文件数:', files.length);
console.log('\n=== 缺 <a 开标签的孤立 href 行 ===');
if (!issues.length) console.log('  无');
else issues.forEach(x => console.log('  ' + x.rel + ' : L' + x.line + '\n     ' + x.text));
console.log('\n=== 页面里没有指向 about.html 的 <a> ===');
if (!missingAbout.length) console.log('  无');
else missingAbout.forEach(x => console.log('  ' + x.rel + '  (含About文案:' + x.hasAboutText + ')'));
console.log('\n修复行数:', fixed);
