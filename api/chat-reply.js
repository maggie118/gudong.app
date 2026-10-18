import { createHmac, timingSafeEqual } from 'node:crypto';
// Seller reply panel endpoint. Access is granted by a short-lived signed bearer link; no account login is required.
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.CHAT_AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_CHAT_TABLE;
const SECRET = process.env.CHAT_REPLY_SECRET;
function respond(res, code, data) { res.setHeader('Cache-Control', 'no-store, private'); res.setHeader('X-Content-Type-Options', 'nosniff'); return res.status(code).json(data); }
function baseUrl() { return 'https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(TABLE); }
function fstr(value) { return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
async function airtable(url, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({ Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, opts.headers || {});
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('Airtable request failed');
  return r.json();
}
function verify(token) {
  if (typeof token !== 'string' || token.length > 1200 || !SECRET) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = createHmac('sha256', SECRET).update(parts[0]).digest();
  let actual;
  try { actual = Buffer.from(parts[1], 'base64url'); } catch (_) { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (!data.seller_id || !data.buyer_tmp_id || !data.item_id || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    return data;
  } catch (_) { return null; }
}
function normalize(record) {
  const f = record.fields || {};
  return { id: record.id, client_id: f.client_id || '', sender_type: f.sender_type || 'buyer', content: f.content || '', created_at: f.created_at || record.createdTime, buyer_label: f.buyer_label || '', item_title: f.item_title || '', item_id: f.item_id || '', seller_id: f.seller_id || '', is_read_by_seller: f.is_read_by_seller === true };
}
async function readConversation(data) {
  const params = new URLSearchParams();
  params.set('filterByFormula', 'AND({item_id}=' + fstr(data.item_id) + ',{seller_id}=' + fstr(data.seller_id) + ',{buyer_tmp_id}=' + fstr(data.buyer_tmp_id) + ')');
  params.set('maxRecords', '100'); params.set('sort[0][field]', 'created_at'); params.set('sort[0][direction]', 'desc');
  const result = await airtable(baseUrl() + '?' + params.toString());
  return result.records || [];
}
async function markRead(records) {
  const unread = records.filter(function (r) { return r.fields.sender_type === 'buyer' && r.fields.is_read_by_seller !== true; });
  for (let i = 0; i < unread.length; i += 10) {
    await airtable(baseUrl(), { method: 'PATCH', body: JSON.stringify({ records: unread.slice(i, i + 10).map(function (r) { return { id: r.id, fields: { is_read_by_seller: true } }; }) }) });
  }
}
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return respond(res, 405, { error: 'Method not allowed' }); }
  if (!BASE || !TOKEN || !TABLE || !SECRET || Buffer.byteLength(SECRET) < 32) return respond(res, 503, { error: 'Reply service is not configured' });
  const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const session = verify(input.token);
  if (!session) return respond(res, 401, { error: 'Reply link is invalid or expired' });
  try {
    if (req.method === 'GET') {
      const records = await readConversation(session);
      await markRead(records);
      const messages = records.map(normalize).reverse();
      const first = records[0] ? normalize(records[0]) : {};
      return respond(res, 200, { seller_id: session.seller_id, buyer_label: first.buyer_label || '', item_id: session.item_id, item_title: first.item_title || '', messages: messages });
    }
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content || content.length > 1000 || !/^[0-9a-f-]{36}$/i.test(input.client_id || '')) return respond(res, 400, { error: 'Reply is invalid' });
    const priorQuery = new URLSearchParams(); priorQuery.set('filterByFormula', 'AND({seller_id}=' + fstr(session.seller_id) + ',{buyer_tmp_id}=' + fstr(session.buyer_tmp_id) + ',{client_id}=' + fstr(input.client_id) + ')'); priorQuery.set('maxRecords', '1');
    const prior = await airtable(baseUrl() + '?' + priorQuery.toString());
    if (prior.records && prior.records[0]) return respond(res, 201, { message: normalize(prior.records[0]) });
    const records = await readConversation(session);
    const sample = records[0] ? records[0].fields : {};
    const created = await airtable(baseUrl(), { method: 'POST', body: JSON.stringify({ fields: {
      buyer_tmp_id: session.buyer_tmp_id, buyer_label: sample.buyer_label || '', seller_id: session.seller_id,
      item_id: session.item_id, item_title: sample.item_title || '', sender_type: 'seller', content: content,
      is_read_by_seller: true, is_read_by_buyer: false, client_id: input.client_id, created_at: new Date().toISOString()
    } }) });
    return respond(res, 201, { message: normalize(created) });
  } catch (_) { return respond(res, 503, { error: 'Could not process this conversation' }); }
}




