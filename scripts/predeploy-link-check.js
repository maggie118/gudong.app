/**
 * 上线前断链检查：校验所有 HTML 里的内部链接与资源引用是否真实存在。
 * 只读，不修改。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 上线排除目录：这些页面不部署，检查时跳过其出链
const EXCLUDE_DIRS = new Set([
  'airtable-script', 'node_modules', '.git', '.workbuddy',
  'prototypes', 'scripts', 'templates', 'content', 'docs', '.vercel',
]);

// 明确的「不上线」文件（虽在HTML 目录树内，但无入链/为个人草稿）
const EXCLUDE_FILES = [
  'assets/images/lim-kw/item-lim-01.html', // 旧版游离文件（正式版在 items/）
  'assets/brand/logo-preview.html',        // logo 设计预览页，无入链
  'Untitled-5.html',                       // pricing.html 的编辑器草稿副本
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name) || /^_/.test(e.name)) continue; // 跳过 _backup*/_drafts* 等非部署目录
      walk(path.join(dir, e.name), out);
    } else if (e.name.endsWith('.html')) {
      const rel = path.relative(ROOT, path.join(dir, e.name)).replace(/\\/g, '/');
      if (!EXCLUDE_FILES.includes(rel)) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const files = walk(ROOT);

// 提取 href / src
function extract(html) {
  const out = [];
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

// 无需检查的协议/锚点
function skip(url) {
  return (
    !url ||
    url.startsWith('#') ||
    url.startsWith('javascript:') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('data:') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('//') ||
    url.includes('${') || // JS 模板字符串拼接出来的动态 URL
    url.includes('{{') || // 构建占位符
    url.includes('+')      // 字符串拼接片段
  );
}

const broken = [];
const byType = { page: 0, asset: 0, other: 0 };
let checked = 0;

for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const dir = path.dirname(f);

  for (const url of extract(html)) {
    if (skip(url)) continue;
    // 去掉 query 与 hash
    const clean = url.split('#')[0].split('?')[0];
    if (!clean) continue;

    let target;
    if (clean.startsWith('/')) {
      // 根路径
      target = path.join(ROOT, clean.replace(/^\//, ''));
    } else {
      target = path.resolve(dir, clean);
    }

    checked++;

    if (fs.existsSync(target)) {
      // 目标是目录 → 找 index.html
      if (fs.statSync(target).isDirectory()) {
        if (!fs.existsSync(path.join(target, 'index.html'))) {
          broken.push({ from: rel, url, reason: '目录缺 index.html' });
        }
      }
      continue;
    }

    // 缺扩展名 → cleanUrls 模式（vercel.json cleanUrls: true）
    if (!path.extname(target)) {
      const asHtml = target + '.html';
      const asDir = path.join(target, 'index.html');
      if (fs.existsSync(asHtml) || fs.existsSync(asDir)) continue;
      // 旧式无扩展名链接
      broken.push({ from: rel, url, reason: '目标不存在（cleanUrls 亦未命中）' });
      continue;
    }

    byType.asset++;
    broken.push({ from: rel, url, reason: '资源文件不存在' });
  }
}

// 分类统计
const pageBroken = broken.filter((b) => /\.html?$/i.test(b.url) || !path.extname(b.url.split('#')[0]));
const assetBroken = broken.filter((b) => !pageBroken.includes(b));

console.log(`扫描 ${files.length} 个上线页面，校验 ${checked} 条内部链接/资源引用\n`);

if (!broken.length) {
  console.log('✓ 未发现断链或资源缺失');
} else {
  console.log(`✗ 发现 ${broken.length} 个问题：\n`);
  console.log(`--- 页面链接问题（${pageBroken.length}）---`);
  pageBroken.forEach((b) => console.log(`  ${b.from}\n    → ${b.url}\n      ${b.reason}`));
  if (assetBroken.length) {
    console.log(`\n--- 资源缺失（${assetBroken.length}）---`);
    assetBroken.forEach((b) => console.log(`  ${b.from}\n    → ${b.url}\n      ${b.reason}`));
  }
}

// 反向检查：assets 目录里的图片是否都被引用（找出孤儿资源）
console.log('\n--- 孤儿资源检查 ---');
const allHtml = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const assetDir = path.join(ROOT, 'assets');
const orphans = [];
function walkAssets(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walkAssets(p); continue; }
    if (!/\.(png|jpg|jpeg|webp|svg|ico|css|js)$/i.test(e.name)) continue;
    const rel = 'assets/' + path.relative(assetDir, p).replace(/\\/g, '/');
    if (!allHtml.includes(rel)) orphans.push(rel);
  }
}
if (fs.existsSync(assetDir)) walkAssets(assetDir);
if (orphans.length) {
  orphans.forEach((o) => console.log(`  未被任何页面引用：${o}`));
} else {
  console.log('  ✓ 无孤儿资源');
}

process.exit(broken.length ? 1 : 0);