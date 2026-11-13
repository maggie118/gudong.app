// scripts/finds-renew.js
// 私家藏馆「今日发现」续费计算器
//
// 用法：
//   node scripts/finds-renew.js Lim-KW          # 续 7 天（默认），只算日期不写入
//   node scripts/finds-renew.js Lim-KW 14       # 续 14 天
//   node scripts/finds-renew.js Lim-KW 7 --apply # 顺带写进 data/sellers.csv（仅仓库副本）
//
// 规则（与 refresh-listings.js 完全一致）：
//   · 开馆免费窗口 = gallery_started_at 起 7 天（含开通当天），到期自动退出，不用手动撤
//   · 卖家级续费 = sellers.finds_bonus_until（含当天），过期自动失效
//   · 续费起点 = max(今天, 现有续费到期日, 免费窗口结束日)，即不浪费已付天数、不倒退
//
// 打印出的日期就是你在 Google 表格 sellers 页签 finds_bonus_until 列要填的值。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FREE_DAYS = 7;
const DAY = 86400000;

const sellerArg = (process.argv[2] || '').trim();
const daysArg = Number(process.argv.find((a, i) => i >= 3 && /^\d+$/.test(a)) || 7);
const APPLY = process.argv.includes('--apply');

if (!sellerArg) {
  console.log('用法：node scripts/finds-renew.js <seller_id> [天数，默认 7] [--apply]');
  console.log('  例：node scripts/finds-renew.js Yap-JM 7');
  process.exit(1);
}

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const parse = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00Z') : null);
const addDays = (d, n) => iso(new Date(d.getTime() + n * DAY));

const listings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'listings.json'), 'utf8'));
const sellers = listings.sellers || [];
const seller = sellers.find((s) => String(s.seller_id || '').trim().toLowerCase() === sellerArg.toLowerCase());

if (!seller) {
  console.log(`找不到卖家 ${sellerArg}。现有 sellers：${sellers.map((s) => s.seller_id).join(', ')}`);
  process.exit(2);
}

const today = iso(Date.now());
const freeFrom = seller.gallery_started_at || '';
const freeUntil = freeFrom ? addDays(parse(freeFrom), FREE_DAYS) : '';
const paidUntil = seller.finds_bonus_until || '';

// 起点：已付到期日 > 免费窗口结束日 > 今天
const candidates = [today, paidUntil, freeUntil].filter(Boolean).sort();
const base = candidates[candidates.length - 1];
const newUntil = addDays(parse(base), daysArg);

console.log(`卖家：${seller.seller_id} ${seller.display_zh || seller.display_en || ''}`);
console.log(`  开馆日：${freeFrom || '（未填）'}   免费 7 天窗口：${freeFrom ? freeFrom + ' → ' + freeUntil + '（次日退出）' : '无'}`);
console.log(`  现有续费到期：${paidUntil || '（无）'}`);
console.log(`  续费 ${daysArg} 天，起点 ${base}（${!paidUntil || paidUntil < today ? (freeUntil && freeUntil > today ? '接免费窗口' : '从今天起算') : '接现有到期日'}）`);
console.log(`  → 在 sellers 表 finds_bonus_until 填：${newUntil}`);
if (!seller.gallery) console.log('  注意：该卖家 gallery 未打勾，续费不会生效（私馆未开通）。');

if (APPLY) {
  const csvPath = path.join(ROOT, 'data', 'sellers.csv');
  if (!fs.existsSync(csvPath)) {
    console.log('  --apply 跳过：仓库内没有 data/sellers.csv');
  } else {
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const header = lines[0].split(',');
    const col = header.indexOf('finds_bonus_until');
    const sidCol = header.indexOf('seller_id');
    if (col < 0) console.log('  --apply 跳过：data/sellers.csv 没有 finds_bonus_until 列');
    else {
      let changed = false;
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(',');
        if (String(cells[sidCol] || '').trim().toLowerCase() !== seller.seller_id.toLowerCase()) continue;
        while (cells.length < header.length) cells.push('');
        cells[col] = newUntil;
        lines[i] = cells.join(',');
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(csvPath, lines.join('\n'), 'utf8');
        console.log('  已写入 data/sellers.csv（仅仓库副本；线上以 Google 表格为准）');
      } else console.log('  --apply 跳过：CSV 里没有这个卖家');
    }
  }
}
