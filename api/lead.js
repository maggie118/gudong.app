const { createHmac } = require('node:crypto');
// api/lead.js
// 买家名单（buyer_list）写入：POST /api/lead
//   { contact, contact_type, seller, source, follows:[{type,term}], lang, page,
//     name, intent, item_id, item_title, consent, google_credential }
//   { action:'unsubscribe', contact, seller }
//   { action:'verify_google', credential }
// 存储：Airtable 表 buyer_leads（可用环境变量 BUYER_LEADS_TABLE 改名）
// 字段：contact / contact_type / seller / source / lang / page / follows / created_at / status
//       询价身份（2026-11-09）：name / intent / item_id / item_title / consent_at
// 设计原则：前端绝不能因为后端没配好就丢掉买家 —— 失败也返回 200 级状态，前端已有本地兜底。
//           新增字段缺失时自动降级：把称呼/意向/藏品打包进 follows 长文本，一条不丢。
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.BUYER_LEADS_TABLE || 'buyer_leads';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const INTENTS = { collection: '自用收藏', gift: '送礼', investment: '投资考量', ask: '只是询价' };

/* ---------------- 卖家询价提醒（2026-11-09） ----------------
 * 买家在藏品页留下身份与意向后，除了写库，还要让藏家知道"有人真的联系了"。
 * 三种通道，按优先级自动选，全都不配置就静默跳过（绝不影响买家提交）：
 *   1) 邮件：配 RESEND_API_KEY（发件地址 ENQUIRY_FROM_EMAIL，默认 notify@gudong.app）
 *      → 发到 Sellers 表里该藏家的「邮箱 / Email Address」，没有邮箱就发平台代收箱
 *   2) Webhook：配 CHAT_NOTIFY_WEBHOOK_URL → POST {event:'new_enquiry', ...}
 *   3) 都不配 → 只在藏家专属收件箱里可见（/seller-inbox.html）
 * ---------------------------------------------------------- */
const SELLERS_TABLE = process.env.AIRTABLE_SELLERS_TABLE || 'sellers';
const SELLER_EMAIL_FIELD = '邮箱 / Email Address';
const CHAT_SECRET = process.env.CHAT_REPLY_SECRET || '';
const RESEND_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.ENQUIRY_FROM_EMAIL || 'Gudong 古董圈 <notify@gudong.app>';
const NOTIFY_WEBHOOK = process.env.CHAT_NOTIFY_WEBHOOK_URL || '';
const PLATFORM_INBOX = process.env.ENQUIRY_PLATFORM_EMAIL || '';
const SITE = (process.env.CHAT_PUBLIC_URL || 'https://www.gudong.app').replace(/\/+$/, '');

