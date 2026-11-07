// api/lead.js
// 买家名单（buyer_list）写入：POST /api/lead
//   { contact, contact_type, seller, source, follows:[{type,term}], lang, page }
//   { action:'unsubscribe', contact, seller }
// 存储：Airtable 表 buyer_leads（可用环境变量 BUYER_LEADS_TABLE 改名）
// 字段：contact / contact_type / seller / source / lang / page / follows / created_at / status
// 设计原则：前端绝不能因为后端没配好就丢掉买家 —— 失败也返回 200 级状态，前端已有本地兜底。
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.BUYER_LEADS_TABLE || 'buyer_leads';

function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function atUrl() {
  return 'https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(TABLE);
}

async function atFetch(url, options) {
  const r = await fetch(url, options);
  const text = await r.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
  if (!r.ok) {
    const err = new Error('airtable ' + r.status);
    err.status = r.status;
    err.type = json && json.error && json.error.type;
    throw err;
  }
  return json;
}

// 只保留写入需要的字段，长度做上限，避免脏数据把表塞爆
function clamp(v, n) {
  return String(v == null ? '' : v).trim().slice(0, n);
}

function detectType(contact) {
  return contact.indexOf('@') !== -1 ? 'email' : 'whatsapp';
}

function validContact(contact, type) {
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contact);
  return /^\+?\d{7,15}$/.test(contact);
}

function normalizeContact(contact, type) {
  const s = clamp(contact, 120);
  if (type === 'email') return s.toLowerCase();
  const plus = s.charAt(0) === '+';
  return (plus ? '+' : '') + s.replace(/\D/g, '');
}

function flattenFollows(follows) {
  if (!Array.isArray(follows)) return '';
  const out = [];
  for (const f of follows.slice(0, 30)) {
    if (!f || !f.type || !f.term) continue;
    const type = clamp(f.type, 12);
    if (type !== 'seller' && type !== 'tag') continue;
    out.push(type + ':' + clamp(f.term, 60));
  }
  return out.join('; ').slice(0, 900);
}

// 极简频率限制（同一实例内存；只防脚本刷接口，不替代平台风控）
const HITS = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const win = 10 * 60 * 1000;
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 2000) HITS.clear();
  return arr.length > 8;
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
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: 'bad_json' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return sendJson(res, 429, { ok: false, error: 'too_many_requests' });

  const rawContact = body.contact;
  if (!rawContact || typeof rawContact !== 'string') {
    return sendJson(res, 400, { ok: false, error: 'contact_required' });
  }
  if (body.hp) return sendJson(res, 200, { ok: true, note: 'ignored' }); // 蜜罐

  const type = body.contact_type === 'email' || body.contact_type === 'whatsapp'
    ? body.contact_type
    : detectType(rawContact);
  const contact = normalizeContact(rawContact, type);
  if (!validContact(contact, type)) {
    return sendJson(res, 400, { ok: false, error: 'invalid_contact' });
  }

  if (!BASE || !TOKEN) {
    return sendJson(res, 202, { ok: false, code: 'store_unconfigured' });
  }

  const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  const seller = clamp(body.seller, 60);

  // 退订：把该联系人的记录标为 unsubscribed
  if (body.action === 'unsubscribe') {
    try {
      const url = new URL(atUrl());
      url.searchParams.set('filterByFormula', `{contact} = "${contact.replace(/"/g, '\\"')}"`);
      url.searchParams.set('pageSize', '100');
      const list = await atFetch(url.toString(), { headers });
      for (const rec of list.records || []) {
        await atFetch(atUrl() + '/' + rec.id, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ fields: { status: 'unsubscribed' }, typecast: true })
        });
      }
      return sendJson(res, 200, { ok: true, action: 'unsubscribed' });
    } catch (e) {
      return sendJson(res, 202, { ok: false, code: e.type || 'store_error' });
    }
  }

  const fields = {
    contact,
    contact_type: type,
    seller,
    source: clamp(body.source, 40),
    lang: body.lang === 'en' ? 'en' : 'zh',
    page: clamp(body.page, 120),
    follows: flattenFollows(body.follows),
    created_at: new Date().toISOString(),
    status: 'active'
  };

  try {
    const created = await atFetch(atUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ records: [{ fields }], typecast: true })
    });
    const id = created && created.records && created.records[0] && created.records[0].id;
    return sendJson(res, 200, { ok: true, id: id || '' });
  } catch (e) {
    // 表还没建 / 字段名不一致 / 额度受限：不阻塞前端，只标记未同步
    const code = e.type === 'TABLE_NOT_FOUND' ? 'table_missing'
      : e.type === 'UNKNOWN_FIELD_NAME' ? 'field_mismatch'
      : e.status === 429 ? 'rate_limited'
      : 'store_error';
    return sendJson(res, 202, { ok: false, code });
  }
};
