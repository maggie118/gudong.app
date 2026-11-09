// api/interest.js
// 藏品「收藏 / 关注」的汇总数字：GET /api/interest?seller=<seller_id>
// 鉴权同 /api/enquiries：藏家专属签名链接（Bearer <payload>.<hmac>，scope=seller_inbox）
// 只返回数字，不返回任何收藏者身份：{ seller_id, saves_30d, saves_total, tracked }
const { createHmac, timingSafeEqual } = require('node:crypto');

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_SAVES_TABLE || 'item_saves';
const SECRET = process.env.CHAT_REPLY_SECRET;
const DAY = 24 * 60 * 60 * 1000;

function respond(res, code, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  return res.status(code).json(data);
}
function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  return match ? match[1] : '';
}
function verify(token) {
  if (!token || token.length > 1200 || !SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', SECRET).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch (_) { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (data.scope !== 'seller_inbox') return null;
    if (!/^[a-z0-9-]{2,80}$/i.test(data.seller_id || '')) return null;
    if (!Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    return data;
  } catch (_) { return null; }
}
function fstr(value) { return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  const session = verify(bearer(req));
  if (!session) return respond(res, 401, { error: 'Seller inbox link is invalid or expired' });
  if (!BASE || !TOKEN) return respond(res, 200, { seller_id: session.seller_id, saves_30d: 0, saves_total: 0, tracked: false });

  const sellerId = session.seller_id;
  try {
    const url = new URL('https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(TABLE));
    url.searchParams.set('filterByFormula', 'AND({seller}=' + fstr(sellerId) + ",{Status}='active')");
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('fields[0]', 'anon');
    url.searchParams.set('fields[1]', 'created_at');
    const response = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!response.ok) throw new Error('airtable ' + response.status);
    const json = await response.json();
    const cutoff = Date.now() - 30 * DAY;
    const all = new Set();
    const recent = new Set();
    (json.records || []).forEach((record) => {
      const f = record.fields || {};
      const who = f.anon || record.id;
      all.add(who);
      const at = Date.parse(f.created_at || record.createdTime || '');
      if (Number.isFinite(at) && at >= cutoff) recent.add(who);
    });
    return respond(res, 200, {
      seller_id: sellerId,
      saves_30d: recent.size,
      saves_total: all.size,
      tracked: true
    });
  } catch (_) {
    // 表还没建或额度受限时安静降级：不给藏家看空数字
    return respond(res, 200, { seller_id: sellerId, saves_30d: 0, saves_total: 0, tracked: false });
  }
};