function inboxToken(sellerId) {
  if (!CHAT_SECRET || !sellerId) return '';
  try {
    const payload = Buffer.from(JSON.stringify({
      scope: 'seller_inbox',
      seller_id: sellerId,
      exp: Date.now() + 365 * 24 * 60 * 60 * 1000
    })).toString('base64url');
    const signature = createHmac('sha256', CHAT_SECRET).update(payload).digest('base64url');
    return payload + '.' + signature;
  } catch (e) { return ''; }
}
function inboxLink(sellerId) {
  const token = inboxToken(sellerId);
  return token ? SITE + '/seller-inbox.html#token=' + encodeURIComponent(token) : '';
}
async function sellerEmail(sellerId) {
  if (!BASE || !TOKEN || !sellerId) return '';
  try {
    const url = new URL('https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(SELLERS_TABLE));
    url.searchParams.set('filterByFormula', "{seller_id}='" + String(sellerId).replace(/'/g, "\\'") + "'");
    url.searchParams.set('maxRecords', '1');
    const r = await fetch(url.toString(), { headers: { Authorization: 'Bearer ' + TOKEN } });
    if (!r.ok) return '';
    const json = await r.json();
    const f = json && json.records && json.records[0] && json.records[0].fields;
    const v = f && f[SELLER_EMAIL_FIELD];
    return typeof v === 'string' ? v.trim() : '';
  } catch (e) { return ''; }
}
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function enquiryHtml(info) {
  const link = inboxLink(info.seller);
  const who = esc(info.name) || '（未留称呼）';
  return '<div style="font-family:Georgia,\'Songti SC\',serif;max-width:560px;color:#2A2621">'
    + '<p style="font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:#9A7635;margin:0 0 10px">New enquiry · 新询价</p>'
    + '<h2 style="font-weight:500;font-size:1.05rem;margin:0 0 14px">有买家对「' + esc(info.itemTitle || info.itemId) + '」发起了询价</h2>'
    + '<table style="font-size:.9rem;line-height:1.9;border-collapse:collapse">'
    + '<tr><td style="color:#6E665C;padding-right:12px">称呼</td><td>' + who + '</td></tr>'
    + '<tr><td style="color:#6E665C;padding-right:12px">联系方式</td><td>' + esc(info.contact) + '（' + (info.type === 'email' ? '邮箱' : 'WhatsApp') + '）</td></tr>'
    + (info.intent ? '<tr><td style="color:#6E665C;padding-right:12px">意向</td><td>' + esc(info.intent) + '</td></tr>' : '')
    + '<tr><td style="color:#6E665C;padding-right:12px">藏品</td><td>' + esc(info.itemTitle || info.itemId) + '</td></tr>'
    + '<tr><td style="color:#6E665C;padding-right:12px">时间</td><td>' + esc(new Date().toISOString().replace('T', ' ').slice(0, 16)) + ' UTC</td></tr>'
    + '</table>'
    + (link ? '<p style="margin:20px 0"><a href="' + link + '" style="display:inline-block;padding:11px 22px;background:#6F4A31;color:#fff;text-decoration:none;border-radius:2px">打开询价收件箱</a></p>'
      + '<p style="font-size:.76rem;color:#9A938A;line-height:1.8">此链接为您的专属私密入口，请勿转发。</p>'
      : '')
    + '<p style="font-size:.78rem;color:#9A938A;line-height:1.8">买家已同意《隐私政策》，联系方式仅用于本次询价与上新提醒，平台不会公开或转卖。</p>'
    + '</div>';
}
async function notifyEnquiry(info) {
  const tasks = [];
  if (RESEND_KEY) {
    tasks.push((async () => {
      const to = (await sellerEmail(info.seller)) || PLATFORM_INBOX;
      if (!to) return false;
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + RESEND_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject: '新询价：' + (info.itemTitle || info.itemId) + ' · ' + (info.name || '匿名买家'),
          html: enquiryHtml(info)
        })
      });
      return r.ok;
    })());
  }
  if (NOTIFY_WEBHOOK) {
    tasks.push((async () => {
      const r = await fetch(NOTIFY_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'new_enquiry',
          seller_id: info.seller,
          name: info.name,
          contact: info.contact,
          contact_type: info.type,
          intent: info.intent,
          item_id: info.itemId,
          item_title: info.itemTitle,
          page: info.page,
          inbox_url: inboxLink(info.seller),
          created_at: new Date().toISOString()
        })
      });
      return r.ok;
    })());
  }
  if (!tasks.length) return false;
  const guard = (p) => Promise.race([
    p.catch(() => false),
    new Promise((resolve) => setTimeout(() => resolve(false), 3000))
  ]);
  const results = await Promise.all(tasks.map(guard));
  return results.some(Boolean);
}


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

// 新增字段没建好时的降级载体：全部塞进 follows 长文本，字段名保持自解释
function packContext(parts) {
  const out = [];
  if (parts.name) out.push('name:' + parts.name);
  if (parts.intent) out.push('intent:' + parts.intent);
  if (parts.itemId) out.push('item:' + parts.itemId);
  if (parts.itemTitle) out.push('title:' + parts.itemTitle);
  if (parts.consentAt) out.push('consent:' + parts.consentAt);
  return out.join('; ');
}

function mergeFollows(base, packed) {
  return [base, packed].filter(Boolean).join('; ').slice(0, 900);
}

