// cloudflare/deploy.mjs
// 用 Cloudflare REST API 上传 Worker（无需 wrangler）
// 用法：node cloudflare/deploy.mjs
// 需要环境变量 CLOUDFLARE_API_TOKEN；可用 CLOUDFLARE_ACCOUNT_ID / D1_ID 覆盖默认值
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'b1b46e9369291ee99b61663ff325785f';
const DB_ID = process.env.D1_ID || 'e3a0fbe9-4844-4f48-9fae-4834dc23de5b';
const SCRIPT = process.env.WORKER_NAME || 'gudong-data-api';
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!TOKEN) { console.error('CLOUDFLARE_API_TOKEN is missing'); process.exit(1); }

const here = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(join(here, 'worker.js'), 'utf8');
const key = (process.env.INTERNAL_KEY && process.env.INTERNAL_KEY.trim()) || randomBytes(24).toString('hex');

/* VAPID：优先环境变量，其次读 cloudflare/.vapid.env（已 gitignore，不入库） */
function readVapid() {
  const out = {
    VAPID_PUBLIC_KEY: (process.env.VAPID_PUBLIC_KEY || '').trim(),
    VAPID_PRIVATE_KEY: (process.env.VAPID_PRIVATE_KEY || '').trim(),
    VAPID_SUBJECT: (process.env.VAPID_SUBJECT || '').trim()
  };
  try {
    const raw = readFileSync(join(here, '.vapid.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !out[m[1]]) out[m[1]] = m[2];
    }
  } catch (_) { /* 没有本地钥匙文件也允许部署（推送会自动跳过） */ }
  return out;
}
const vapid = readVapid();
if (!vapid.VAPID_SUBJECT) vapid.VAPID_SUBJECT = 'mailto:contact@gudong.app';

const metadata = {
  main_module: 'worker.js',
  compatibility_date: '2026-11-01',
  bindings: [
    { type: 'd1', name: 'DB', id: DB_ID },
    { type: 'secret_text', name: 'INTERNAL_KEY', text: key },
    { type: 'secret_text', name: 'VAPID_PUBLIC_KEY', text: vapid.VAPID_PUBLIC_KEY },
    { type: 'secret_text', name: 'VAPID_PRIVATE_KEY', text: vapid.VAPID_PRIVATE_KEY },
    { type: 'secret_text', name: 'VAPID_SUBJECT', text: vapid.VAPID_SUBJECT }
  ]
};

const form = new FormData();
form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');

const response = await fetch(
  'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID + '/workers/scripts/' + SCRIPT,
  { method: 'PUT', headers: { Authorization: 'Bearer ' + TOKEN }, body: form }
);
const text = await response.text();
if (!response.ok) {
  console.error('deploy failed', response.status, text.slice(0, 800));
  process.exit(1);
}
console.log(text.slice(0, 400));

/* 定时任务：每天 09:10（新加坡时间 = UTC+8 的 01:10）检查新上架并推送 */
const CRON = process.env.PUSH_CRON || '10 1 * * *';
const sched = await fetch(
  'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT_ID +
  '/workers/scripts/' + SCRIPT + '/schedules',
  {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ cron: CRON }])
  }
);
const schedText = await sched.text();
console.log('schedule ' + (sched.ok ? 'ok' : 'failed ' + sched.status) + ' ' + CRON + ' ' + schedText.slice(0, 300));
console.log('INTERNAL_KEY=' + key);
