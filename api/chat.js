import { createHmac } from 'node:crypto';
// Anonymous item chat: localStorage identity + Airtable persistence + seller webhook alert.
// Configure AIRTABLE_BASE_ID, CHAT_AIRTABLE_TOKEN (records:read/write), AIRTABLE_CHAT_TABLE,
// CHAT_REPLY_SECRET (32+ random chars), and CHAT_NOTIFY_WEBHOOK_URL.
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.CHAT_AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_CHAT_TABLE;
const LISTINGS_TABLE = process.env.AIRTABLE_TABLE;
const SECRET = process.env.CHAT_REPLY_SECRET;
const WEBHOOK = process.env.CHAT_NOTIFY_WEBHOOK_URL;
const SITE = (process.env.CHAT_PUBLIC_URL || 'https://gudong.app').replace(/\/+$/, '');
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 8;
const limits = globalThis.__gudongChatRate || (globalThis.__gudongChatRate = new Map());

function respond(res, code, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(data);
}
function esc(value) { return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
function fstr(value) { return "'" + esc(value) + "'"; }
function baseUrl() { return 'https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(TABLE); }
function listingsUrl() { return 'https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(LISTINGS_TABLE); }
function validId(value, pattern) { return typeof value === 'string' && pattern.test(value); }
function goodConversation(input) {
  return validId(input.item_id, /^item-[a-z0-9-]{1,70}$/i) &&
    validId(input.seller_id, /^[a-z0-9-]{2,80}$/i) &&
    validId(input.buyer_tmp_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
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
  return { id: record.id, client_id: f.client_id || '', sender_type: f.sender_type || 'buyer', content: f.content || '', created_at: f.created_at || record.createdTime, buyer_tmp_id: f.buyer_tmp_id || '', buyer_label: f.buyer_label || '', item_title: f.item_title || '', item_id: f.item_id || '', seller_id: f.seller_id || '', is_read_by_seller: f.is_read_by_seller === true };
}
function b64(value) { return Buffer.from(value).toString('base64url'); }
function replyToken(input) {
  const payload = b64(JSON.stringify({ seller_id: input.seller_id, buyer_tmp_id: input.buyer_tmp_id, item_id: input.item_id, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }));
  const signature = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + signature;
}
function replyUrl(token) { return SITE + '/seller-reply.html?token=' + encodeURIComponent(token); }
async function belongsToSeller(input) {
  const params = new URLSearchParams();
  params.set('filterByFormula', 'AND({item_id}=' + fstr(input.item_id) + ',{seller_id}=' + fstr(input.seller_id) + ',{status}=' + fstr('active') + ')');
  params.set('maxRecords', '1');
  const result = await airtable(listingsUrl() + '?' + params.toString());
  return !!(result.records && result.records.length);
}async function notifySeller(message, token) {
  if (!WEBHOOK) return false;
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, 5000);
  try {
    const response = await fetch(WEBHOOK, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        event: 'new_buyer_message', seller_id: message.seller_id, buyer_tmp_id: message.buyer_tmp_id,
        buyer_label: message.buyer_label, item_id: message.item_id, item_title: message.item_title,
        content: message.content, created_at: message.created_at, reply_url: replyUrl(token)
      })
    });
    return response.ok;
  } catch (_) { return false; }
  finally { clearTimeout(timer); }
}
async function markRead(records, field) {
  const unread = records.filter(function (record) { return record.fields.sender_type !== (field === 'is_read_by_seller' ? 'seller' : 'buyer') && record.fields[field] !== true; });
  for (let i = 0; i < unread.length; i += 10) {
    await airtable(baseUrl(), { method: 'PATCH', body: JSON.stringify({ records: unread.slice(i, i + 10).map(function (r) { return { id: r.id, fields: { [field]: true } }; }) }) });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!BASE || !TOKEN || !TABLE || !LISTINGS_TABLE || !SECRET || Buffer.byteLength(SECRET) < 32) return respond(res, 503, { error: 'Chat service is not configured' });
  const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  if (!goodConversation(input)) return respond(res, 400, { error: 'Invalid conversation' });

  if (req.method === 'GET') {
    const params = new URLSearchParams();
    params.set('filterByFormula', 'AND({item_id}=' + fstr(input.item_id) + ',{seller_id}=' + fstr(input.seller_id) + ',{buyer_tmp_id}=' + fstr(input.buyer_tmp_id) + ')');
    params.set('maxRecords', '100');
    params.set('sort[0][field]', 'created_at');
    params.set('sort[0][direction]', 'desc');
    try {
      const result = await airtable(baseUrl() + '?' + params.toString());
      const records = result.records || [];
      await markRead(records, 'is_read_by_buyer');
      return respond(res, 200, { messages: records.map(normalize).reverse() });
    } catch (_) { return respond(res, 503, { error: 'Could not load messages' }); }
  }

  const now = Date.now();
  const clientIp = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const rateKey = clientIp + '|' + input.buyer_tmp_id;
  const recent = (limits.get(rateKey) || []).filter(function (stamp) { return now - stamp < WINDOW_MS; });
  if (recent.length >= MAX_PER_WINDOW) return respond(res, 429, { error: 'Please wait before sending another message' });
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  const clientId = input.client_id;
  const buyerLabel = typeof input.buyer_label === 'string' ? input.buyer_label.slice(0, 32) : '';
  const itemTitle = typeof input.item_title === 'string' ? input.item_title.slice(0, 180) : '';
  if (!content || content.length > 1000 || !validId(clientId, /^[0-9a-f-]{36}$/i) || !/^PWA藏友_[0-9A-F]{4}$/.test(buyerLabel)) {
    return respond(res, 400, { error: 'Message is invalid' });
  }
  recent.push(now); limits.set(rateKey, recent);
  try { if (!(await belongsToSeller(input))) return respond(res, 404, { error: 'Item not available for this seller' }); }
  catch (_) { return respond(res, 503, { error: 'Could not verify this item' }); }

  try {
    const dup = new URLSearchParams();
    dup.set('filterByFormula', 'AND({buyer_tmp_id}=' + fstr(input.buyer_tmp_id) + ',{client_id}=' + fstr(clientId) + ')');
    dup.set('maxRecords', '1');
    const prior = await airtable(baseUrl() + '?' + dup.toString());
    let record = prior.records && prior.records[0];
    let notified = false;
    if (!record) {
      const createdAt = new Date().toISOString();
      const fields = {
        buyer_tmp_id: input.buyer_tmp_id, buyer_label: buyerLabel, seller_id: input.seller_id,
        item_id: input.item_id, item_title: itemTitle, sender_type: 'buyer', content: content,
        is_read_by_seller: false, is_read_by_buyer: true, notification_sent: false, client_id: clientId, created_at: createdAt
      };
      record = await airtable(baseUrl(), { method: 'POST', body: JSON.stringify({ fields: fields }) });
    }
    if (record.fields && record.fields.notification_sent === true) {
      notified = true;
    } else {
      const message = normalize(record);
      const token = replyToken(input);
      notified = await notifySeller(message, token);
      if (notified) record = await airtable(baseUrl() + '/' + record.id, { method: 'PATCH', body: JSON.stringify({ fields: { notification_sent: true } }) });
    }
    return respond(res, 201, { message: normalize(record), notification_sent: notified });
  } catch (_) { return respond(res, 503, { error: 'Could not save message' }); }
}








