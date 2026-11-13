# 季度买家数据快照（含收入）

每季度跑一次，产出一份可直接交给投资人 / 自己复盘的匿名汇总。脚本：`scripts/quarterly-snapshot.js`。

## 产出

`data/snapshots/<label>-buyer-data.{json,md,csv}`，三份内容一致、格式不同：

- `.md` —— 人读版本：一句话结论、核心指标表、**收入段**、买家分月走势、买家来源、询价结构、各藏馆表现、口径与限制
- `.csv` —— 可导入 Excel / 主表做图
- `.json` —— 原始汇总，可复用别的脚本

## 数据从哪来

| 段 | 来源 | 鉴权 |
|---|---|---|
| 买家 / 收藏 / 关注 / 询价 / 点击 / 各藏馆 | Cloudflare D1，经 Worker `GET /snapshot?from=&to=` | `x-gudong-key: INTERNAL_KEY` |
| 收入 | Google 主表 `revenue_monthly` 页签公开 CSV | 无（公开只读） |

整份报表**没有任何买家身份**，只有计数。

## 怎么跑

### 1. 先拿一个内部快照令牌

后端入口是 `GET /api/enquiries?snapshot=1&from=YYYY-MM-DD&to=YYYY-MM-DD`，只接受 `scope=platform_snapshot` 的签名令牌（用 `CHAT_REPLY_SECRET` 签），藏家收件箱的令牌在这里无效。令牌只在本地临时签、一小时有效：

1. 在 `api/` 下临时放一个 `tmp-mint.js`（**文件名不能以下划线开头**，否则会被当静态文件直出源码），内容用 `createHmac('sha256', CHAT_REPLY_SECRET)` 对 `{scope:'platform_snapshot', exp:now+1h}` 签名，返回 `payload.signature`；
2. `vercel dev --listen 3999` 起本地服务（它注入 Development 环境的真实变量），请求 `http://localhost:3999/api/tmp-mint` 拿令牌；
3. 用完删掉临时函数、停掉 dev。

### 2. 拉数据并出报表

```bash
curl -H "Authorization: Bearer <token>" \
  "https://www.gudong.app/api/enquiries?snapshot=1&from=2026-10-01&to=2026-12-31" \
  -o snapshot.json

node scripts/quarterly-snapshot.js --quarter 2026-Q4 --input snapshot.json
```

也可以直接给窗口：

```bash
node scripts/quarterly-snapshot.js --from 2027-01-01 --to 2027-03-31
```

不带 `--input` 时会自己打 Worker（需要本机有 `GUDONG_DATA_KEY`）。

## 口径（引用时必须一起带）

- **询价 / WhatsApp 点击 ≠ 成交**。成交在私聊与线下完成，平台看不到，不能反推成交额。
- 全部匿名聚合，不含姓名、邮箱、号码。
- 同一买家在多家藏馆各计一次「收藏买家」，跨馆不可相加。
- 「最宽口径活跃买家」取四个独立买家数的**最大值**，不是相加。
- 数据自 2026-11 起积累，早期窗口偏小属正常，看趋势不看绝对值。
- 收入是内部财务口径，**不进任何藏家可见页面**；藏家后台只显示关注 / 收藏 / 咨询。

## 已知的小坑

- 样板位藏品没有 `seller_id`，其收藏会在「各藏馆表现」里显示成「（藏品未归属藏馆）」，不是某家藏馆的数据。
- `revenue_monthly` 标点符号（`S$`、千分位）会被脚本剥掉，但**最好只填数字**。
