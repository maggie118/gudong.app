// cloudflare/worker.js
// gudong.app 的「机器产生的数据」存储层：D1（Cloudflare SQLite）
// 承接：收藏 / 关注计数、站内私信（买家 ↔ 藏家）
// 只由 gudong.app 的 Vercel 函数调用，靠 x-gudong-key 共享密钥鉴权，不直接对外。
//
// 部署：Cloudflare Worker「gudong-data-api」
//   绑定 DB -> D1 gudong-data
//   机密 INTERNAL_KEY -> 与 Vercel 端 GUDONG_DATA_KEY 相同

const DAY = 24 * 60 * 60 * 1000;

function json(data, code = 200) {
  return new Response(JSON.stringify(data), {
    status: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function okId(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

function normalize(row) {
  return {
    id: row.id,
    client_id: row.client_id || '',
    sender_type: row.sender_type || 'buyer',
    content: row.content || '',
    created_at: row.created_at,
    buyer_tmp_id: row.buyer_tmp_id || '',
    buyer_label: row.buyer_label || '',
    item_title: row.item_title || '',
    item_id: row.item_id || '',
    seller_id: row.seller_id || '',
    is_read_by_seller: row.read_by_seller === 1
  };
}

// ---- 收藏 / 关注 ----
async function save(env, body) {
  const itemId = str(body.item_id, 80);
  const anon = str(body.anon, 64);
  const seller = str(body.seller, 80);
  const action = body.action === 'unsave' ? 'unsave' : 'save';
  if (!okId(itemId, /^item-[a-z0-9-]{1,70}$/i) || !okId(anon, /^[a-z0-9]{8,64}$/i)) {
    return json({ ok: false, error: 'invalid_payload' }, 400);
  }
  const now = new Date().toISOString();
  const row = await env.DB.prepare('SELECT status FROM saves WHERE item_id = ? AND anon = ?')
    .bind(itemId, anon).first();

  if (action === 'unsave') {
    if (row && row.status !== 'removed') {
      await env.DB.prepare('UPDATE saves SET status = ?, updated_at = ? WHERE item_id = ? AND anon = ?')
        .bind('removed', now, itemId, anon).run();
    }
    return json({ ok: true, saved: false });
  }
  if (row) {
    if (row.status === 'active') return json({ ok: true, saved: true, dup: true });
    await env.DB.prepare('UPDATE saves SET status = ?, updated_at = ? WHERE item_id = ? AND anon = ?')
      .bind('active', now, itemId, anon).run();
    return json({ ok: true, saved: true });
  }
  await env.DB.prepare('INSERT INTO saves (item_id, seller, anon, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(itemId, seller, anon, 'active', now, now).run();
  return json({ ok: true, saved: true });
}

async function interest(env, url) {
  const seller = str(url.searchParams.get('seller'), 80);
  if (!okId(seller, /^[a-z0-9-]{2,80}$/i)) return json({ error: 'invalid_seller' }, 400);
  const cutoff = new Date(Date.now() - 30 * DAY).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(DISTINCT anon) AS n FROM saves WHERE seller = ? AND status = 'active' AND updated_at >= ?"
  ).bind(seller, cutoff).first();
  const total = await env.DB.prepare(
    "SELECT COUNT(DISTINCT anon) AS n FROM saves WHERE seller = ? AND status = 'active'"
  ).bind(seller).first();
  return json({
    seller_id: seller,
    saves_30d: (recent && recent.n) || 0,
    saves_total: (total && total.n) || 0,
    views_30d: 0,
    tracked: true
  });
}

// ---- 站内私信 ----
async function messagesFor(env, itemId, sellerId, buyerId) {
  const result = await env.DB.prepare(
    'SELECT * FROM messages WHERE item_id = ? AND seller_id = ? AND buyer_tmp_id = ? ORDER BY created_at ASC LIMIT 300'
  ).bind(itemId, sellerId, buyerId).all();
  return (result.results || []);
}

async function buyerConversation(env, url) {
  const itemId = str(url.searchParams.get('item_id'), 80);
  const sellerId = str(url.searchParams.get('seller_id'), 80);
  const buyerId = url.searchParams.get('buyer_tmp_id') || '';
  if (!okId(itemId, /^item-[a-z0-9-]{1,70}$/i) ||
      !okId(sellerId, /^[a-z0-9-]{2,80}$/i) ||
      !okId(buyerId, /^[0-9a-f-]{36}$/i)) {
    return json({ error: 'invalid_conversation' }, 400);
  }
  const rows = await messagesFor(env, itemId, sellerId, buyerId);
  await env.DB.prepare(
    "UPDATE messages SET read_by_buyer = 1 WHERE item_id = ? AND seller_id = ? AND buyer_tmp_id = ? AND sender_type = 'seller' AND read_by_buyer = 0"
  ).bind(itemId, sellerId, buyerId).run();
  return json({ messages: rows.map(normalize) });
}

async function createBuyerMessage(env, body) {
  const itemId = str(body.item_id, 80);
  const sellerId = str(body.seller_id, 80);
  const buyerId = body.buyer_tmp_id || '';
  const clientId = body.client_id || '';
  const content = str(body.content, 1000);
  const buyerLabel = str(body.buyer_label, 32);
  const itemTitle = str(body.item_title, 180);
  if (!okId(itemId, /^item-[a-z0-9-]{1,70}$/i) ||
      !okId(sellerId, /^[a-z0-9-]{2,80}$/i) ||
      !okId(buyerId, /^[0-9a-f-]{36}$/i) ||
      !okId(clientId, /^[0-9a-f-]{36}$/i) || !content) {
    return json({ error: 'invalid_message' }, 400);
  }
  const prior = await env.DB.prepare('SELECT * FROM messages WHERE client_id = ?').bind(clientId).first();
  if (prior) return json({ message: normalize(prior), duplicate: true }, 201);

  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare(
    'INSERT INTO messages (item_id, seller_id, buyer_tmp_id, buyer_label, item_title, sender_type, client_id, content, created_at, read_by_seller, read_by_buyer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)'
  ).bind(itemId, sellerId, buyerId, buyerLabel, itemTitle, 'buyer', clientId, content, createdAt).run();
  const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(result.meta.last_row_id).first();
  return json({ message: normalize(row), notification_sent: false }, 201);
}

async function sellerThreads(env, url) {
  const sellerId = str(url.searchParams.get('seller_id'), 80);
  if (!okId(sellerId, /^[a-z0-9-]{2,80}$/i)) return json({ error: 'invalid_seller' }, 400);
  const result = await env.DB.prepare(
    'SELECT * FROM messages WHERE seller_id = ? ORDER BY created_at DESC LIMIT 500'
  ).bind(sellerId).all();
  const rows = result.results || [];
  const threads = new Map();
  for (const row of rows) {
    const key = row.item_id + '|' + row.buyer_tmp_id;
    let thread = threads.get(key);
    if (!thread) {
      thread = {
        item_id: row.item_id,
        item_title: row.item_title || '',
        buyer_tmp_id: row.buyer_tmp_id,
        buyer_label: row.buyer_label || '',
        last_message: row.content,
        last_at: row.created_at,
        unread_count: 0
      };
      threads.set(key, thread);
    }
    if (row.sender_type === 'buyer' && row.read_by_seller !== 1) thread.unread_count += 1;
  }
  return json({ seller_id: sellerId, threads: Array.from(threads.values()) });
}

async function sellerConversation(env, url) {
  const sellerId = str(url.searchParams.get('seller_id'), 80);
  const itemId = str(url.searchParams.get('item_id'), 80);
  const buyerId = url.searchParams.get('buyer_tmp_id') || '';
  if (!okId(sellerId, /^[a-z0-9-]{2,80}$/i) ||
      !okId(itemId, /^item-[a-z0-9-]{1,70}$/i) ||
      !okId(buyerId, /^[0-9a-f-]{36}$/i)) {
    return json({ error: 'invalid_conversation' }, 400);
  }
  const rows = await messagesFor(env, itemId, sellerId, buyerId);
  if (!rows.length) return json({ error: 'conversation_not_found' }, 404);
  await env.DB.prepare(
    "UPDATE messages SET read_by_seller = 1 WHERE item_id = ? AND seller_id = ? AND buyer_tmp_id = ? AND sender_type = 'buyer' AND read_by_seller = 0"
  ).bind(itemId, sellerId, buyerId).run();
  return json({ messages: rows.map(normalize) });
}

async function createSellerReply(env, body) {
  const itemId = str(body.item_id, 80);
  const sellerId = str(body.seller_id, 80);
  const buyerId = body.buyer_tmp_id || '';
  const clientId = body.client_id || '';
  const content = str(body.content, 1000);
  if (!okId(itemId, /^item-[a-z0-9-]{1,70}$/i) ||
      !okId(sellerId, /^[a-z0-9-]{2,80}$/i) ||
      !okId(buyerId, /^[0-9a-f-]{36}$/i) ||
      !okId(clientId, /^[0-9a-f-]{36}$/i) || !content) {
    return json({ error: 'invalid_reply' }, 400);
  }
  const prior = await env.DB.prepare('SELECT * FROM messages WHERE client_id = ?').bind(clientId).first();
  if (prior) return json({ message: normalize(prior) }, 201);

  const rows = await messagesFor(env, itemId, sellerId, buyerId);
  if (!rows.some((row) => row.sender_type === 'buyer')) return json({ error: 'conversation_not_found' }, 404);
  const sample = rows[0];
  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare(
    'INSERT INTO messages (item_id, seller_id, buyer_tmp_id, buyer_label, item_title, sender_type, client_id, content, created_at, read_by_seller, read_by_buyer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)'
  ).bind(itemId, sellerId, buyerId, sample.buyer_label || '', sample.item_title || '', 'seller', clientId, content, createdAt).run();
  const row = await env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(result.meta.last_row_id).first();
  return json({ message: normalize(row) }, 201);
}

// ---- 买家身份（Google 或邮箱，一次登记长期有效）----
async function buyerUpsert(env, body) {
  const email = str(body.email, 120).toLowerCase();
  const name = str(body.name, 40);
  const source = body.source === 'google' ? 'google' : 'email';
  const googleSub = str(body.google_sub, 80);
  const itemId = str(body.item_id, 80);
  if (!okId(email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/)) return json({ error: 'invalid_email' }, 400);

  const now = new Date().toISOString();
  const prior = await env.DB.prepare('SELECT * FROM buyers WHERE email = ?').bind(email).first();
  if (prior) {
    await env.DB.prepare('UPDATE buyers SET last_seen = ?, name = ?, google_sub = ? WHERE email = ?')
      .bind(now, name || prior.name || '', googleSub || prior.google_sub || '', email).run();
    return json({
      buyer_id: prior.buyer_id,
      email: prior.email,
      name: name || prior.name || '',
      source: prior.source,
      returning: true
    });
  }
  const buyerId = 'b_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  await env.DB.prepare(
    'INSERT INTO buyers (buyer_id, email, name, source, google_sub, first_item, consent_at, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(buyerId, email, name, source, googleSub, itemId, now, now, now).run();
  return json({ buyer_id: buyerId, email: email, name: name, source: source, returning: false });
}

async function buyerList(env, url) {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200);
  const result = await env.DB.prepare(
    'SELECT buyer_id, email, name, source, first_item, created_at, last_seen FROM buyers ORDER BY last_seen DESC LIMIT ?'
  ).bind(limit).all();
  return json({ buyers: result.results || [] });
}

// ---- 买家帐户：收藏 / 关注（跟着身份走，换设备不丢）----
// buyer_key = D1 buyers.buyer_id（Google/邮箱登录后拿到）；没有 buyer_id 的老身份退回用邮箱。
function buyerKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 120) : '';
  return /^[a-z0-9_@.\-]{4,120}$/.test(key) ? key : '';
}

async function favUpsert(env, body) {
  const key = buyerKey(body.buyer_key);
  const itemId = str(body.item_id, 80);
  if (!key || !okId(itemId, /^item-[a-z0-9-]{1,70}$/i)) return json({ error: 'invalid_favorite' }, 400);
  const now = new Date().toISOString();
  if (body.action === 'unsave') {
    await env.DB.prepare('DELETE FROM favorites WHERE buyer_key = ? AND item_id = ?').bind(key, itemId).run();
    return json({ ok: true, saved: false });
  }
  const seller = str(body.seller, 80);
  const title = str(body.title, 120);
  await env.DB.prepare(
    'INSERT INTO favorites (buyer_key, item_id, seller, title, created_at) VALUES (?, ?, ?, ?, ?) ' +
    "ON CONFLICT(buyer_key, item_id) DO UPDATE SET " +
    "seller = CASE WHEN excluded.seller <> '' THEN excluded.seller ELSE favorites.seller END, " +
    "title = CASE WHEN excluded.title <> '' THEN excluded.title ELSE favorites.title END"
  ).bind(key, itemId, seller, title, now).run();
  return json({ ok: true, saved: true });
}

async function followUpsert(env, body) {
  const key = buyerKey(body.buyer_key);
  const kind = body.kind === 'category' ? 'category' : 'seller';
  const target = str(body.target, 80).toLowerCase();
  // 藏家 ID 是英文短横线串；品类是中文词（瓷器 / 玉器 …），两种都要放过
  const targetOk = kind === 'category'
    ? /^[\u4e00-\u9fa5a-z0-9 -]{1,40}$/.test(target)
    : /^[a-z0-9-]{2,80}$/.test(target);
  if (!key || !targetOk) return json({ error: 'invalid_follow' }, 400);
  const now = new Date().toISOString();
  if (body.action === 'off') {
    await env.DB.prepare('DELETE FROM follows WHERE buyer_key = ? AND kind = ? AND target = ?')
      .bind(key, kind, target).run();
    return json({ ok: true, following: false });
  }
  const label = str(body.label, 80);
  await env.DB.prepare(
    'INSERT INTO follows (buyer_key, kind, target, label, created_at) VALUES (?, ?, ?, ?, ?) ' +
    "ON CONFLICT(buyer_key, kind, target) DO UPDATE SET " +
    "label = CASE WHEN excluded.label <> '' THEN excluded.label ELSE follows.label END"
  ).bind(key, kind, target, label, now).run();
  return json({ ok: true, following: true });
}

async function accountPull(env, url) {
  const key = buyerKey(url.searchParams.get('buyer_key'));
  if (!key) return json({ error: 'invalid_buyer' }, 400);
  const favs = await env.DB.prepare(
    'SELECT item_id, seller, title, created_at FROM favorites WHERE buyer_key = ? ORDER BY created_at DESC LIMIT 300'
  ).bind(key).all();
  const follows = await env.DB.prepare(
    'SELECT kind, target, label, created_at FROM follows WHERE buyer_key = ? ORDER BY created_at DESC LIMIT 200'
  ).bind(key).all();
  return json({ favorites: favs.results || [], follows: follows.results || [] });
}

/* ---- Web Push 订阅（浏览器推送，不再是 Airtable push_subs）---- */
async function pushUpsert(env, body) {
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim().slice(0, 500) : '';
  if (!/^https:\/\//i.test(endpoint)) return json({ error: 'invalid_endpoint' }, 400);
  if (body.action === 'off') {
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(endpoint).run();
    return json({ ok: true, active: false });
  }
  const p256dh = str(body.p256dh, 200);
  const auth = str(body.auth, 100);
  if (!p256dh || !auth) return json({ error: 'invalid_keys' }, 400);
  const key = buyerKey(body.buyer_key);
  const now = new Date().toISOString();
  await env.DB.prepare(
    'INSERT INTO push_subs (endpoint, p256dh, auth, buyer_key, contact, contact_type, seller, source, created_at, last_seen) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ' +
    'ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, ' +
    "buyer_key = CASE WHEN excluded.buyer_key <> '' THEN excluded.buyer_key ELSE push_subs.buyer_key END, " +
    "contact = CASE WHEN excluded.contact <> '' THEN excluded.contact ELSE push_subs.contact END, " +
    'last_seen = excluded.last_seen'
  ).bind(
    endpoint, p256dh, auth, key, str(body.contact, 120), str(body.contact_type, 20),
    str(body.seller, 60), str(body.source, 40), now, now
  ).run();
  return json({ ok: true, active: true });
}

async function pushList(env, url) {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 2000, 5000);
  const rows = await env.DB.prepare(
    'SELECT endpoint, p256dh, auth, buyer_key, contact, contact_type, seller FROM push_subs ORDER BY last_seen DESC LIMIT ?'
  ).bind(limit).all();
  return json({ subs: rows.results || [] });
}

/* ---- 邮件上新通知订阅（Resend 发信，免费额度够用） ---- */
function mailOk(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 120) : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : '';
}

