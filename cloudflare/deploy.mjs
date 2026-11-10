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

const metadata = {
  main_module: 'worker.js',
  compatibility_date: '2026-11-01',
  bindings: [
    { type: 'd1', name: 'DB', id: DB_ID },
    { type: 'secret_text', name: 'INTERNAL_KEY', text: key }
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
console.log('INTERNAL_KEY=' + key);
