// api/buyer.js
// 买家身份登记（一次，长期有效）：POST /api/buyer
//   { credential }                       —— Google ID token（前端 google.accounts.id 回调里拿到的 credential）
//   { email, name?, item_id? }           —— 没有 Google 的买家，只填邮箱
// 同名端点还承接「我的帐户」的收藏 / 关注（Vercel 免费版每个部署最多 12 个函数，
// 所以不再单独开 api/account.js）：
//   GET  /api/buyer?buyer_key=<buyer_id 或邮箱>            -> { favorites, follows }
//   POST { op:'fav',    buyer_key, item_id, seller?, title?, action } 
//   POST { op:'follow', buyer_key, kind, target, label?, action }
//   POST { buyer_key, favorites:[...], follows:[...] }      -> 本机清单补同步，返回合并全量
// 校验：Google token 走 https://oauth2.googleapis.com/tokeninfo 复核 aud、email_verified、exp，
//       伪造的 token 进不来；邮箱做格式校验后小写归一。
// 存储：Cloudflare D1 buyers / favorites / follows
// 返回：{ ok, buyer_id, email, name, source, returning }
import { dataConfigured, dataGet, dataPost } from './_data.js';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
function clamp(value, max) { return String(value == null ? '' : value).trim().slice(0, max); }

/* 帐户用的键：buyer_id（20 位十六进制，猜不到）优先，老身份退回邮箱 */
function accountKey(value) {
  const key = clamp(value, 120).toLowerCase();
  return /^[a-z0-9_@.\-]{4,120}$/.test(key) ? key : '';
}

async function accountPull(key) {
  const result = await dataGet('/account', { buyer_key: key });
  return {
    favorites: Array.isArray(result.favorites) ? result.favorites : [],
    follows: Array.isArray(result.follows) ? result.follows : []
  };
}

async function accountPost(key, body) {
  if (body.op === 'fav') {
    await dataPost('/fav', {
      buyer_key: key,
      item_id: claim(body.item_id, 80),
      seller: claim(body.seller, 80),
      title: claim(body.title, 120),
      action: body.action === 'unsave' ? 'unsave' : 'save'
    });
    return;
  }
  if (body.op === 'follow') {
    await dataPost('/follow', {
      buyer_key: key,
      kind: body.kind === 'category' ? 'category' : 'seller',
      target: claim(body.target, 80),
      label: claim(body.label, 80),
      action: body.action === 'off' ? 'off' : 'on'
    });
    return;
  }
  // 本机清单补同步（只在登录后触发；只增不删）
  for (const itemId of (Array.isArray(body.favorites) ? body.favorites : []).slice(0, 300)) {
    const id = claim(itemId, 80);
    if (!/^item-[a-z0-9-]{1,70}$/i.test(id)) continue;
    await dataPost('/fav', { buyer_key: key, item_id: id, seller: '', title: '', action: 'save' });
  }
  for (const follow of (Array.isArray(body.follows) ? body.follows : []).slice(0, 200)) {
    const target = claim(follow && follow.target, 80);
    if (!target) continue;
    await dataPost('/follow', {
      buyer_key: key,
      kind: follow.kind === 'category' ? 'category' : 'seller',
      target,
      label: claim(follow.label, 80),
      action: 'on'
    });
  }
}

function claim(value, max) { return clamp(value, max); }

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
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  /* ---- 我的帐户：收藏 / 关注（GET 拉取，POST 写入或补同步） ---- */
  const wantsAccount = req.method === 'GET'
    || body.op === 'fav' || body.op === 'follow'
    || Array.isArray(body.favorites) || Array.isArray(body.follows);
  if (wantsAccount) {
    const key = accountKey(req.method === 'GET' ? (req.query && req.query.buyer_key) : body.buyer_key);
    if (!key) return sendJson(res, 400, { ok: false, error: 'invalid_buyer' });
    if (!dataConfigured()) return sendJson(res, 202, { ok: false, code: 'store_unconfigured' });
    try {
      if (req.method === 'POST') await accountPost(key, body);
      const merged = await accountPull(key);
      return sendJson(res, 200, { ok: true, key, ...merged });
    } catch (error) {
      return sendJson(res, 202, {
        ok: false, code: 'store_error', detail: String(error && error.message || error).slice(0, 200)
      });
    }
  }

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
