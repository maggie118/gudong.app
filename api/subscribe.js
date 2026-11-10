// api/subscribe.js
// Web Push 订阅存取：POST 保存 / 退订，数据写 Cloudflare D1（Worker /push）。
// 2026-11-11 改：Airtable push_subs 已停用（免费额度耗尽 + token 只读会 403），
// 订阅改由 D1 承接，后面由 Worker 定时器按 follows 匹配新上架再发推送。
// 环境变量：GUDONG_DATA_URL、GUDONG_DATA_KEY（与 Worker 的 INTERNAL_KEY 相同）
import { dataConfigured, dataPost } from './_data.js';

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function clamp(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  const endpoint = clamp(body.endpoint, 500);
  if (!/^https:\/\//i.test(endpoint)) return sendJson(res, 400, { ok: false, error: 'invalid_endpoint' });

  if (!dataConfigured()) return sendJson(res, 202, { ok: false, code: 'store_unconfigured' });

  try {
    if (body.action === 'unsubscribe' || body.action === 'off') {
      await dataPost('/push', { endpoint, action: 'off' });
      return sendJson(res, 200, { ok: true, active: false });
    }
    const p256dh = clamp(body.p256dh, 200);
    const auth = clamp(body.auth, 100);
    if (!p256dh || !auth) return sendJson(res, 400, { ok: false, error: 'invalid_keys' });
    await dataPost('/push', {
      endpoint,
      p256dh,
      auth,
      buyer_key: clamp(body.buyer_key, 120),
      contact: clamp(body.contact, 120),
      contact_type: body.contact_type === 'email' ? 'email' : (body.contact_type ? 'whatsapp' : ''),
      seller: clamp(body.seller, 60),
      source: clamp(body.source, 40)
    });
    return sendJson(res, 200, { ok: true, active: true });
  } catch (error) {
    return sendJson(res, 202, {
      ok: false, code: 'store_error', detail: String(error && error.message || error).slice(0, 200)
    });
  }
}
