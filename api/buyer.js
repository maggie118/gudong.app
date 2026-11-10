// api/buyer.js
// 买家身份登记（一次，长期有效）：POST /api/buyer
//   { credential }                       —— Google ID token（前端 google.accounts.id 回调里拿到的 credential）
//   { email, name?, item_id? }           —— 没有 Google 的买家，只填邮箱
// 校验：Google token 走 https://oauth2.googleapis.com/tokeninfo 复核 aud、email_verified、exp，
//       伪造的 token 进不来；邮箱做格式校验后小写归一。
// 存储：Cloudflare D1 buyers 表（buyer_id / email / name / source / first_item / consent_at / created_at / last_seen）
// 返回：{ ok, buyer_id, email, name, source, returning }
import { dataConfigured, dataPost } from './_data.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

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

async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) return null;
  if (typeof credential !== 'string' || credential.length > 5000) return null;
  try {
    const url = new URL('https://oauth2.googleapis.com/tokeninfo');
    url.searchParams.set('id_token', credential);
    const response = await fetch(url.toString());
    if (!response.ok) return null;
    const json = await response.json();
    if (json.aud !== GOOGLE_CLIENT_ID) return null;
    if (String(json.email_verified) !== 'true' || !json.email) return null;
    if (Number(json.exp) * 1000 < Date.now()) return null;
    return {
      email: String(json.email).toLowerCase().slice(0, 120),
      name: clamp(json.name, 40),
      sub: clamp(json.sub, 80)
    };
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  let email = '';
  let name = '';
  let source = 'email';
  let googleSub = '';

  if (body.credential) {
    const verified = await verifyGoogle(body.credential);
    if (!verified) {
      return sendJson(res, 400, {
        ok: false,
        error: 'google_unverified',
        code: GOOGLE_CLIENT_ID ? 'invalid_token' : 'google_unconfigured'
      });
    }
    email = verified.email;
    name = verified.name;
    source = 'google';
    googleSub = verified.sub;
  } else {
    email = clamp(body.email, 120).toLowerCase();
    name = clamp(body.name, 40);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      // 只留了 WhatsApp 号码的买家：身份照样记在本机，号码仍进 Airtable 买家名单
      const phone = clamp(body.contact, 40).replace(/[^\d+]/g, '');
      if (/^\+?\d{7,15}$/.test(phone)) return sendJson(res, 200, { ok: true, phone_only: true, contact: phone });
      return sendJson(res, 400, { ok: false, error: 'invalid_email' });
    }
  }

  if (!dataConfigured()) return sendJson(res, 202, { ok: false, code: 'store_unconfigured' });

  try {
    const result = await dataPost('/buyer', {
      email, name, source, google_sub: googleSub, item_id: clamp(body.item_id, 80)
    });
    return sendJson(res, 200, {
      ok: true,
      buyer_id: result.buyer_id,
      email: result.email,
      name: result.name || name,
      source: result.source || source,
      returning: result.returning === true
    });
  } catch (error) {
    return sendJson(res, 202, { ok: false, code: 'store_error', detail: String(error.message).slice(0, 200) });
  }
}
