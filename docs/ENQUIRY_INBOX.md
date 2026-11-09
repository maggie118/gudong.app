# 询价收件箱与卖家提醒（2026-11-09 上线）

买家在藏品页点「Message the collector on WhatsApp」时，会先留下**称呼 + 联系方式 + 购买意向**（Google 登录位已就位，默认隐藏，见 `assets/js/google-client.js`）。这份资料除了进 Airtable，现在还会：

1. **写库**：Airtable `buyer_leads` 表（`seller` 字段记录归属藏家）。
2. **通知藏家**：`api/lead.js` 的 `notifyEnquiry()` 按下面的开关自动选通道。
3. **可查**：藏家用专属私密链接打开 `seller-inbox.html`，顶部「询价 / 买家留言」区块就是属于他的全部询价，可直接点邮箱（`mailto:`）或号码（`wa.me`）回过去。

## 数据流

```
藏品页弹层 → POST /api/lead（source = wa-gate, seller = 藏家 id）
              ├─ 写 Airtable buyer_leads
              └─ 若 source=wa-gate 且有 seller → notifyEnquiry()
                     ├─ RESEND_API_KEY 配了 → 发邮件到该藏家（Sellers 表「邮箱 / Email Address」）
                     ├─ CHAT_NOTIFY_WEBHOOK_URL 配了 → POST {event:'new_enquiry', inbox_url, ...}
                     └─ 都没配 → 静默跳过（绝不阻塞买家提交，3 秒护栏）

藏家专属链接 → GET /api/enquiries（Bearer 签名 token）
              → Airtable buyer_leads 里 {seller}='<藏家 id>' 的全部记录
```

纯「关注/订阅买家名单」不入询价，也不打扰藏家（`source` 不是 `wa-gate` 时只写库）。

## 环境变量（都在 Vercel → Settings → Environment Variables）

| 变量 | 作用 | 现状 |
| --- | --- | --- |
| `CHAT_REPLY_SECRET` | 藏家链接签名密钥（≥32 位），`/api/seller-inbox`、`/api/enquiries` 共用 | 已配 |
| `CHAT_NOTIFY_WEBHOOK_URL` | 通用通知通道（原本用于站内消息提醒） | 已配（值不可见） |
| `CHAT_PUBLIC_URL` | 生成链接用的站点根，默认 `https://www.gudong.app` | 未配则用默认 |
| `RESEND_API_KEY` | 直接给藏家发邮件所需（resend.com 免费额度 100 封/天） | **未配** |
| `ENQUIRY_FROM_EMAIL` | 发件人，默认 `Gudong 古董圈 <notify@gudong.app>` | 未配则用默认 |
| `ENQUIRY_PLATFORM_EMAIL` | 藏家还没填邮箱时的平台代收地址 | **未配** |
| `AIRTABLE_SELLERS_TABLE` | Sellers 表名，默认 `sellers` | 已配 |

要给藏家**直接**发邮件：在 resend.com 建账号 → 验证发件域名（在 Vercel 域名的 DNS 里加它给的 TXT/MX）→ 复制 API Key 填进 `RESEND_API_KEY`。代码已经写好，填完 key 下一次询价就会自动发信，不需要再改代码。

## 藏家链接怎么来

- **自动**：第一条询价进来时，提醒邮件正文底部就带 `https://www.gudong.app/seller-inbox.html#token=...`，藏家第一次被联系时自然拿到。
- **手动补发**：本机需要 `CHAT_REPLY_SECRET`（只能从 Vercel 面板复制，或 `vercel env pull .env.production.local --environment production` 拉下来），然后：

```
node scripts/generate-seller-inbox-links.js            # 列出所有藏家
node scripts/generate-seller-inbox-links.js Lim-CK     # 只生成某一家
```

链接有效期 365 天，过期重新生成即可。链接等于该藏家的钥匙，只能私下发给本人。

## 已在页面上的文案

- 收件箱区块标题：询价 / 买家留言（EN: Enquiries），副标「藏品页 · 身份已确认」。
- 卡片：买家称呼、意向标签、所询藏品、联系方式（可点）、时间。
- 《隐私政策》第「藏品询价信息」与「使用目的」已写明：询价资料会在买家同意的范围内提供给该藏家。

## 收藏 / 关注：只给数字，不给身份（2026-11-09）

收藏按钮仍是纯本地（`localStorage: gudong_fav`），点一下不会泄露任何个人信息。为了给藏家一个“作品有人气”的可信数字，另加一条**匿名计数**：

- 前端 `assets/js/fav-log.js`（19 个藏品页统一挂载）在收藏/取消收藏时 POST `{item_id, seller, anon}` 到 `/api/save`；`anon` 是浏览器本地随机 16 字节 id，与身份无关。
- 后端 `api/save.js` 写 Airtable 表 `item_saves`（字段 `item_id / seller / anon / created_at / status`）。同一 anon 同一藏品只记一条，重复收藏不累加，取消时把 `status` 置为 `removed`。
- `/api/interest`（同样走藏家签名链接）只返回 `saves_30d / saves_total` 两个数字，**不返回任何 anon 或时间明细**。
- 藏家收件箱顶部因此多一行“近 30 天 · N 人收藏 / 关注”；为 0 时不显示，避免给新藏家看空场。
- 《隐私政策》已补「收藏计数」条款，说明该记录不含任何可识别个人的信息。

`item_saves` 的 `notes / assignee / attachments / attachment summary` 是 Airtable 建表自带字段，留空即可，可以按需隐藏。

## 部署

`git push origin HEAD:main`；若线上没动，用 Deploy Hook：

```
POST https://api.vercel.com/v1/integrations/deploy/prj_ERZwizKTq3bNffJchgzfD3k6Rubx/kS7DbfOGKT
```

静态文件（`seller-inbox.html`、`assets/js/seller-inbox.js`）在旧部署上有过边缘缓存尾部未刷新的情况，必要时再触发一次部署即可。
