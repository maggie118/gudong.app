// scripts/send-new-items-push.js
// Web Push：检测新上架藏品并推送给已订阅用户（在 Vercel build 阶段、refresh 之后运行）。
// 点击通知跳转到新藏品页。
//
// 环境变量：
//   AIRTABLE_BASE_ID, AIRTABLE_TOKEN, AIRTABLE_TABLE(antiques),
//   PUSH_SUBS_TABLE(默认 push_subs),
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//
// 设计原则：任何失败都不阻断 build —— 拉不到/未配置就跳过并保留旧数据。
// 退出码：0 = 正常（含无新藏品/未配置跳过）；不会因推送失败使 build 失败。
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'data', 'listings.json');
const BASE = process.env.AIRTABLE_BASE_ID;
const TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = process.env.AIRTABLE_TABLE;
const SUBS_TABLE = process.env.PUSH_SUBS_TABLE || 'push_subs';
const SITE = process.env.PUSH_SITE_URL || 'https://www.gudong.app';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

function log(...a) { console.log('[send-new-items-push]', ...a); }

async function fetchAll(table) {
  const records = [];
  let offset = null;
  do {
    const url = new URL(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}`);
    url.searchParams.set('pageSize', '100');
    if (offset) url.searchParams.set('offset', offset);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let r;
    try {
      r = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${TOKEN}` },
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`airtable ${r.status}: ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    records.push(...(j.records || []));
    offset = j.offset || null;
  } while (offset);
  return records;
}

async function patchRecord(recId, fields) {
  const r = await fetch(
    `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}/${recId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`patch ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json();
}

async function run() {
  // 读 listings.json（refresh 刚写好）
  let listings;
  try {
    listings = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
  } catch (e) {
    log('no listings.json, skip');
    return;
  }
  const items = listings.newListing || [];
  if (!items.length) { log('no live items, skip'); return; }
  if (!BASE || !TOKEN || !TABLE) { log('missing AIRTABLE_* env, skip push'); return; }

  // 1) 拉 antiques 表，建 item_id → { recordId, notified }
  let records;
  try {
    records = await fetchAll(TABLE);
  } catch (e) { log('antiques fetch failed:', e.message); return; }
  const byId = {};
  for (const rec of records) {
    const f = rec.fields || {};
    const id = f.item_id || rec.id;
    const n = f.notified;
    byId[id] = { recId: rec.id, notified: n === true || n === 'true' || n === 1 };
  }

  // 2) 新藏品 = 在线 items 中尚未 notified 的
  const fresh = items.filter(it => byId[it.item_id] && !byId[it.item_id].notified);
  if (!fresh.length) { log('no new items to push'); return; }
  log('new items:', fresh.map(i => i.item_id).join(', '));

  // 3) VAPID 未配置 → 保留待推（配置后下次构建自动补推）
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
    log('VAPID env not configured, defer push for a later build');
    return;
  }

  // 4) 拉取有效订阅（2026-11-11 起订阅存 Cloudflare D1，Airtable push_subs 已停用）
  const DATA_URL = (process.env.GUDONG_DATA_URL || 'https://gudong-data-api.minqi118.workers.dev').replace(/\/+$/, '');
  const DATA_KEY = process.env.GUDONG_DATA_KEY || '';
  if (!DATA_KEY) { log('GUDONG_DATA_KEY 未配置，跳过推送（订阅表在 D1）'); return; }
  let subs;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let r;
    try {
      r = await fetch(`${DATA_URL}/push?limit=5000`, {
        headers: { 'x-gudong-key': DATA_KEY },
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    if (!r.ok) throw new Error(`push list ${r.status}`);
    const j = await r.json();
    subs = (j.subs || []).map(s => ({
      endpoint: s.endpoint,
      keys: { auth: s.auth, p256dh: s.p256dh },
      buyer_key: s.buyer_key || '',
    }));
  } catch (e) { log('subs fetch failed:', e.message); return; }
  const activeSubs = subs.filter(s => s.endpoint && s.keys && s.keys.auth && s.keys.p256dh);
  if (!activeSubs.length) { log('no active subscriptions, mark new items notified'); }
  else {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    // 5) 每个新藏品一条通知，推送给所有订阅；点击跳转到该藏品页
    let sent = 0, failed = 0;
    for (const it of fresh) {
      const titleZh = it.title_zh || it.item_id;
      const seller = it.seller_id || '';
      const payload = {
        title: 'gudong.app 上新',
        body: `${titleZh}${seller ? ' · ' + seller : ''}`,
        url: `${SITE}/items/${encodeURIComponent(it.item_id)}.html`,
        icon: `${SITE}/assets/icons/icon-192.png`,
        badge: `${SITE}/assets/icons/favicon-32x32.png`,
      };
      for (const sub of activeSubs) {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 86400 });
          sent++;
        } catch (e) {
          failed++;
          if (e.statusCode === 404 || e.statusCode === 410) {
            log('subscription expired', e.statusCode, String(sub.endpoint).slice(0, 40));
          }
        }
      }
    }
    log(`pushed ${sent} notifications (${failed} failed) for ${fresh.length} new items`);
  }

  // 6) 无论结果都标记已推送（避免下次重复检测/重复推送）
  for (const it of fresh) {
    try { await patchRecord(byId[it.item_id].recId, { notified: true }); }
    catch (e) { log('mark notified failed', it.item_id, e.message); }
  }
  log('marked notified:', fresh.map(i => i.item_id).join(', '));
}

run().catch(e => {
  log('unexpected error, build continues:', e.message);
});
