/** 上线前 sitemap 收录完整性检查（只读） */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const sm = fs.readFileSync('sitemap.xml', 'utf8');

const EXCLUDE_DIRS = new Set([
  'airtable-script', 'node_modules', '.git', '.workbuddy',
  'prototypes', 'scripts', 'templates', 'content', 'docs', '.vercel',
]);
const EXCLUDE_FILES = new Set([
  'assets/images/lim-kw/item-lim-01.html',
  'assets/brand/logo-preview.html',
  'Untitled-5.html',
  // noindex 功能页，不应进 sitemap
  'seller-inbox.html',
  'seller-reply.html',
  // 未上线工具页，暂不收录（上线后从 sitemap 与此处同时恢复）
  'tools/era-lookup.html',
]);

const pages = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name) || /^_/.test(e.name)) continue; // 跳过 _backup*/_drafts* 等非部署目录
      walk(p);
    } else if (e.name.endsWith('.html')) {
      const rel = path.relative(ROOT, p).split(path.sep).join('/');
      if (!EXCLUDE_FILES.has(rel)) pages.push('/' + rel);
    }
  }
})(ROOT);

/* sitemap 实际格式：https://www.gudong.app/about（www + 无扩展名；目录首页 /tools/）
 * 归一化后再匹配，同时兼容非 www / 带 .html 的旧格式 */
function toSitemapPath(p) {
  if (p === '/index.html') return '/';
  return p.replace(/\.html$/, '').replace(/\/index$/, '/');
}

const missing = pages.filter((p) => {
  const np = toSitemapPath(p);
  return !sm.includes('https://www.gudong.app' + np) && !sm.includes('https://gudong.app' + np);
});

console.log('应上线 HTML 页数：', pages.length);
if (missing.length) {
  console.log(`\n未收录进 sitemap（${missing.length}）：`);
  missing.forEach((m) => console.log('  ' + m));
  process.exitCode = 1;
} else {
  console.log('✓ 全部已收录进 sitemap');
}

// sitemap 条目数 vs 实际上线数
const locCount = (sm.match(/<loc>/g) || []).length;
console.log(`\nsitemap 条目：${locCount} 条 / 实际应上线：${pages.length} 个页面`);
if (locCount < pages.length) {
  console.log('⚠ sitemap 条目少于实际上线页面数，请确认是否有遗漏');
}
