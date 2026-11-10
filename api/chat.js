import { createHmac } from 'node:crypto';
// Anonymous item chat: localStorage identity + Cloudflare D1 persistence + seller webhook alert.
// 消息本体存在 D1（Worker gudong-data-api → 表 messages），只有「这件藏品是否属于该藏家」
// 这一步还会查一次 Airtable 上架表（每次发消息 1 次调用，数量很小）。
// 需要的环境变量：AIRTABLE_BASE_ID / CHAT_AIRTABLE_TOKEN / AIRTABLE_TABLE / CHAT_REPLY_SECRET /
//                 GUDONG_DATA_KEY /（可选）CHAT_NOTIFY_WEBHOOK_URL / CHAT_PUBLIC_URL
import { dataConfigured, dataGet, dataPost } from './_data.js';

const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.CHAT_AIRTABLE_TOKEN;
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
function fstr(value) { return "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
function validId(value, pattern) { return typeof value === 'string' && pattern.test(value); }
function goodConversation(input) {
  return validId(input.item_id, /^item-[a-z0-9-]{1,70}$/i) &&
    validId(input.seller_id, /^[a-z0-9-]{2,80}$/i) &&
    validId(input.buyer_tmp_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
}
async function belongsToSeller(input) {
  const params = new URLSearchParams();
  params.set('filterByFormula', 'AND({item_id}=' + fstr(input.item_id) + ',{seller_id}=' + fstr(input.seller_id) + ",{status}='active')");
  params.set('maxRecords', '1');
  const response = await fetch(
    'https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(LISTINGS_TABLE) + '?' + params.toString(),
    { headers: { Authorization: 'Bearer ' + TOKEN } }
  );
  if (!response.ok) throw new Error('airtable ' + response.status);
  const json = await response.json();
  return !!(json.records && json.records.length);
}
function b64(value) { return Buffer.from(value).toString('base64url'); }
function replyToken(input) {
  const payload = b64(JSON.stringify({ seller_id: input.seller_id, buyer_tmp_id: input.buyer_tmp_id, item_id: input.item_id, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }));
  const signature = createHmac('sha256', SECRET).update(payload).digest('base64url');
  return payload + '.' + signature;
}
function replyUrl(token) { return SITE + '/seller-reply.html?token=' + encodeURIComponent(token); }
async function notifySeller(message, token) {
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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!BASE || !TOKEN || !LISTINGS_TABLE || !SECRET || Buffer.byteLength(SECRET) < 32 || !dataConfigured()) {
    return respond(res, 503, { error: 'Chat service is not configured' });
  }
  const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  if (!goodConversation(input)) return respond(res, 400, { error: 'Invalid conversation' });

  if (req.method === 'GET') {
    try {
      const result = await dataGet('/chat', {
        item_id: input.item_id, seller_id: input.seller_id, buyer_tmp_id: input.buyer_tmp_id
      });
      return respond(res, 200, { messages: result.messages || [] });
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
    const result = await dataPost('/chat', {
      item_id: input.item_id, seller_id: input.seller_id, buyer_tmp_id: input.buyer_tmp_id,
      buyer_label: buyerLabel, item_title: itemTitle, content: content, client_id: clientId
    });
    const message = result.message;
    if (result.duplicate) return respond(res, 201, { message: message, notification_sent: true });
    const notified = await notifySeller(message, replyToken(input));
    return respond(res, 201, { message: message, notification_sent: notified });
  } catch (_) { return respond(res, 503, { error: 'Could not save message' }); }
}