// Google 登录（开关）：校验 ID token 后返回已验证邮箱
async function verifyGoogle(credential) {
  if (!GOOGLE_CLIENT_ID) return null;
  if (typeof credential !== 'string' || credential.length > 5000) return null;
  try {
    const url = new URL('https://oauth2.googleapis.com/tokeninfo');
    url.searchParams.set('id_token', credential);
    const r = await fetch(url.toString());
    if (!r.ok) return null;
    const j = await r.json();
    if (j.aud !== GOOGLE_CLIENT_ID) return null;
    if (String(j.email_verified) !== 'true' || !j.email) return null;
    if (Number(j.exp) * 1000 < Date.now()) return null;
    return { email: String(j.email).toLowerCase().slice(0, 120), name: clamp(j.name, 40) };
  } catch (e) { return null; }
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

  if (body.action === 'verify_google') {
    const g = await verifyGoogle(body.credential);
    if (!g) {
      return sendJson(res, 400, {
        ok: false,
        error: 'google_unverified',
        code: GOOGLE_CLIENT_ID ? 'invalid_token' : 'google_unconfigured'
      });
    }
    return sendJson(res, 200, { ok: true, email: g.email, name: g.name });
  }

  if (body.hp) return sendJson(res, 200, { ok: true, note: 'ignored' }); // 蜜罐

  // Google 已验证邮箱优先；买家自填的邮箱/号码作为备选
  let google = null;
  if (body.google_credential) google = await verifyGoogle(body.google_credential);

  let rawContact = body.contact;
  if (google && google.email) rawContact = google.email;
  if (!rawContact || typeof rawContact !== 'string') {
    return sendJson(res, 400, { ok: false, error: 'contact_required' });
  }

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
  const name = clamp(body.name, 40) || (google && google.name) || '';
  const intentKey = clamp(body.intent, 20);
  const intent = INTENTS[intentKey] || '';
  const itemId = clamp(body.item_id, 80);
  const itemTitle = clamp(body.item_title, 120);
  const consentAt = (body.consent === 'yes' || body.consent === true) ? new Date().toISOString() : '';

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

  const baseFields = {
    contact,
    contact_type: type,
    seller,
    source: clamp(body.source, 40),
    lang: body.lang === 'en' ? 'en' : 'zh',
    page: clamp(body.page, 120),
    created_at: new Date().toISOString(),
    status: 'active'
  };

  const context = {
    name,
    intent,
    itemId,
    itemTitle,
    consentAt
  };

  // 首选：完整字段（身份字段已建好时数据最整齐）
  const fullFields = Object.assign({}, baseFields, {
    follows: flattenFollows(body.follows),
    name,
    intent,
    item_id: itemId,
    item_title: itemTitle,
    consent_at: consentAt
  });

  // 兜底：身份字段还没建，全部打包进 follows，一条都不丢
  const compactFields = Object.assign({}, baseFields, {
    follows: mergeFollows(flattenFollows(body.follows), packContext(context))
  });

  function unset(obj) {
    Object.keys(obj).forEach((k) => { if (!obj[k]) delete obj[k]; });
    return obj;
  }

  // 只有"藏品页询价"（source=wa-gate 且带藏家）才提醒卖家；纯订阅不上门打扰藏家
  const isEnquiry = baseFields.source === 'wa-gate' && !!seller;
  async function maybeAlertSeller() {
    if (!isEnquiry) return false;
    try {
      return await notifyEnquiry({ seller, name, contact, type, intent, itemId, itemTitle, page: baseFields.page });
    } catch (e) { return false; }
  }

  try {
    const created = await atFetch(atUrl(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ records: [{ fields: unset(fullFields) }], typecast: true })
    });
    const id = created && created.records && created.records[0] && created.records[0].id;
    await maybeAlertSeller();
    return sendJson(res, 200, { ok: true, id: id || '', stored: 'full' });
  } catch (e) {
    const missingField = e.type === 'UNKNOWN_FIELD_NAME' || e.status === 422;
    if (missingField) {
      try {
        const created = await atFetch(atUrl(), {
          method: 'POST',
          headers,
          body: JSON.stringify({ records: [{ fields: unset(compactFields) }], typecast: true })
        });
        const id = created && created.records && created.records[0] && created.records[0].id;
        await maybeAlertSeller();
        return sendJson(res, 200, { ok: true, id: id || '', stored: 'compact' });
      } catch (e2) {
        const code2 = e2.type === 'TABLE_NOT_FOUND' ? 'table_missing'
          : e2.status === 429 ? 'rate_limited'
          : 'store_error';
        return sendJson(res, 202, { ok: false, code: code2 });
      }
    }
    // 表还没建 / 额度受限：不阻塞前端，只标记未同步
    const code = e.type === 'TABLE_NOT_FOUND' ? 'table_missing'
      : e.status === 429 ? 'rate_limited'
      : 'store_error';
    return sendJson(res, 202, { ok: false, code });
  }
};
