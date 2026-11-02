// /api/trigger-rebuild.js
// 免费版「全自动」触发：Vercel Cron（Hobby 每天 1 次）→ 调 Vercel Deploy Hook → 触发一次构建
// 构建时 refresh-listings 重新拉 Airtable + build-sellers 建馆/下架，实现每日自动刷新。
//
// 背景（已核实）：
//   - Airtable 免费版无可靠出站 webhook（PAT 建的 webhook 7 天过期需外部续期、自动化仅 100 次/月）
//   - Vercel Deploy Hook 免费可用；Hobby Cron 免费但每天最多 1 次
// 所以每天一次的 Cron → Deploy Hook 是免费版最接近「全自动」的可行链。
//
// 需要的环境变量（Vercel 项目 Settings -> Environment Variables）：
//   REBUILD_HOOK_URL  — 从 Vercel 项目 Settings -> Deploy Hooks 复制的 hook URL（自带令牌，务必保密）
//   CRON_SECRET（可选）— 设了则要求调用方携带 Authorization: Bearer <CRON_SECRET>，防第三方乱触发

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default function handler(req, res) {
  // 鉴权：Vercel Cron 请求自带自动注入的 CRONS_AUTH_TOKEN（或 x-vercel-cron 标记），
  // 用户可另设 CRON_SECRET 供手动 curl 触发。三者任一匹配即放行；都未配置则开放。
  const auth = req.headers['authorization'] || '';
  const isVercelCron =
    req.headers['x-vercel-cron'] === 'true' ||
    String(req.headers['user-agent'] || '').toLowerCase().includes('vercel-cron');
  const cronToken = process.env.CRONS_AUTH_TOKEN;
  const secret = process.env.CRON_SECRET;
  const allowed =
    isVercelCron ||
    (cronToken && auth === `Bearer ${cronToken}`) ||
    (secret && auth === `Bearer ${secret}`) ||
    (!cronToken && !secret);
  if (!allowed) {
    return json(res, 403, { ok: false, error: 'unauthorized' });
  }

  const hook = process.env.REBUILD_HOOK_URL;
  if (!hook) {
    // 未配置时不阻塞部署：返回 200 说明未启用（避免 cron 报错）
    return json(res, 200, { ok: false, reason: 'REBUILD_HOOK_URL not set — daily auto-rebuild disabled' });
  }

  // 触发 Vercel Deploy Hook（POST 即新建一次部署）
  fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    .then(r => json(res, 200, { ok: true, status: r.status, note: 'deploy hook triggered' }))
    .catch(e => json(res, 502, { ok: false, error: String(e && e.message) }));
}
