// api/_data.js
// gudong.app「机器产生的数据」（收藏计数、站内私信）现在存在 Cloudflare D1，
// 由 Worker gudong-data-api 读写。这里只是给 Vercel 函数用的薄客户端。
// 需要的环境变量：GUDONG_DATA_URL（默认已内置）、GUDONG_DATA_KEY（与 Worker 的 INTERNAL_KEY 相同）
const BASE = (process.env.GUDONG_DATA_URL || 'https://gudong-data-api.minqi118.workers.dev').replace(/\/+$/, '');
const KEY = process.env.GUDONG_DATA_KEY || '';

export function dataConfigured() {
  return Boolean(KEY);
}

async function call(path, init) {
  if (!KEY) throw new Error('data_store_unconfigured');
  const response = await fetch(BASE + path, {
    ...init,
    headers: { 'x-gudong-key': KEY, 'Content-Type': 'application/json' }
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) { json = {}; }
  if (!response.ok) {
    const error = new Error('data ' + response.status + ' ' + text.slice(0, 200));
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

export function dataGet(path, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) query.set(key, String(value));
  });
  const suffix = query.toString();
  return call(path + (suffix ? '?' + suffix : ''), { method: 'GET' });
}

export function dataPost(path, body) {
  return call(path, { method: 'POST', body: JSON.stringify(body || {}) });
}
