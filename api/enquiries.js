// api/enquiries.js
// 藏家端「询价收件箱」数据接口：GET /api/enquiries
// 鉴权：与 /api/seller-inbox 同一套签名链接（Bearer <payload>.<hmac>，scope=seller_inbox）
// 数据源：Airtable 表 buyer_leads（按 {seller} 过滤），只读
// 返回：{ seller_id, enquiries: [{ id, name, contact, contact_type, intent, item_id, item_title,
//                                 page, source, created_at, status, follows }] }
const { createHmac, timingSafeEqual } = require('node:crypto');

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.BUYER_LEADS_TABLE || 'buyer_leads';
const SECRET = process.env.CHAT_REPLY_SECRET;

function respond(res, code, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(data);
}
function fstr(value) { return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
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
async function airtable(url) {
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
  if (!response.ok) throw new Error('Airtable request failed (' + response.status + ')');
  return response.json();
}
function normalize(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    name: f.name || '',
    contact: f.contact || '',
    contact_type: f.contact_type || '',
    intent: f.intent || '',
    item_id: f.item_id || '',
    item_title: f.item_title || '',
    page: f.page || '',
    source: f.source || '',
    follows: f.follows || '',
    status: f.status || '',
    created_at: f.created_at || record.createdTime || ''
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!BASE || !TOKEN || !SECRET || Buffer.byteLength(SECRET) < 32) {
    return respond(res, 503, { error: 'Enquiry inbox is not configured' });
  }
  const session = verify(bearer(req));
  if (!session) return respond(res, 401, { error: 'Seller inbox link is invalid or expired' });
  const sellerId = session.seller_id;

  try {
    const params = new URLSearchParams();
    params.set('filterByFormula', '{seller}=' + fstr(sellerId));
    params.set('pageSize', '100');
    params.set('sort[0][field]', 'created_at');
    params.set('sort[0][direction]', 'desc');
    const result = await airtable('https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(TABLE) + '?' + params.toString());
    const enquiries = (result.records || []).map(normalize);
    return respond(res, 200, { seller_id: sellerId, enquiries });
  } catch (_) {
    return respond(res, 503, { error: 'Could not load enquiries' });
  }
};
