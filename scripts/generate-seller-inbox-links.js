#!/usr/bin/env node
// scripts/generate-seller-inbox-links.js
// ------------------------------------------------------------------
// 为当前所有藏家生成「专属收件箱」私密链接（询价 + 站内消息共用同一个入口）。
// 链接 = https://<站点>/seller-inbox.html#token=<payload>.<hmac>
// 有效期 365 天；过期或被转发给了别人时，用本脚本重新生成再发一次。
//
// 用法（在项目根目录）：
//   node scripts/generate-seller-inbox-links.js                # 列出所有藏家
//   node scripts/generate-seller-inbox-links.js Lim-CK         # 只生成某一家
//
// 依赖：.env.production.local 里的 CHAT_REPLY_SECRET（32 位以上随机串）。
// 该文件已被 Git 忽略，不要提交、不要外发。
// ------------------------------------------------------------------
'use strict';

const fs = require('fs');
const path = require('path');
const { createHmac } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'listings.json');
const ENV_FILE = path.join(ROOT, '.env.production.local');
const SITE = (process.env.CHAT_PUBLIC_URL || 'https://www.gudong.app').replace(/\/+$/, '');
const DAYS = 365;

function readEnv(key) {
  if (!fs.existsSync(ENV_FILE)) return '';
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  const line = text.split(/\r?\n/).find((l) => l.startsWith(key + '='));
  if (!line) return '';
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '');
}

function token(sellerId, secret, gallery) {
  const payload = Buffer.from(JSON.stringify({
    scope: 'seller_inbox',
    seller_id: sellerId,
    gallery: gallery === true,
    exp: Date.now() + DAYS * 24 * 60 * 60 * 1000
  })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

function main() {
  const secret = process.env.CHAT_REPLY_SECRET || readEnv('CHAT_REPLY_SECRET');
  if (!secret || Buffer.byteLength(secret) < 32) {
    console.error('缺少 CHAT_REPLY_SECRET（需 32 位以上）。请先执行：vercel env pull .env.production.local --environment production');
    process.exit(1);
  }
  if (!fs.existsSync(DATA_FILE)) {
    console.error('找不到 data/listings.json');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const only = (process.argv[2] || '').trim();
  const sellers = (data.sellers || []).filter((s) => s && s.seller_id && (!only || s.seller_id === only));
  if (!sellers.length) {
    console.error(only ? '没有这个 seller_id：' + only : 'listings.json 里没有 sellers');
    process.exit(1);
  }
  const expires = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  console.log('有效期至 ' + expires + '（' + DAYS + ' 天）\n');
  sellers.forEach((s) => {
    // gallery=true（已付费开通私家藏馆）才在 token 里写入统计权益，
    // 写进去之后该藏家的收件箱才会显示「近 30 天 N 人浏览 · M 人收藏」。
    const link = SITE + '/seller.html#token=' + encodeURIComponent(token(s.seller_id, secret, s.gallery === true));
    console.log('【' + s.seller_id + '｜' + (s.display_zh || s.display_en || '') + '】');
    if (s.gallery !== true) console.log('（未开通私家藏馆：不显示浏览 / 收藏统计）');
    console.log(link + '\n');
  });
  console.log('提醒：这条链接可读取该藏家的全部询价与站内消息，只能私下发给藏家本人。');
}

main();
