#!/usr/bin/env node
// scripts/quarterly-snapshot.js
// ------------------------------------------------------------------
// 季度「买家数据快照」导出：把 D1 里的匿名汇总数字落成一份可归档、可给投资方看的文件。
// 输出（写在 data/snapshots/ 下）：
//   <季度>-buyer-data.json   原始汇总（便于二次分析）
//   <季度>-buyer-data.csv    精简数据表（Excel 可直接开）
//   <季度>-buyer-data.md     人读版摘要（内部复盘 / 融资尽调用）
//
// 口径红线：全部为聚合数字，不含任何买家姓名、邮箱、号码或 buyer_key 名单。
// 「询价 / 咨询」只代表买家点了 WhatsApp，成交发生在站外，平台看不到。
//
// 用法（项目根目录）：
//   node scripts/quarterly-snapshot.js --quarter 2026-Q4
//   node scripts/quarterly-snapshot.js --from 2026-10-01 --to 2026-12-31
//   node scripts/quarterly-snapshot.js --quarter 2026-Q4 --input raw.json   # 用已抓好的 JSON 重新出报告
//
// 依赖：GUDONG_DATA_URL + GUDONG_DATA_KEY（Vercel 生产环境变量；本地可用 vercel env 注入）
// ------------------------------------------------------------------
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'snapshots');
const BASE = (process.env.GUDONG_DATA_URL || 'https://gudong-data-api.minqi118.workers.dev').replace(/\/+$/, '');
const KEY = process.env.GUDONG_DATA_KEY || '';

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? String(process.argv[i + 1] || '') : '';
}

function quarterWindow(q) {
  const m = /^(\d{4})-Q([1-4])$/.exec(q || '');
  if (!m) return null;
  const year = Number(m[1]);
  const startMonth = (Number(m[2]) - 1) * 3 + 1;
  const pad = (n) => String(n).padStart(2, '0');
  const from = `${year}-${pad(startMonth)}-01`;
  const endMonth = startMonth + 2;
  const daysInEnd = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const to = `${year}-${pad(endMonth)}-${pad(daysInEnd)}`;
  return { from, to, label: q };
}

