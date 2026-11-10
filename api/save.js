// api/save.js
// 藏品「收藏 / 关注」的匿名计数：POST /api/save
//   { item_id, seller, anon, action: 'save' | 'unsave' }
// 现在写入 Cloudflare D1（Worker gudong-data-api → 表 saves），不再消耗 Airtable 额度。
// 仍然只存浏览器本地随机 id（anon），无姓名、无联系方式、不通知藏家。
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
function str(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  const itemId = str(body.item_id, 80);
  const anon = str(body.anon, 64);
  const seller = str(body.seller, 80);
  const action = body.action === 'unsave' ? 'unsave' : 'save';

  if (!/^[a-z0-9._-]{2,80}$/i.test(itemId) || !/^[a-z0-9]{8,64}$/i.test(anon)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_payload' });
  }
  if (!dataConfigured()) return sendJson(res, 202, { ok: false, code: 'store_unconfigured' });

  try {
    const result = await dataPost('/save', { item_id: itemId, anon, seller, action });
    return sendJson(res, 200, {
      ok: true,
      saved: result.saved === true,
      ...(result.dup ? { dup: true } : {})
    });
  } catch (error) {
    return sendJson(res, 202, { ok: false, code: 'store_error', detail: String(error.message).slice(0, 220) });
  }
}
