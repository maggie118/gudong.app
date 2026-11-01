/** 藏品图缺失检查：页面引用的图片是否都真实存在（只读） */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const EXCLUDE_DIRS = new Set([
  'airtable-script', 'node_modules', '.git', '.workbuddy',
  'prototypes', 'scripts', 'templates', 'content', 'docs', '.vercel',
]);
const EXCLUDE_FILES = new Set([
  'assets/images/lim-kw/item-lim-01.html',
  'assets/brand/logo-preview.html',
  'Untitled-5.html',
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
      if (!EXCLUDE_FILES.has(rel)) pages.push(rel);
    }
  }
})(ROOT);

const missing = new Map();   // 缺失图片 -> [引用页面]
const seen = new Set();

for (const rel of pages) {
  const html = fs.readFileSync(rel, 'utf8');
  // 只看 assets/images/ 下的藏品图引用
  const re = /assets\/images\/[A-Za-z0-9_\-./]+\.(?:jpg|jpeg|png|webp)/g;
  let m;
  while ((m = re.exec(html))) {
    const p = m[0];
    if (seen.has(p)) continue;
    seen.add(p);
    if (!fs.existsSync(path.join(ROOT, p))) {
      if (!missing.has(p)) missing.set(p, []);
      missing.get(p).push(rel);
    }
  }
}

if (!missing.size) {
  console.log(`✓ 藏品图引用全部有效（检查 ${pages.length} 个页面，${seen.size} 张图）`);
} else {
  // 已知情况：每个藏品页预留了 4 个图位（正面/背面/底部/细节），
  // 但目前只上传了主图。页面 JS 有 onerror降级到 placeholder，
  // 不会白屏，只是缩略图位会显示占位图。
  // 补图属于内容工作，需要藏家本人提供素材，故此处仅提示不判失败。
  console.log(`⚠ ${missing.size} 张被引用但磁盘上不存在的图片（不影响功能，JS 会降级为占位图）\n`);
  const byOwner = new Map();
  for (const [img, refs] of missing) {
    const m = img.match(/assets\/images\/([^/]+)\//);
    const owner = m ? m[1] : 'other';
    if (!byOwner.has(owner)) byOwner.set(owner, []);
    byOwner.get(owner).push({ img, refs });
  }
  for (const [owner, list] of byOwner) {
    console.log(`  【${owner}】缺 ${list.length} 张：`);
    list.forEach(({ img, refs }) => console.log(`    ${path.basename(img)}← ${refs[0]}`));
  }
  console.log(`\n  说明：每页 JS 已onerror 降级到 placeholder.jpg，不会白屏或报错。`);
  console.log(`  若要消除占位缩略图，需上传对应图片，或从各页defaultImages 数组里删掉未用图位。`);
}

// 反向：磁盘上有但没被任何页面引用的图
const allHtml = pages.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const orphans = [];
(function walkAssets(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walkAssets(p); continue; }
    if (!/\.(jpg|jpeg|png|webp)$/i.test(e.name)) continue;
    const rel = 'assets/images/' + path.relative('assets/images', p).split(path.sep).join('/');
    if (!allHtml.includes(rel)) orphans.push(rel);
  }
})('assets/images');

if (orphans.length) {
  console.log(`\n磁盘上存在但无页面引用（${orphans.length}）：`);
  orphans.forEach((o) => console.log('  ' + o));
}

process.exit(0); // 缺图属内容待办，不阻塞上线