function currentQuarter() {
  const d = new Date();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

async function fetchSnapshot(from, to) {
  if (!KEY) throw new Error('缺少 GUDONG_DATA_KEY（生产环境变量）');
  const url = `${BASE}/snapshot?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { 'x-gudong-key': KEY } });
  const text = await res.text();
  if (!res.ok) throw new Error(`snapshot ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function n(v) { return Number(v || 0).toLocaleString('en-SG'); }

function pct(part, whole) {
  if (!whole) return '—';
  return (Math.round((Number(part || 0) / Number(whole)) * 1000) / 10) + '%';
}

function md(snap, label) {
  const b = snap.buyers, f = snap.favorites, fo = snap.follows, i = snap.inquiries, c = snap.clicks;
  const sellerRows = snap.per_seller || [];
  const totalBuyerish = Math.max(b.total, f.unique_buyers, i.unique_buyers, fo.unique_buyers);
  const lines = [];
  lines.push(`# ${label} 买家数据快照`);
  lines.push('');
  lines.push(`统计窗口：${snap.window.from} → ${snap.window.to}（UTC）  `);
  lines.push(`导出时间：${new Date(snap.generated_at).toISOString().slice(0, 19).replace('T', ' ')} UTC  `);
  lines.push('数据源：Cloudflare D1（buyers / favorites / follows / inquiries / inquiry_clicks），全部为匿名聚合。');
  lines.push('');
  lines.push('## 一句话结论');
  lines.push('');
  lines.push(`本季度新增可识别买家 **${n(b.total)}** 位（去重邮箱 ${n(b.unique_emails)} 个，其中明确同意联系 ${n(b.consented)} 位）；` +
    `产生收藏 **${n(f.total)}** 次（${n(f.unique_buyers)} 位买家、覆盖 ${n(f.sellers)} 家藏馆）、关注 **${n(fo.total)}** 次、` +
    `询价 **${n(i.total)}** 次（${n(i.unique_buyers)} 位买家）、WhatsApp 点击 **${n(c.total)}** 次。`);
  lines.push('');
  lines.push('## 核心指标');
  lines.push('');
  lines.push('| 指标 | 数值 | 口径说明 |');
  lines.push('|---|---|---|');
  lines.push(`| 新增买家 | ${n(b.total)} | 本窗口内首次出现并写入 buyers 的身份数 |`);
  lines.push(`| 去重邮箱 | ${n(b.unique_emails)} | 同一邮箱多次登录只算一次 |`);
  lines.push(`| 明示同意联系 | ${n(b.consented)} | 留过邮箱并勾选同意 |`);
  lines.push(`| 收藏次数 | ${n(f.total)} | 藏品页心形收藏 |`);
  lines.push(`| 收藏买家 | ${n(f.unique_buyers)} | 有过收藏的独立身份 |`);
  lines.push(`| 关注次数 | ${n(fo.total)} | 关注藏馆 / 品类 |`);
  lines.push(`| 询价次数 | ${n(i.total)} | 买家留下邮箱或号码的询价 |`);
  lines.push(`| WhatsApp 点击 | ${n(c.total)} | 点击即计数；匿名点击 ${n(c.anonymous)} 次 |`);
  lines.push(`| 最宽口径活跃买家 | ${n(totalBuyerish)} | 上面四个独立买家数的最大值，非相加 |`);
  lines.push('');
  lines.push('## 分月走势');
  lines.push('');
  const months = Array.from(new Set([]
    .concat((b.by_month || []).map((r) => r.month))
    .concat((f.by_month || []).map((r) => r.month))
    .concat((c.by_month || []).map((r) => r.month))
    .filter(Boolean))).sort();
  if (months.length) {
    const pick = (arr, m) => n((arr || []).find((r) => r.month === m) && (arr || []).find((r) => r.month === m).n);
    lines.push('| 月份 | 新增买家 | 收藏 | WhatsApp 点击 |');
    lines.push('|---|---|---|---|');
    months.forEach((m) => lines.push(`| ${m} | ${pick(b.by_month, m)} | ${pick(f.by_month, m)} | ${pick(c.by_month, m)} |`));
    lines.push('');
  }
  if ((b.by_source || []).length) {
    lines.push('## 买家来源');
    lines.push('');
    lines.push('| 来源 | 人数 | 占比 |');
    lines.push('|---|---|---|');
    b.by_source.forEach((r) => lines.push(`| ${r.source || 'unknown'} | ${n(r.n)} | ${pct(r.n, b.total)} |`));
    lines.push('');
  }
  if ((i.by_contact_type || []).length || (i.by_channel || []).length) {
    lines.push('## 询价结构');
    lines.push('');
    lines.push('| 维度 | 取值 | 次数 | 占比 |');
    lines.push('|---|---|---|---|');
    (i.by_contact_type || []).forEach((r) => lines.push(`| 联系方式 | ${r.contact_type} | ${n(r.n)} | ${pct(r.n, i.total)} |`));
    (i.by_channel || []).forEach((r) => lines.push(`| 渠道 | ${r.channel} | ${n(r.n)} | ${pct(r.n, i.total)} |`));
    (i.by_status || []).forEach((r) => lines.push(`| 处理状态 | ${r.status} | ${n(r.n)} | ${pct(r.n, i.total)} |`));
    lines.push('');
  }
  if (sellerRows.length) {
    lines.push('## 各藏馆本季度表现');
    lines.push('');
    lines.push('| 藏馆 | 收藏次数 | 收藏买家 |');
    lines.push('|---|---|---|');
    sellerRows.forEach((r) => lines.push(`| ${r.seller_id} | ${n(r.saves)} | ${n(r.savers)} |`));
    lines.push('');
  }
  lines.push('## 口径与限制（对外引用时请一并带上）');
  lines.push('');
  lines.push('1. 「询价 / WhatsApp 点击」不等于成交。成交在 WhatsApp 私聊与线下完成，平台看不到，也不能反推成交额。');
  lines.push('2. 所有数字均为匿名聚合；本文件不含任何买家姓名、邮箱、号码或身份标识，符合隐私政策与 PDPA 最小化原则。');
  lines.push('3. 同一买家可能在多家藏馆各自计一次「收藏买家」，跨藏馆不可直接相加去重。');
  lines.push('4. 新站数据从 2026-11 开始积累，早期窗口偏小属正常，看趋势不看绝对值。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_本文件由 `scripts/quarterly-snapshot.js` 生成，可随时重跑刷新。_');
  return lines.join('\n');
}

function csv(snap) {
  const rows = [['section', 'metric', 'value']];
  const b = snap.buyers, f = snap.favorites, fo = snap.follows, i = snap.inquiries, c = snap.clicks;
  rows.push(['window', 'from', snap.window.from]);
  rows.push(['window', 'to', snap.window.to]);
  rows.push(['buyers', 'total', b.total]);
  rows.push(['buyers', 'unique_emails', b.unique_emails]);
  rows.push(['buyers', 'consented', b.consented]);
  (b.by_source || []).forEach((r) => rows.push(['buyers_by_source', r.source || 'unknown', r.n]));
  (b.by_month || []).forEach((r) => rows.push(['buyers_by_month', r.month, r.n]));
  rows.push(['favorites', 'total', f.total]);
  rows.push(['favorites', 'unique_buyers', f.unique_buyers]);
  (f.by_month || []).forEach((r) => rows.push(['favorites_by_month', r.month, r.n]));
  rows.push(['follows', 'total', fo.total]);
  rows.push(['follows', 'unique_buyers', fo.unique_buyers]);
  (fo.by_kind || []).forEach((r) => rows.push(['follows_by_kind', r.kind, r.n]));
  rows.push(['inquiries', 'total', i.total]);
  rows.push(['inquiries', 'unique_buyers', i.unique_buyers]);
  (i.by_contact_type || []).forEach((r) => rows.push(['inquiries_by_contact_type', r.contact_type, r.n]));
  (i.by_status || []).forEach((r) => rows.push(['inquiries_by_status', r.status, r.n]));
  rows.push(['clicks', 'total', c.total]);
  rows.push(['clicks', 'anonymous', c.anonymous]);
  (c.by_month || []).forEach((r) => rows.push(['clicks_by_month', r.month, r.n]));
  (snap.per_seller || []).forEach((r) => {
    rows.push(['per_seller_saves', r.seller_id, r.saves]);
    rows.push(['per_seller_savers', r.seller_id, r.savers]);
  });
  return rows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v)).join(',')).join('\n') + '\n';
}

