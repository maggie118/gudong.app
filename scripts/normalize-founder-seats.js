// 把 items/*.html 里的「创始卖家」席号同步成 Airtable 的 founding_no
// 用法：node scripts/normalize-founder-seats.js [listings.json 路径] [--strip-unnumbered]
//   默认：只改写有 founding_no 的卖家；没号的页面保持原样（不擅自删徽章）
//   --strip-unnumbered：把没号卖家的徽章整段移除

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = process.argv.find((a) => a.endsWith('.json')) || path.join(ROOT, 'data', 'listings.json');
const STRIP = process.argv.includes('--strip-unnumbered');

function seatsFromSellers(sellers) {
  const seats = new Map();
  for (const s of sellers || []) {
    const sid = String((s && s.seller_id) || '').trim();
    const raw = String((s && s.founding_no) || '').trim();
    if (!sid || !raw) continue;
    const numeric = raw.replace(/[^0-9]/g, '');
    seats.set(sid, numeric ? numeric.padStart(3, '0') : raw);
  }
  return seats;
}

// 从徽章起点按 <span> 配平找到闭合位置并整段移除
function removeBadge(html) {
  const start = html.indexOf('<span class="founder-badge"');
  if (start < 0) return html;
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const open = html.indexOf('<span', i);
    const close = html.indexOf('</span>', i);
    if (close < 0) break;
    if (open !== -1 && open < close) { depth += 1; i = open + 5; }
    else {
      depth -= 1;
      i = close + 7;
      if (depth === 0) {
        let end = i;
        while (end < html.length && /[ \t\r\n]/.test(html[end])) end += 1;
        return html.slice(0, start) + html.slice(end);
      }
    }
  }
  return html;
}

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const seats = seatsFromSellers(data.sellers);
console.log('卖家 founding_no（来自 sellers 数据源）：');
if (!seats.size) console.log('  （全部为空，暂无席号）');
for (const [sid, seat] of seats) console.log(' ', seat, sid);

let changed = 0;
const removed = [];
const unnumbered = [];
for (const f of fs.readdirSync(path.join(ROOT, 'items')).filter((x) => x.endsWith('.html'))) {
  const file = path.join(ROOT, 'items', f);
  let html = fs.readFileSync(file, 'utf8');
  const sidRaw = (html.match(/id="sellerId">([^<]*)</) || [])[1];
  if (!sidRaw) continue;
  const sid = sidRaw.trim();
  const seat = seats.get(sid);
  const hasBadge = /<span class="badge-num">[^<]*<\/span>/.test(html);
  let next = html;
  if (seat) {
    if (hasBadge) next = html.replace(/(<span class="badge-num">)[^<]*(<\/span>)/, `$1${seat}$2`);
    else next = html; // 没徽章且现在有号 → 由 build-item-pages 生成器负责补，这里不动
  } else if (STRIP) {
    unnumbered.push(f + ' (' + sid + ')');
    if (html.includes('<span class="founder-badge"')) { next = removeBadge(html); removed.push(f); }
  }
  if (next !== html) { fs.writeFileSync(file, next, 'utf8'); changed += 1; }
}
console.log(`\n改了 ${changed} 个页面`);
if (removed.length) console.log('移除未编号徽章：' + removed.join(', '));
if (unnumbered.length) console.log('待你在 sellers 表填 founding_no：\n  ' + unnumbered.join('\n  '));
