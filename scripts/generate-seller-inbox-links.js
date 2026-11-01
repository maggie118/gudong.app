#!/usr/bin/env node
// Generate private seller inbox links from the Airtable Sellers table.
// Never publish or commit generated links; each link grants access to all seller conversations.
const fs = require('fs');
const path = require('path');
const { createHmac } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const envFile = path.join(ROOT, '.env.production.local');
const requestedSellerIds = process.argv.slice(2);

function readEnv() {
  const values = Object.assign({}, process.env);
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!match || values[match[1]]) continue;
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
      else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      values[match[1]] = value;
    }
  }
  return values;
}
function expiryTimestamp(value) {
  if (!value) return NaN;
  const raw = String(value).trim();
  // Airtable date-only values remain valid through the end of that date (UTC).
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(raw + 'T23:59:59.999Z')
    : new Date(raw);
  return date.getTime();
}
function makeToken(secret, sellerId, expires) {
  const payload = Buffer.from(JSON.stringify({ scope: 'seller_inbox', seller_id: sellerId, exp: expires })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}
function isPaid(value) {
  return ['paid', '已付款', '已支付', '付款完成'].includes(String(value || '').trim().toLowerCase());
}
async function fetchAllSellers(baseId, token, table) {
  const records = [];
  let offset = '';
  do {
    const url = new URL('https://api.airtable.com/v0/' + encodeURIComponent(baseId) + '/' + encodeURIComponent(table));
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!response.ok) throw new Error('Airtable Sellers read failed (' + response.status + '). Check token access and AIRTABLE_SELLERS_TABLE.');
    const page = await response.json();
    records.push(...(page.records || []));
    offset = page.offset || '';
  } while (offset);
  return records;
}

(async () => {
  const env = readEnv();
  const secret = env.CHAT_REPLY_SECRET;
  const baseId = env.AIRTABLE_BASE_ID;
  const airtableToken = env.CHAT_AIRTABLE_TOKEN;
  const sellersTable = env.AIRTABLE_SELLERS_TABLE;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('CHAT_REPLY_SECRET must be configured and at least 32 bytes.');
  if (!baseId || !airtableToken || !sellersTable) throw new Error('Configure AIRTABLE_BASE_ID, CHAT_AIRTABLE_TOKEN, and AIRTABLE_SELLERS_TABLE in .env.production.local.');
  const records = await fetchAllSellers(baseId, airtableToken, sellersTable);
  const sellers = records.map(record => ({
    id: String((record.fields || {}).seller_id || '').trim(),
    paymentStatus: (record.fields || {}).booth_payment_status,
    expiry: expiryTimestamp((record.fields || {}).booth_expiry_date)
  })).filter(seller => seller.id);
  const wanted = requestedSellerIds.length ? new Set(requestedSellerIds) : null;
  if (wanted) {
    const missing = [...wanted].filter(id => !sellers.some(seller => seller.id === id));
    if (missing.length) throw new Error('seller_id not found in Airtable: ' + missing.join(', '));
  }
  const selected = sellers.filter(seller => !wanted || wanted.has(seller.id));
  const now = Date.now();
  const eligible = selected.filter(seller => isPaid(seller.paymentStatus) && Number.isFinite(seller.expiry) && seller.expiry > now);
  const skipped = selected.filter(seller => !eligible.includes(seller));
  for (const seller of eligible) {
    const link = 'https://www.gudong.app/seller-inbox.html#token=' + encodeURIComponent(makeToken(secret, seller.id, seller.expiry));
    console.log(seller.id + '\t' + new Date(seller.expiry).toISOString() + '\t' + link);
  }
  for (const seller of skipped) {
    const reason = !isPaid(seller.paymentStatus) ? 'not marked paid' : !Number.isFinite(seller.expiry) ? 'missing/invalid booth_expiry_date' : 'subscription expired';
    console.error('Skipped ' + seller.id + ': ' + reason + '.');
  }
  if (!eligible.length) console.error('No eligible seller links generated. Set booth_payment_status to "paid" and booth_expiry_date to a future date in Airtable.');
  else console.error('\nGenerated ' + eligible.length + ' private link(s). Each expires at booth_expiry_date. Share privately; possession grants access to all conversations for that seller.');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