async function mailToken(email, env) {
  const data = enc.encode(email + ':' + (env.INTERNAL_KEY || 'x'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(digest).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

async function mailUpsert(env, body) {
  const email = mailOk(body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);
  const now = new Date().toISOString();
  if (body.action === 'off') {
    await env.DB.prepare('UPDATE mail_subs SET active = 0 WHERE email = ?').bind(email).run();
    return json({ ok: true, active: false });
  }
  const key = buyerKey(body.buyer_key);
  await env.DB.prepare(
    'INSERT INTO mail_subs (email, buyer_key, seller, source, active, created_at, last_seen) VALUES (?, ?, ?, ?, 1, ?, ?) ' +
    'ON CONFLICT(email) DO UPDATE SET active = 1, last_seen = excluded.last_seen, ' +
    "buyer_key = CASE WHEN excluded.buyer_key <> '' THEN excluded.buyer_key ELSE mail_subs.buyer_key END"
  ).bind(email, key, str(body.seller, 60), str(body.source, 40), now, now).run();
  return json({ ok: true, active: true });
}

async function mailList(env) {
  const rows = await env.DB.prepare(
    'SELECT email, buyer_key FROM mail_subs WHERE active = 1 LIMIT 2000'
  ).all();
  return json({ emails: rows.results || [] });
}

/* 邮件里的退订链接：公开访问，只凭 token 校验 */
async function mailOffByLink(env, url) {
  const email = mailOk(url.searchParams.get('e'));
  const token = str(url.searchParams.get('t'), 40);
  if (!email || !token) return json({ error: 'invalid_link' }, 400);
  if (token !== await mailToken(email, env)) return json({ error: 'invalid_token' }, 403);
  await env.DB.prepare('UPDATE mail_subs SET active = 0 WHERE email = ?').bind(email).run();
  return new Response(
    '<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui;padding:40px;line-height:1.8}</style>' +
    '<h2>已退订 Gudong 上新邮件</h2><p>以后不会再收到上新通知。想重新订阅，到「我的帐户 · 我关注的」再勾一次即可。</p>',
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

async function sendMail(env, to, items, token) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: true };
  const from = env.MAIL_FROM || 'Gudong 古董圈 <notify@gudong.app>';
  const site = (env.SITE_URL || 'https://www.gudong.app').replace(/\/+$/, '');
  const off = site.replace('//www.', '//gudong-data-api.minqi118.workers.dev') +
    '/mail/off?e=' + encodeURIComponent(to) + '&t=' + token;
  const list = Array.isArray(items) ? items : [items];
  const single = list.length === 1;
  const rows = list.map(it =>
    '<tr><td style="padding:14px 0;border-bottom:1px solid #EDE8E0">' +
    '<a href="' + it.url + '" style="color:#25221E;text-decoration:none;font-family:Georgia,serif;font-size:17px">' +
    escHtml(it.title) + '</a>' +
    '<div style="color:#9A938A;font-size:12px;margin-top:4px">' + escHtml(it.category || '') +
    (it.seller ? ' · ' + escHtml(it.seller) : '') + '</div></td></tr>').join('');
  const html =
    '<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#25221E">' +
    '<div style="font-size:12px;letter-spacing:.18em;color:#B08A45;text-transform:uppercase">Gudong · 今日上新</div>' +
    (single
      ? '<h2 style="font-family:Georgia,serif;font-weight:500;margin:10px 0 6px">' + escHtml(list[0].title) + '</h2>' +
        '<div style="color:#716B63;font-size:14px">' + escHtml(list[0].category || '') +
        (list[0].seller ? ' · ' + escHtml(list[0].seller) : '') + '</div>' +
        '<p style="margin:22px 0"><a href="' + list[0].url + '" style="display:inline-block;background:#6F4A31;color:#fff;' +
        'padding:11px 22px;border-radius:3px;text-decoration:none">查看这件藏品 →</a></p>'
      : '<h2 style="font-family:Georgia,serif;font-weight:500;margin:10px 0 4px">今天上新 ' + list.length + ' 件</h2>' +
        '<div style="color:#716B63;font-size:14px">都是你关注的品类 / 藏家</div>' +
        '<table style="width:100%;border-collapse:collapse;margin:18px 0">' + rows + '</table>' +
        '<p style="margin:6px 0 20px"><a href="' + site + '/collection" style="display:inline-block;background:#6F4A31;color:#fff;' +
        'padding:11px 22px;border-radius:3px;text-decoration:none">去藏品库看全部 →</a></p>') +
    '<p style="font-size:12px;color:#9A938A;line-height:1.8">你是因为关注了这些品类 / 藏家才收到这封信。' +
    '<a href="' + off + '" style="color:#9A938A">退订上新邮件</a></p></div>';

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject: single ? '上新 · ' + list[0].title : '今日上新 ' + list.length + ' 件 · Gudong',
      html
    })
  });
  return { ok: r.ok, status: r.status };
}

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ================= Web Push 发送（Cloudflare 定时任务） =================
   2026-11-11：推送从 Vercel 构建阶段搬到这里。
   - 订阅在 D1 push_subs，已发过的藏品在 D1 push_sent
   - 新上架从站点 data/listings.json 读（不碰 Airtable，Airtable 侧 notified 那条链已断）
   - 按 D1 follows 匹配：关注了该品类 / 该藏家的订阅才收；没身份的订阅（直接点铃铛）照收
   - 加密按 RFC 8291 aes128gcm，签名按 RFC 8292 VAPID（纯 WebCrypto，无需 npm 包）
