#!/usr/bin/env node
/**
 * 生成首页「收藏知识」用的文章索引：data/insights-index.json
 *
 * 数据源：insights.html 里内联的 `const SERIES = [...]`（站点唯一的文章总索引，70 篇 10 系列）。
 * 每天/每次 Vercel build 都会重跑，所以新文章只要进了 insights.html 的 SERIES，首页「最新 4 篇」自动跟着变。
 *
 * 约定：
 * - 失败不阻断构建（与 refresh-listings.js 一致的容错策略），已存在的旧索引保留；
 * - 输出仅含首页卡片需要的字段，体积小、无正文。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'insights.html');
const OUT = path.join(ROOT, 'data', 'insights-index.json');

function log(...a) { console.log('[insights-index]', ...a); }

/** 从 insights.html 中截取 SERIES 数组字面量（按方括号配对，跳过字符串内的括号） */
function extractSeriesLiteral(src) {
  const anchor = src.indexOf('const SERIES');
  if (anchor < 0) throw new Error('未找到 const SERIES 声明');
  const start = src.indexOf('[', anchor);
  if (start < 0) throw new Error('未找到 SERIES 数组起始');

  let depth = 0, i = start, quote = null, esc = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('SERIES 数组未闭合');
}

function main() {
  if (!fs.existsSync(SRC)) {
    log('insights.html 不存在，跳过（保留旧索引）');
    return;
  }
  const html = fs.readFileSync(SRC, 'utf8');
  const literal = extractSeriesLiteral(html);

  // 字面量是本站自有内容，等同纯数据；用 Function 求值避免误判为代码执行入口
  let series;
  try {
    series = new Function('return (' + literal + ');')();
  } catch (e) {
    log('SERIES 解析失败：' + e.message + '，保留旧索引');
    return;
  }
  if (!Array.isArray(series) || !series.length) {
    log('SERIES 为空，保留旧索引');
    return;
  }

  const articles = [];
  for (const s of series) {
    const list = Array.isArray(s.articles) ? s.articles : [];
    for (const a of list) {
      if (!a || !a.slug) continue;
      articles.push({
        slug: a.slug,
        kicker: { zh: (a.kicker && a.kicker.zh) || '', en: (a.kicker && a.kicker.en) || '' },
        title: { zh: (a.title && a.title.zh) || '', en: (a.title && a.title.en) || '' },
        desc: { zh: (a.desc && a.desc.zh) || '', en: (a.desc && a.desc.en) || '' },
        date: a.date || '',
        read: { zh: (a.read && a.read.zh) || '', en: (a.read && a.read.en) || '' },
        mark: a.mark || '',
        tone: a.tone || '',
        series: { zh: (s.name && s.name.zh) || '', en: (s.name && s.name.en) || '' },
      });
    }
  }

  // 按发布日期倒序（同日按 slug 稳定排序，避免每次构建抖动）
  articles.sort(function (a, b) {
    const d = String(b.date).localeCompare(String(a.date));
    return d !== 0 ? d : String(a.slug).localeCompare(String(b.slug));
  });

  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    count: articles.length,
    latest: articles.slice(0, 4).map(function (a) { return a.slug; }),
    articles: articles,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  log('已生成 ' + path.relative(ROOT, OUT) + '：' + articles.length + ' 篇，最新 4 篇 = ' + payload.latest.join(', '));
}

main();
