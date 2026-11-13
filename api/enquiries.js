// api/enquiries.js
// 藏家端「询价收件箱」数据接口：GET /api/enquiries
// 鉴权：与 /api/seller-inbox 同一套签名链接（Bearer <payload>.<hmac>，scope=seller_inbox）
// 数据源：Cloudflare D1 表 inquiries（2026-11-13 起；原 Airtable buyer_leads 已迁走）
// 返回：{ seller_id, enquiries: [{ id, buyer_key, name, contact, contact_type, intent, item_id, item_title,
//                                 page, source, channel, follows, status, created_at }] }
const { createHmac, timingSafeEqual } = require('node:crypto');
const { d1Configured, d1Get, d1Post } = require('./_d1');

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
    if (!Number.isFinite(data.exp) || data.exp < Date.now()) return null;
    // 藏家收件箱链接：scope=seller_inbox，必须带合法 seller_id
    if (data.scope === 'seller_inbox') {
      if (!/^[a-z0-9-]{2,80}$/i.test(data.seller_id || '')) return null;
      return data;
    }
    // 内部季度报表：scope=platform_snapshot，只能由持有签名密钥的一方签发，不含 seller_id
    if (data.scope === 'platform_snapshot') return data;
    return null;
  } catch (_) { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return respond(res, 405, { error: 'Method not allowed' });
  }
  if (!SECRET || Buffer.byteLength(SECRET) < 32 || !d1Configured()) {
    return respond(res, 503, { error: 'Enquiry inbox is not configured' });
  }
  const session = verify(bearer(req));

  // 内部季度快照：GET /api/enquiries?snapshot=1&from=YYYY-MM-DD&to=YYYY-MM-DD
  // 只接受 scope=platform_snapshot 的签名令牌（由 CHAT_REPLY_SECRET 签发），藏家令牌无效
  if (req.method === 'GET' && req.query && String(req.query.snapshot) === '1') {
    if (!session || session.scope !== 'platform_snapshot') {
      return respond(res, 401, { error: 'Snapshot link is invalid or expired' });
    }
    const iso = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
    const from = iso(req.query.from);
    const to = iso(req.query.to);
    if (!from || !to) return respond(res, 400, { error: 'from/to must be YYYY-MM-DD' });
    try {
      const stats = await d1Get('/snapshot', { from, to });
      return respond(res, 200, stats);
    } catch (_) {
      return respond(res, 503, { error: 'Could not load snapshot' });
    }
  }

  if (!session) return respond(res, 401, { error: 'Seller inbox link is invalid or expired' });
  if (session.scope !== 'seller_inbox') return respond(res, 403, { error: 'This token cannot read seller inbox' });
  const sellerId = session.seller_id;

  // 卖家侧只允许把一条询价标记为已联络/关闭，不能改内容
  if (req.method === 'POST') {
    let body = {};
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch (_) { body = {}; }
    const status = body.status === 'contacted' || body.status === 'closed' ? body.status : '';
    const id = Number(body.id);
    if (!status || !Number.isInteger(id) || id <= 0) return respond(res, 400, { error: 'Invalid status update' });
    try {
      await d1Post('/inquiry', { action: 'status', id, status, seller: sellerId });
      return respond(res, 200, { ok: true, id, status });
    } catch (_) {
      return respond(res, 503, { error: 'Could not update enquiry' });
    }
  }

  // 聚合看板：GET /api/enquiries?analytics=1&days=30
  // 只回数字，永不回买家身份；数据来自 Worker /analytics（D1 favorites/follows/inquiries/inquiry_clicks）
  if (req.method === 'GET' && req.query && String(req.query.analytics) === '1') {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    try {
      const stats = await d1Get('/analytics', { seller: sellerId, days });
      return respond(res, 200, { seller_id: sellerId, analytics: stats });
    } catch (_) {
      return respond(res, 503, { error: 'Could not load analytics' });
    }
  }

  try {
    const result = await d1Get('/inquiries', { seller: sellerId, limit: 100 });
    const enquiries = (result.enquiries || []).map((row) => ({
      id: row.id,
      buyer_key: row.buyer_key || '',
      name: row.name || '',
      contact: row.contact || '',
      contact_type: row.contact_type || '',
      intent: row.intent || '',
      item_id: row.item_id || '',
      item_title: row.item_title || '',
      page: row.page || '',
      source: row.source || '',
      channel: row.channel || '',
      follows: row.follows || '',
      status: row.status || '',
      created_at: row.created_at || ''
    }));
    return respond(res, 200, { seller_id: sellerId, enquiries });
  } catch (_) {
    return respond(res, 503, { error: 'Could not load enquiries' });
  }
};
