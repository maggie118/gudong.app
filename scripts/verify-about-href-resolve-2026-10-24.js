// 全站：侧边栏 about 链接的相对路径是否能在文件系统上解析到真实文件
const fs = require('fs'), path = require('path');
const ROOT = process.cwd();
const EXCLUDE_DIRS = new Set(['airtable-script','node_modules','.git','.workbuddy','prototypes','scripts','templates','content','docs','.vercel','api']);
const EXCLUDE_FILES = new Set(['assets/images/lim-kw/item-lim-01.html','assets/brand/logo-preview.html','Untitled-5.html','google83a67404841a5314.html']);

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
let withSidebar = 0, resolved = 0;
const bad = [];

for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const html = fs.readFileSync(f, 'utf8');
  const navM = html.match(/<nav class="sidebar-nav"[^>]*>([\s\S]*?)<\/nav>/);
  if (!navM) continue;
  withSidebar++;
  const nav = navM[1];
  const m = nav.match(/<a[^>]+href="([^"]*about\.html[^"]*)"/i);
  if (!m) { bad.push({ rel, why: 'sidebar 内无 about 链接' }); continue; }
  const href = m[1].split('#')[0];
  const target = path.resolve(path.dirname(f), href);
  if (!fs.existsSync(target)) { bad.push({ rel, why: '路径解析失败: ' + href }); continue; }
  resolved++;
}

console.log('含侧边栏页面:', withSidebar);
console.log('about 链接可解析:', resolved);
console.log('异常:', bad.length);
bad.forEach(b => console.log('  ' + b.rel + ' -> ' + b.why));
