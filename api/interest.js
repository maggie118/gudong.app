// api/interest.js
// 藏品「收藏 / 关注」的汇总数字：GET /api/interest?seller=<seller_id>
// 鉴权同 /api/enquiries：藏家专属签名链接（Bearer <payload>.<hmac>，scope=seller_inbox）
// 只返回数字，不返回任何收藏者身份：{ seller_id, saves_30d, saves_total, tracked }
// 数据来自 Cloudflare D1（Worker gudong-data-api → 表 saves），0 次 Airtable 调用。
import { createHmac, timingSafeEqual } from 'node:crypto';
import { dataConfigured, dataGet } from './_data.js';

const SECRET = process.env.CHAT_REPLY_SECRET;

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  const session = verify(bearer(req));
  if (!session) return respond(res, 401, { error: 'Seller inbox link is invalid or expired' });

  // 收藏 / 关注这类受欢迎度统计是「私家藏馆」付费权益：
  // 只有签发链接时带 gallery:true 的藏家才返回数字，其余一律安静隐藏。
  const sellerId = session.seller_id;
  if (session.gallery !== true) {
    return respond(res, 200, { seller_id: sellerId, gallery: false, saves_30d: 0, saves_total: 0, views_30d: 0, tracked: false });
  }
  if (!dataConfigured()) {
    return respond(res, 200, { seller_id: sellerId, gallery: true, saves_30d: 0, saves_total: 0, views_30d: 0, tracked: false });
  }

  try {
    const result = await dataGet('/interest', { seller: sellerId });
    return respond(res, 200, {
      seller_id: sellerId,
      gallery: true,
      saves_30d: Number(result.saves_30d) || 0,
      saves_total: Number(result.saves_total) || 0,
      views_30d: 0,
      tracked: result.tracked === true
    });
  } catch (_) {
    // 存储不可用时安静降级：不给藏家看空数字
    return respond(res, 200, { seller_id: sellerId, gallery: true, saves_30d: 0, saves_total: 0, views_30d: 0, tracked: false });
  }
}
