import { createHmac, timingSafeEqual } from 'node:crypto';
// 藏家回复面板：GET 读对话 / POST 发回复。凭签名的短期令牌访问，无需登录。
// 消息本体存在 Cloudflare D1（Worker gudong-data-api → 表 messages），0 次 Airtable 调用。
import { dataConfigured, dataGet, dataPost } from './_data.js';

const SECRET = process.env.CHAT_REPLY_SECRET;

function respond(res, code, data) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(code).json(data);
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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!SECRET || Buffer.byteLength(SECRET) < 32 || !dataConfigured()) return respond(res, 503, { error: 'Reply service is not configured' });
  const input = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  const session = verify(input.token);
  if (!session) return respond(res, 401, { error: 'Reply link is invalid or expired' });

  try {
    if (req.method === 'GET') {
      const result = await dataGet('/conversation', {
        seller_id: session.seller_id, item_id: session.item_id, buyer_tmp_id: session.buyer_tmp_id
      });
      const messages = result.messages || [];
      const first = messages[0] || {};
      return respond(res, 200, {
        seller_id: session.seller_id,
        buyer_label: first.buyer_label || '',
        item_id: session.item_id,
        item_title: first.item_title || '',
        messages: messages
      });
    }
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!content || content.length > 1000 || !/^[0-9a-f-]{36}$/i.test(input.client_id || '')) {
      return respond(res, 400, { error: 'Reply is invalid' });
    }
    const result = await dataPost('/reply', {
      seller_id: session.seller_id, item_id: session.item_id,
      buyer_tmp_id: session.buyer_tmp_id, content, client_id: input.client_id
    });
    return respond(res, 201, { message: result.message });
  } catch (error) {
    if (error && error.status === 404) return respond(res, 404, { error: 'Conversation not found' });
    return respond(res, 503, { error: 'Could not process this conversation' });
  }
}
