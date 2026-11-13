// api/_d1.js
// Cloudflare D1 的薄客户端（CommonJS 版），供 api/lead.js、api/enquiries.js 这类 CJS 函数使用。
// 与 api/_data.js（ESM 版）指向同一个 Worker：GUDONG_DATA_URL + GUDONG_DATA_KEY。
const BASE = (process.env.GUDONG_DATA_URL || 'https://gudong-data-api.minqi118.workers.dev').replace(/\/+$/, '');
const KEY = process.env.GUDONG_DATA_KEY || '';

function d1Configured() {
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
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = {}; }
  if (!response.ok) {
    const error = new Error('d1 ' + response.status + ' ' + text.slice(0, 200));
    error.status = response.status;
    error.body = json;
    throw error;
  }
  return json;
}

function d1Get(path, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null) query.set(key, String(value));
  });
  const suffix = query.toString();
  return call(path + (suffix ? '?' + suffix : ''), { method: 'GET' });
}

function d1Post(path, body) {
  return call(path, { method: 'POST', body: JSON.stringify(body || {}) });
}

module.exports = { d1Configured, d1Get, d1Post };
