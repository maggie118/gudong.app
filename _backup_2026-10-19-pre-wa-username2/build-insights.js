#!/usr/bin/env node
/**
 * 古董圈 情报构建脚本
 * 用法：node build-insights.js
 *
 * 读取：content/insights.json + content/bodies/*.html
 * 输出：insights/*.html + data/insights.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CONTENT_FILE  = path.join(ROOT, 'content', 'insights.json');
const BODIES_DIR    = path.join(ROOT, 'content', 'bodies');
const TEMPLATE_FILE = path.join(ROOT, 'templates', 'article.html');
const OUT_DIR       = path.join(ROOT, 'insights');
const DATA_FILE     = path.join(ROOT, 'data', 'insights.json');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadArticles() {
  if (!fs.existsSync(CONTENT_FILE)) {
    console.error('❌ 找不到内容文件：', CONTENT_FILE);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  const list = Array.isArray(raw) ? raw : (raw.articles || []);
  return list.filter(a => {
    if (!a.slug) { console.warn('⚠ 跳过：缺 slug'); return false; }
    if (!a.title || !a.title.zh) { console.warn('⚠ 跳过（缺 title.zh）：', a.slug); return false; }
    return true;
  });
}

function loadBody(slug) {
  const f = path.join(BODIES_DIR, slug + '.html');
  if (!fs.existsSync(f)) {
    console.warn('⚠ 找不到正文：', f);
    return '<div class="zh"><p>（正文待补充）</p></div>';
  }
  return fs.readFileSync(f, 'utf8');
}

function pickRelated(current, all, count = 2) {
  let related = (current.related || [])
    .map(r => all.find(a => a.slug === r.slug))
    .filter(Boolean);

  if (related.length < count) {
    const used = new Set([current.slug, ...related.map(r => r.slug)]);
    for (const a of all) {
      if (related.length >= count) break;
      if (used.has(a.slug)) continue;
      related.push(a);
      used.add(a.slug);
    }
  }
  return related.slice(0, count);
}

function renderArticle(data, all) {
  const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
  const body = loadBody(data.slug);
  const related = pickRelated(data, all, 2);
  let html = template;

  const R = {
    TITLE_ZH: esc(data.title.zh),
    TITLE_EN: esc(data.title.en || data.title.zh),
    DESC_ZH:  esc(data.desc ? data.desc.zh : ''),
    DESC_EN:  esc(data.desc ? (data.desc.en || data.desc.zh) : ''),
    KEYWORDS: esc(data.keywords || ''),
    SLUG:     data.slug,
    DATE:     data.date || '',
    KICKER_ZH: esc(data.kicker ? data.kicker.zh : ''),
    KICKER_EN: esc(data.kicker ? data.kicker.en : ''),
    TONE:     data.tone || 'guide',
    MARK:     data.mark || '鉴',
    READ_ZH:  esc(data.read ? data.read.zh : ''),
    READ_EN:  esc(data.read ? data.read.en : ''),
    BODY:     body
  };

  for (const k of Object.keys(R)) {
    html = html.split('{{' + k + '}}').join(R[k]);
  }

  for (let i = 0; i < 2; i++) {
    const r = related[i];
    const P = 'RELATED_' + (i + 1) + '_';
    if (r) {
      html = html.split('{{' + P + 'SLUG}}').join(r.slug);
      html = html.split('{{' + P + 'KICKER_ZH}}').join(esc(r.kicker ? r.kicker.zh : ''));
      html = html.split('{{' + P + 'KICKER_EN}}').join(esc(r.kicker ? r.kicker.en : ''));
      html = html.split('{{' + P + 'TITLE_ZH}}').join(esc(r.title.zh));
      html = html.split('{{' + P + 'TITLE_EN}}').join(esc(r.title.en || r.title.zh));
    } else {
      ['SLUG','KICKER_ZH','KICKER_EN','TITLE_ZH','TITLE_EN'].forEach(k => {
        html = html.split('{{' + P + k + '}}').join(k === 'SLUG' ? '#' : '');
      });
    }
  }

  const rest = html.match(/\{\{[A-Z0-9_]+\}\}/g);
  if (rest) console.warn('⚠ ' + data.slug + ' 未替换占位符：', rest.join(', '));

  return html;
}

function buildMeta(a) {
  return {
    slug: a.slug,
    cat: a.cat || 'guide',
    tone: a.tone || 'guide',
    mark: a.mark || '鉴',
    kicker: a.kicker || { zh: '', en: '' },
    title: a.title,
    desc: a.desc || { zh: '', en: '' },
    tags: a.tags || a.keywords || '',
    date: a.date || '',
    read: a.read || { zh: '', en: '' },
    featured: !!a.featured
  };
}

function main() {
  console.log('🔨 构建古董圈情报页...\n');

  if (!fs.existsSync(TEMPLATE_FILE)) {
    console.error('❌ 找不到模板：', TEMPLATE_FILE);
    process.exit(1);
  }

  const all = loadArticles();
  if (!all.length) {
    console.error('❌ content/insights.json 里没有可用文章');
    process.exit(1);
  }

  ensureDir(OUT_DIR);
  ensureDir(path.dirname(DATA_FILE));

  let ok = 0;
  for (const a of all) {
    try {
      const html = renderArticle(a, all);
      fs.writeFileSync(path.join(OUT_DIR, a.slug + '.html'), html, 'utf8');
      console.log('  ✔ insights/' + a.slug + '.html');
      ok++;
    } catch (e) {
      console.error('  ✖ ' + a.slug + '：', e.message);
    }
  }

  const meta = all.map(buildMeta).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  fs.writeFileSync(DATA_FILE, JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    articles: meta
  }, null, 2), 'utf8');

  console.log('\n📄 data/insights.json  (' + meta.length + ' 篇)');
  console.log('\n✅ 完成：' + ok + ' 篇文章已生成\n');
}

main();