import { createHmac, timingSafeEqual } from 'node:crypto';
// 藏家收件箱：GET /api/seller-inbox（线程列表或单条对话）+ POST（回复）
// 消息本体存在 Cloudflare D1（Worker gudong-data-api → 表 messages），0 次 Airtable 调用。
// 鉴权：藏家专属签名链接（Bearer <payload>.<hmac>，scope=seller_inbox）
import { dataConfigured, dataGet, dataPost } from './_data.js';

const SECRET = process.env.CHAT_REPLY_SECRET;

function respond(res, code, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
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
    if (data.scope !== 'seller_inbox' || !/^[a-z0-9-]{2,80}$/i.test(data.seller_id || '') || !Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    return data;
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!SECRET || Buffer.byteLength(SECRET) < 32 || !dataConfigured()) return respond(res, 503, { error: 'Inbox service is not configured' });
  const session = verify(bearer(req));
  if (!session) return respond(res, 401, { error: 'Seller inbox link is invalid or expired' });
  const sellerId = session.seller_id;

  try {
    if (req.method === 'GET') {
      const itemId = String((req.query || {}).item_id || '');
      const buyerId = String((req.query || {}).buyer_tmp_id || '');
      if (itemId || buyerId) {
        if (!/^item-[a-z0-9-]{1,70}$/i.test(itemId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(buyerId)) {
          return respond(res, 400, { error: 'Invalid conversation' });
        }
        const result = await dataGet('/conversation', { seller_id: sellerId, item_id: itemId, buyer_tmp_id: buyerId });
        const messages = result.messages || [];
        if (!messages.length) return respond(res, 404, { error: 'Conversation not found' });
        return respond(res, 200, { messages: messages });
      }
      const result = await dataGet('/threads', { seller_id: sellerId });
      return respond(res, 200, { seller_id: sellerId, threads: result.threads || [] });
    }

    const input = req.body || {};
    const itemId = input.item_id;
    const buyerId = input.buyer_tmp_id;
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    const clientId = input.client_id;
    if (!/^item-[a-z0-9-]{1,70}$/i.test(itemId || '') ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(buyerId || '') ||
        !content || content.length > 1000 || !/^[0-9a-f-]{36}$/i.test(clientId || '')) {
      return respond(res, 400, { error: 'Reply is invalid' });
    }
    const result = await dataPost('/reply', { seller_id: sellerId, item_id: itemId, buyer_tmp_id: buyerId, content, client_id: clientId });
    return respond(res, 201, { message: result.message });
  } catch (error) {
    if (error && error.status === 404) return respond(res, 404, { error: 'Conversation not found' });
    if (error && error.status === 400) return respond(res, 400, { error: 'Reply is invalid' });
    return respond(res, 503, { error: 'Could not process seller inbox request' });
  }
}
