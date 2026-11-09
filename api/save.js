// api/save.js
// 藏品「收藏 / 关注」的匿名计数埋点：POST /api/save
//   { item_id, seller, anon, action: 'save' | 'unsave' }
// 只往 Airtable 表 item_saves 写匿名记录（anon 是浏览器本地随机 id，无姓名、无联系方式），
// 不通知藏家、不进买家名单、不产生任何可识别个人的数据。
// 藏家侧只看到汇总数字（近 30 天 N 人收藏），由 /api/interest 提供。
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_SAVES_TABLE || 'item_saves';

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
function formula(a, b) {
  const esc = (v) => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  return 'AND({item_id}=' + esc(a) + ',{anon}=' + esc(b) + ')';
}
async function at(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) { json = {}; }
  if (!response.ok) throw new Error('airtable ' + response.status + ' ' + text.slice(0, 200));
  return json;
}

module.exports = async function handler(req, res) {
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
  if (!BASE || !TOKEN) return sendJson(res, 202, { ok: false, code: 'store_unconfigured' });

  const headers = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
  const root = 'https://api.airtable.com/v0/' + encodeURIComponent(BASE) + '/' + encodeURIComponent(TABLE);

  try {
    const url = new URL(root);
    url.searchParams.set('filterByFormula', formula(itemId, anon));
    url.searchParams.set('maxRecords', '1');
    const found = await at(url.toString(), { headers });
    const rec = found.records && found.records[0];

    if (action === 'unsave') {
      if (rec && (!rec.fields || rec.fields.status !== 'removed')) {
        await at(root + '/' + rec.id, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ fields: { status: 'removed' }, typecast: true })
        });
      }
      return sendJson(res, 200, { ok: true, saved: false });
    }

    if (rec) {
      // 已经收藏过：不重复计数，只在被取消过后恢复
      if (rec.fields && rec.fields.status === 'removed') {
        await at(root + '/' + rec.id, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ fields: { status: 'active', created_at: new Date().toISOString() }, typecast: true })
        });
      }
      return sendJson(res, 200, { ok: true, saved: true, dup: true });
    }

    const fields = { item_id: itemId, anon, created_at: new Date().toISOString(), status: 'active' };
    if (seller) fields.seller = seller;
    await at(root, { method: 'POST', headers, body: JSON.stringify({ records: [{ fields }], typecast: true }) });
    return sendJson(res, 200, { ok: true, saved: true });
  } catch (e) {
    const code = /TABLE_NOT_FOUND/.test(e.message) ? 'table_missing' : 'store_error';
    return sendJson(res, 202, { ok: false, code, detail: String(e.message).slice(0, 220) });
  }
};
