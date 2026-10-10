import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.CHAT_AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_CHAT_TABLE;
const SECRET = process.env.CHAT_REPLY_SECRET;

function respond(res, code, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(data);
}
function baseUrl() { return 'https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(TABLE); }
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
    if (data.scope !== 'seller_inbox' || !/^[a-z0-9-]{2,80}$/i.test(data.seller_id || '') || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    return data;
  } catch (_) { return null; }
}
async function airtable(url, options) {
  const opts = Object.assign({}, options || {});
  opts.headers = Object.assign({ Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, opts.headers || {});
  const response = await fetch(url, opts);
  if (!response.ok) throw new Error('Airtable request failed (' + response.status + ')');
  return response.json();
}
function normalize(record) {
  const f = record.fields || {};
  return {
    id: record.id, client_id: f.client_id || '', sender_type: f.sender_type || 'buyer',
    content: f.content || '', created_at: f.created_at || record.createdTime,
    buyer_tmp_id: f.buyer_tmp_id || '', buyer_label: f.buyer_label || '',
    item_title: f.item_title || '', item_id: f.item_id || '', seller_id: f.seller_id || '',
    is_read_by_seller: f.is_read_by_seller === true
  };
}
async function getMessages(sellerId, itemId, buyerId) {
  const params = new URLSearchParams();
  params.set('filterByFormula', 'AND({seller_id}=' + fstr(sellerId) + ',{item_id}=' + fstr(itemId) + ',{buyer_tmp_id}=' + fstr(buyerId) + ')');
  params.set('pageSize', '100');
  params.set('sort[0][field]', 'created_at');
  params.set('sort[0][direction]', 'asc');
  let records = [];
  let offset = '';
  do {
    if (offset) params.set('offset', offset); else params.delete('offset');
    const page = await airtable(baseUrl() + '?' + params.toString());
    records = records.concat(page.records || []);
    offset = page.offset || '';
  } while (offset && records.length < 1000);
  return records;
}
async function getSellerMessages(sellerId) {
  const params = new URLSearchParams();
  params.set('filterByFormula', '{seller_id}=' + fstr(sellerId));
  params.set('pageSize', '100');
  params.set('sort[0][field]', 'created_at');
  params.set('sort[0][direction]', 'desc');
  let records = [];
  let offset = '';
  do {
    if (offset) params.set('offset', offset); else params.delete('offset');
    const page = await airtable(baseUrl() + '?' + params.toString());
    records = records.concat(page.records || []);
    offset = page.offset || '';
  } while (offset && records.length < 1000);
  return records;
}
async function markRead(records) {
  const unread = records.filter(r => r.fields.sender_type === 'buyer' && r.fields.is_read_by_seller !== true);
  for (let i = 0; i < unread.length; i += 10) {
    await airtable(baseUrl(), { method: 'PATCH', body: JSON.stringify({ records: unread.slice(i, i + 10).map(r => ({ id: r.id, fields: { is_read_by_seller: true } })) }) });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!BASE || !TOKEN || !TABLE || !SECRET || Buffer.byteLength(SECRET) < 32) return respond(res, 503, { error: 'Inbox service is not configured' });
  const session = verify(bearer(req));
  if (!session) return respond(res, 401, { error: 'Seller inbox link is invalid or expired' });
  const sellerId = session.seller_id;

  try {
    if (req.method === 'GET') {
      const itemId = String((req.query || {}).item_id || '');
      const buyerId = String((req.query || {}).buyer_tmp_id || '');
      if (itemId || buyerId) {
        if (!/^item-[a-z0-9-]{1,70}$/i.test(itemId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(buyerId)) return respond(res, 400, { error: 'Invalid conversation' });
        const records = await getMessages(sellerId, itemId, buyerId);
        if (!records.length) return respond(res, 404, { error: 'Conversation not found' });
        await markRead(records);
        return respond(res, 200, { messages: records.map(normalize) });
      }
      const records = await getSellerMessages(sellerId);
      const threads = new Map();
      records.forEach(record => {
        const m = normalize(record);
        const key = m.item_id + '|' + m.buyer_tmp_id;
        let thread = threads.get(key);
        if (!thread) {
          thread = { item_id: m.item_id, item_title: m.item_title, buyer_tmp_id: m.buyer_tmp_id, buyer_label: m.buyer_label, last_message: m.content, last_at: m.created_at, unread_count: 0 };
          threads.set(key, thread);
        }
        if (m.sender_type === 'buyer' && !m.is_read_by_seller) thread.unread_count++;
      });
      return respond(res, 200, { seller_id: sellerId, threads: Array.from(threads.values()) });
    }

    const input = req.body || {};
    const itemId = input.item_id;
    const buyerId = input.buyer_tmp_id;
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    const clientId = input.client_id;
    if (!/^item-[a-z0-9-]{1,70}$/i.test(itemId || '') || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(buyerId || '') || !content || content.length > 1000 || !/^[0-9a-f-]{36}$/i.test(clientId || '')) {
      return respond(res, 400, { error: 'Reply is invalid' });
    }
    const records = await getMessages(sellerId, itemId, buyerId);
    if (!records.some(r => r.fields.sender_type === 'buyer')) return respond(res, 404, { error: 'Conversation not found' });
    const duplicateQuery = new URLSearchParams();
    duplicateQuery.set('filterByFormula', 'AND({seller_id}=' + fstr(sellerId) + ',{item_id}=' + fstr(itemId) + ',{buyer_tmp_id}=' + fstr(buyerId) + ',{client_id}=' + fstr(clientId) + ')');
    duplicateQuery.set('maxRecords', '1');
    const prior = await airtable(baseUrl() + '?' + duplicateQuery.toString());
    if (prior.records && prior.records[0]) return respond(res, 201, { message: normalize(prior.records[0]) });
    const sample = records[0].fields;
    const created = await airtable(baseUrl(), { method: 'POST', body: JSON.stringify({ fields: {
      buyer_tmp_id: buyerId, buyer_label: sample.buyer_label || '', seller_id: sellerId,
      item_id: itemId, item_title: sample.item_title || '', sender_type: 'seller', content,
      is_read_by_seller: true, is_read_by_buyer: false, client_id: clientId, created_at: new Date().toISOString()
    } }) });
    return respond(res, 201, { message: normalize(created) });
  } catch (_) {
    return respond(res, 503, { error: 'Could not process seller inbox request' });
  }
}