*/
const enc = new TextEncoder();

function b64u(bytes) {
  const b = typeof bytes === 'string' ? enc.encode(bytes) : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concatBytes() {
  let len = 0;
  for (const a of arguments) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arguments) { out.set(a, off); off += a.length; }
  return out;
}

async function hkdf(salt, ikm, info, bits) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const buf = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, bits
  );
  return new Uint8Array(buf);
}

/* 把 VAPID 私钥（base64url d）与公钥（base64url 65 字节）拼成 WebCrypto EC 私钥 */
async function vapidKey(publicKey, privateKey) {
  const pub = unb64u(publicKey);
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    d: b64u(unb64u(privateKey)),
    x: b64u(pub.slice(1, 33)),
    y: b64u(pub.slice(33, 65)),
    key_ops: ['sign']
  };
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

function derToRaw(sig) {
  const bytes = new Uint8Array(sig);
  if (bytes.length === 64) return bytes;
  /* DER: 30 len 02 rlen r 02 slen s */
  let i = 2;
  if (bytes[i] !== 0x02) return bytes;
  const rlen = bytes[i + 1]; i += 2;
  let r = bytes.slice(i, i + rlen); i += rlen;
  if (bytes[i] !== 0x02) return bytes;
  const slen = bytes[i + 1]; i += 2;
  let s = bytes.slice(i, i + slen);
  const rr = new Uint8Array(32), ss = new Uint8Array(32);
  rr.set(r.slice(-32)); ss.set(s.slice(-32));
  return concatBytes(rr, ss);
}

