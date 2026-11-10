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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
        case '/health': return json({ ok: true });
        default: return json({ error: 'not_found' }, 404);
      }
    } catch (error) {
      return json({ error: 'store_error', detail: String(error && error.message || error).slice(0, 200) }, 500);
    }
  }
};
