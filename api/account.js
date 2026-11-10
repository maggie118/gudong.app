// api/account.js
// 买家帐户「我的帐户」：收藏 / 关注 跟着身份走（存 Cloudflare D1）
//
//   GET  /api/account?buyer_key=<buyer_id 或邮箱>
//        -> { ok, favorites:[{item_id,seller,title,created_at}], follows:[{kind,target,label,created_at}] }
//
//   POST /api/account { buyer_key, op:'fav',    item_id, seller?, title?, action:'save'|'unsave' }
//   POST /api/account { buyer_key, op:'follow', kind:'seller'|'category', target, label?, action:'on'|'off' }
//   POST /api/account { buyer_key, favorites:['item-...'], follows:[{kind,target,label}] }
//        -> 把本机已有的收藏 / 关注推上去（登录取到 buyer_id 之后补同步一次），返回合并后的全量
//
// buyer_key 用 buyers.buyer_id（不可猜的 20 位十六进制）优先，没有则退回邮箱。
import { dataConfigured, dataGet, dataPost } from './_data.js';

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
function buyerKey(value) {
  const key = clamp(value, 120).toLowerCase();
  return /^[a-z0-9_@.\-]{4,120}$/.test(key) ? key : '';
}

async function pull(key) {
  const result = await dataGet('/account', { buyer_key: key });
  return {
    favorites: Array.isArray(result.favorites) ? result.favorites : [],
    follows: Array.isArray(result.follows) ? result.follows : []
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  const key = buyerKey(req.method === 'GET' ? (req.query && req.query.buyer_key) : body.buyer_key);
  if (!key) return sendJson(res, 400, { ok: false, error: 'invalid_buyer' });
  if (!dataConfigured()) return sendJson(res, 202, { ok: false, code: 'store_unconfigured' });

  try {
    if (req.method === 'GET') {
      const result = await pull(key);
      return sendJson(res, 200, { ok: true, ...result });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    if (body.op === 'fav') {
      await dataPost('/fav', {
        buyer_key: key,
        item_id: clamp(body.item_id, 80),
        seller: clamp(body.seller, 80),
        title: clamp(body.title, 120),
        action: body.action === 'unsave' ? 'unsave' : 'save'
      });
    } else if (body.op === 'follow') {
      await dataPost('/follow', {
        buyer_key: key,
        kind: body.kind === 'category' ? 'category' : 'seller',
        target: clamp(body.target, 80),
        label: clamp(body.label, 80),
        action: body.action === 'off' ? 'off' : 'on'
      });
    } else if (Array.isArray(body.favorites) || Array.isArray(body.follows)) {
      // 把本机清单补同步上去（只在登录后触发一次，不删任何东西）
      for (const itemId of (body.favorites || []).slice(0, 300)) {
        const id = clamp(itemId, 80);
        if (!/^item-[a-z0-9-]{1,70}$/i.test(id)) continue;
        await dataPost('/fav', { buyer_key: key, item_id: id, seller: '', title: '', action: 'save' });
      }
      for (const follow of (body.follows || []).slice(0, 200)) {
        const target = clamp(follow && follow.target, 80).toLowerCase();
        if (!/^[a-z0-9-]{2,80}$/i.test(target)) continue;
        await dataPost('/follow', {
          buyer_key: key,
          kind: follow.kind === 'category' ? 'category' : 'seller',
          target,
          label: clamp(follow.label, 80),
          action: 'on'
        });
      }
    } else {
      return sendJson(res, 400, { ok: false, error: 'unknown_op' });
    }

    const merged = await pull(key);
    return sendJson(res, 200, { ok: true, ...merged });
  } catch (error) {
    return sendJson(res, 202, {
      ok: false,
      code: 'store_error',
      detail: String(error && error.message || error).slice(0, 200)
    });
  }
}
