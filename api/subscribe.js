// api/subscribe.js
// Web Push 订阅存取：POST 保存/更新/退订订阅记录到 Airtable push_subs 表。
// 环境变量：AIRTABLE_BASE_ID、AIRTABLE_TOKEN、PUSH_SUBS_TABLE（默认 push_subs）
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.PUSH_SUBS_TABLE || 'push_subs';

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.end(JSON.stringify(obj));
}

function atUrl() {
  return `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;
}

async function listByEndpoint(endpoint) {
  const url = new URL(atUrl());
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('filterByFormula', `{endpoint} = "${String(endpoint).replace(/"/g, '\\"')}"`);
  const r = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!r.ok) throw new Error('airtable list ' + r.status);
  const j = await r.json();
  return j.records || [];
}

async function patch(recId, fields) {
  const r = await fetch(`${atUrl()}/${recId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error('airtable patch ' + r.status);
  return r.json();
}

async function create(fields) {
  const r = await fetch(atUrl(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!r.ok) throw new Error('airtable create ' + r.status);
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.end();
    return;
  }
  if (!BASE || !TOKEN) return sendJson(res, 500, { ok: false, error: 'server not configured' });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method not allowed' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch (e) { return sendJson(res, 400, { ok: false, error: 'bad json' }); }

  const { endpoint, auth, p256dh, action } = body;
  if (!endpoint || typeof endpoint !== 'string') {
    return sendJson(res, 400, { ok: false, error: 'endpoint required' });
  }

  // 退订：把该 endpoint 对应的订阅标记为 inactive
  if (action === 'unsubscribe') {
    try {
      const existing = await listByEndpoint(endpoint);
      for (const rec of existing) await patch(rec.id, { active: false });
      return sendJson(res, 200, { ok: true, action: 'unsubscribed' });
    } catch (e) {
      return sendJson(res, 502, { ok: false, error: e.message });
    }
  }

  if (!auth || !p256dh) return sendJson(res, 400, { ok: false, error: 'auth/p256dh required' });

  try {
    const existing = await listByEndpoint(endpoint);
    if (existing.length) {
      await patch(existing[0].id, { auth, p256dh, active: true });
    } else {
      await create({ endpoint, auth, p256dh, active: true });
    }
    return sendJson(res, 200, { ok: true });
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: e.message });
  }
};