async function vapidHeaders(endpoint, env) {
  const pub = env.VAPID_PUBLIC_KEY;
  const priv = await vapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const sub = env.VAPID_SUBJECT || 'mailto:contact@gudong.app';
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: now + 12 * 3600, sub }));
  const unsigned = head + '.' + body;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, priv, enc.encode(unsigned)
  );
  return {
    Authorization: 'vapid t=' + unsigned + '.' + b64u(derToRaw(sig)) + ', k=' + pub
  };
}

/* RFC 8291：aes128gcm 单记录 */
async function encryptPush(sub, payloadText) {
  const uaPub = unb64u(sub.p256dh);
  const uaKeys = await crypto.subtle.importKey(
    'raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  );
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  );
  const asPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const secret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKeys }, pair.privateKey, 256
  ));
  const authSecret = unb64u(sub.auth);
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);

  /* 第一段 HKDF：用 auth 作为 salt，info 绑定双方公钥 */
  const ikm = await hkdf(
    authSecret, secret, concatBytes(enc.encode('WebPush: info'), new Uint8Array([0]), uaPub, asPubRaw), 256
  );
  const cek = await hkdf(salt, ikm, concatBytes(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 128);
  const nonce = await hkdf(salt, ikm, concatBytes(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 96);

  /* 明文 + 0x02 分隔符（单记录不分包，rs=4096） */
  const plain = concatBytes(enc.encode(payloadText), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, plain));

  const header = concatBytes(
    salt,
    new Uint8Array([0, 0, 0x10, 0]), /* rs = 4096 */
    new Uint8Array([65]),           /* keyid 长度 65 = 未压缩 P-256 公钥 */
    asPubRaw
  );
  return concatBytes(header, ct);
}