async function main() {
  const quarter = arg('quarter') || currentQuarter();
  const window = quarterWindow(quarter) || { from: arg('from'), to: arg('to'), label: quarter };
  if (!window.from || !window.to) {
    console.error('用法：node scripts/quarterly-snapshot.js --quarter 2026-Q4  或  --from 2026-10-01 --to 2026-12-31');
    process.exit(1);
  }
  const label = window.label || `${window.from}_${window.to}`;

  let snap;
  const inputFile = arg('input');
  if (inputFile) {
    snap = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf8'));
  } else {
    snap = await fetchSnapshot(window.from, window.to);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const base = path.join(OUT_DIR, label + '-buyer-data');
  fs.writeFileSync(base + '.json', JSON.stringify(snap, null, 2) + '\n', 'utf8');
  fs.writeFileSync(base + '.md', md(snap, label) + '\n', 'utf8');
  fs.writeFileSync(base + '.csv', csv(snap), 'utf8');
  console.log('已生成：');
  ['json', 'md', 'csv'].forEach((ext) => console.log('  ' + base + '.' + ext));
  const b = snap.buyers, i = snap.inquiries, c = snap.clicks;
  console.log(`窗口 ${snap.window.from} → ${snap.window.to}：买家 ${b.total}｜收藏 ${snap.favorites.total}｜询价 ${i.total}｜点击 ${c.total}`);
}

main().catch((e) => { console.error('失败：' + (e && e.message || e)); process.exit(1); });