async function sendOne(env, sub, payload) {
  const headers = await vapidHeaders(sub.endpoint, env);
  const body = await encryptPush(sub, JSON.stringify(payload));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: Object.assign({
      TTL: '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream'
    }, headers),
    body
  });
  return { ok: r.ok || r.status === 201, status: r.status, text: r.ok ? '' : (await r.text()).slice(0, 120) };
}

/* 2026-11-11：每次运行都留一条记录，避免"到底跑没跑"只能靠猜。
   以前只能从 push_sent 的 sent_at 反推，没新品时一片空白，用户会以为系统坏了。 */
async function logRun(env, row) {
  try {
    await env.DB.prepare(
      'INSERT INTO push_runs (run_at, trigger, items, delivered, mails, note) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(run_at) DO NOTHING'
    ).bind(
      new Date().toISOString(),
      String((row && row.trigger) || ''),
      Number((row && row.items) || 0),
      Number((row && row.delivered) || 0),
      Number((row && row.mails) || 0),
      String((row && row.note) || '').slice(0, 160)
    ).run();
  } catch (e) {}
}

async function pushJob(env, opts) {
  const trigger = (opts && opts.trigger) || 'cron';
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    await logRun(env, { trigger, note: 'skip: no_vapid' });
    return { skipped: 'no_vapid' };
  }
  const site = (env.SITE_URL || 'https://www.gudong.app').replace(/\/+$/, '');
  const dry = !!(opts && opts.dry);

  let listings;
  try {
    const r = await fetch(site + '/data/listings.json', { headers: { 'cache-control': 'no-cache' } });
    if (!r.ok) {
      await logRun(env, { trigger, note: 'skip: listings_' + r.status });
      return { skipped: 'listings_' + r.status };
    }
    listings = await r.json();
  } catch (e) {
    await logRun(env, { trigger, note: 'skip: listings_error' });
    return { skipped: 'listings_error' };
  }

  const items = (listings.newListing || []).map(it => ({
    id: it.item_id || '',
    title: it.title_zh || it.item_id || '',
    seller: it.seller_id || '',
    category: it.category || '',
    url: site + '/items/' + encodeURIComponent(it.item_id || '') + '.html'
  })).filter(it => it.id);

  const sentRows = await env.DB.prepare('SELECT item_id FROM push_sent').all();
  const sent = new Set((sentRows.results || []).map(r => r.item_id));

  /* 首次运行：把现有藏品登记为已发，避免一上线就把库存全推一遍 */
  if (!sent.size) {
    const now = new Date().toISOString();
    for (const it of items) {
      await env.DB.prepare('INSERT INTO push_sent (item_id, sent_at) VALUES (?, ?) ON CONFLICT(item_id) DO NOTHING')
        .bind(it.id, now).run();
    }
    return { bootstrapped: items.length };
  }

  /* 2026-11-11：改成"每日摘要"。cron 一天只跑一次，所以一次运行就是一天的上新。
     一个订阅者一天最多收 1 条推送 + 1 封邮件，里面按他关注的品类/藏家汇总；
     以前是每件一条，3 件新品 = 3 条通知 + 3 封信。 */
  const DIGEST_MAX = 12;
  const fresh = items.filter(it => !sent.has(it.id)).slice(0, DIGEST_MAX);
  if (!fresh.length) {
    await logRun(env, { trigger, note: 'ok: no_new_items (total ' + items.length + ')' });
    return { sent: 0, note: 'no_new_items' };
  }
  if (dry) {
    await logRun(env, { trigger, items: fresh.length, note: 'dry: ' + fresh.map(it => it.id).join(',') });
    return { dry: true, fresh };
  }

  const subs = (await env.DB.prepare(
    'SELECT endpoint, p256dh, auth, buyer_key FROM push_subs LIMIT 1000'
  ).all()).results || [];
  const followsAll = (await env.DB.prepare(
    'SELECT buyer_key, kind, target FROM follows LIMIT 5000'
  ).all()).results || [];
  let mailRows = [];
  if (env.RESEND_API_KEY) {
    mailRows = ((await env.DB.prepare('SELECT email, buyer_key FROM mail_subs WHERE active = 1 LIMIT 2000').all()).results) || [];
  }

  /* 有身份的按 follows 匹配；没身份的（只点了铃铛 / 没登录的邮箱）照收全部 */
  const hits = (buyerKey, it) => !buyerKey || followsAll.some(f => f.buyer_key === buyerKey &&
    ((f.kind === 'category' && it.category && String(f.target) === it.category) ||
     (f.kind === 'seller' && it.seller && String(f.target).toLowerCase() === it.seller.toLowerCase())));
  const digestFor = buyerKey => fresh.filter(it => hits(buyerKey, it));

  const day = new Date().toISOString().slice(0, 10);
  const payloadFor = list => {
    if (list.length === 1) {
      const it = list[0];
      return {
        title: 'gudong.app 上新 · ' + (it.category || '新藏品'),
        body: it.title + (it.seller ? ' · ' + it.seller : ''),
        url: it.url, tag: 'gd-' + it.id, day, icon: site + '/assets/icons/icon-192.png'
      };
    }
    return {
      title: '今日上新 ' + list.length + ' 件',
      body: list.slice(0, 2).map(it => it.title).join('、') + (list.length > 2 ? ' 等' : ''),
      url: site + '/collection', tag: 'gd-digest-' + day, day, icon: site + '/assets/icons/icon-192.png'
    };
  };

  let delivered = 0, gone = 0, matched = 0, mails = 0, mailFailed = 0;
  const errs = [];

  for (const sub of subs) {
    const list = digestFor(sub.buyer_key);
    if (!list.length) continue;
    matched++;
    try {
      const res = await sendOne(env, sub, payloadFor(list));
      if (res.ok) delivered++;
      else if (res.status === 404 || res.status === 410) {
        await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
        gone++;
      } else {
        const msg = String(res.text || '');
        errs.push('http ' + res.status + ' ' + msg.slice(0, 160));
        /* 403 且是 VAPID 对不上：这条订阅是用旧钥匙签的，留着永远发不出去，清掉让用户重订 */
        if (res.status === 403 && /vapid/i.test(msg)) {
          await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(sub.endpoint).run();
          gone++;
        }
      }
    } catch (e) {
      errs.push(String((e && e.message) || e).slice(0, 200));
    }
  }

  for (const m of mailRows) {
    const list = digestFor(m.buyer_key);
    if (!list.length) continue;
    try {
      const res = await sendMail(env, m.email, list, await mailToken(m.email, env));
      if (res.ok) mails++; else mailFailed++;
    } catch (e) { mailFailed++; }
  }

  const now = new Date().toISOString();
  for (const it of fresh) {
    await env.DB.prepare('INSERT INTO push_sent (item_id, sent_at) VALUES (?, ?) ON CONFLICT(item_id) DO NOTHING')
      .bind(it.id, now).run();
  }
  await logRun(env, { trigger, items: fresh.length, delivered, mails, note: 'ok: sent ' + fresh.map(it => it.id).join(',') });
  return { items: fresh.length, matched, delivered, dropped: gone, mails, mailFailed, errors: errs.slice(0, 5) };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pushJob(env, { trigger: 'cron' }).catch(() => {}));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    /* 邮件退订链接：不带 x-gudong-key，只凭链接里的 token */
    if (url.pathname === '/mail/off') return mailOffByLink(env, url);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': 'https://gudong.app',
          'Access-Control-Allow-Headers': 'Content-Type, X-Gudong-Key',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
        }
      });
    }
    if (!env.INTERNAL_KEY || request.headers.get('x-gudong-key') !== env.INTERNAL_KEY) {
      return json({ error: 'unauthorized' }, 401);
    }
    let body = {};
    if (request.method === 'POST') {
      try { body = await request.json(); } catch (_) { body = {}; }
    }
    try {
      switch (url.pathname.replace(/\/+$/, '')) {
        case '/save': return await save(env, body);
        case '/interest': return await interest(env, url);
        case '/chat': return request.method === 'GET'
          ? await buyerConversation(env, url)
          : await createBuyerMessage(env, body);
        case '/threads': return await sellerThreads(env, url);
        case '/conversation': return await sellerConversation(env, url);
        case '/reply': return await createSellerReply(env, body);
        case '/buyer': return request.method === 'GET' ? await buyerList(env, url) : await buyerUpsert(env, body);
        case '/fav': return await favUpsert(env, body);
        case '/follow': return await followUpsert(env, body);
        case '/account': return await accountPull(env, url);
        case '/push': return request.method === 'GET' ? await pushList(env, url) : await pushUpsert(env, body);
        case '/push/run': return json(await pushJob(env, { dry: url.searchParams.get('dry') === '1', trigger: 'manual' }));
        case '/push/runs': return json({ runs: (await env.DB.prepare(
          'SELECT run_at, trigger, items, delivered, mails, note FROM push_runs ORDER BY run_at DESC LIMIT ?'
        ).bind(Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 20))).all()).results || [] });
        case '/mail': return request.method === 'GET' ? await mailList(env) : await mailUpsert(env, body);
        case '/health': return json({ ok: true });
        default: return json({ error: 'not_found' }, 404);
      }
    } catch (error) {
      return json({ error: 'store_error', detail: String(error && error.message || error).slice(0, 200) }, 500);
    }
  }
};
