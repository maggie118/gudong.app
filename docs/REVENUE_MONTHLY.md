# revenue_monthly —— 收入追踪表（unit economics）

Airtable base `apprn6XDQnAm8bkaT`（Gudong）里的第三张自建表，用于按月 × 产品线记录客单价与复购，融资尽调时直接导出成 unit economics 口径。

## 表结构（10 字段，已建好）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `month` | Single line text（主字段） | 月份，统一写 `YYYY-MM`，如 `2026-10`。写文本而非日期，是为了直接 group / pivot 不出时区偏差 |
| `stream` | Single select | 五个选项，一字不差：`上架` / `藏馆` / `Signature` / `附加服务` / `续展` |
| `orders` | Number | 当月该产品线的成交单数 |
| `revenue` | Currency | 当月该产品线确认收入（SGD 金额，符号当前显示 `$`） |
| `refunds` | Currency | 当月退款额。**单独记录，不冲减 `revenue`**，退款率 = refunds / revenue |
| `new_customers` | Number | 当月该产品线的首次付费客户数 |
| `repeat_customers` | Number | 当月该产品线的复购客户数 |
| `asp` | Formula | 客单价：`IF({orders},{revenue}/{orders},0)` |
| `repeat_rate` | Formula | 复购率：`IF({orders},{repeat_customers}/{orders},0)` |
| `notes` | Long text | 口径说明、异常、渠道归因 |

## 为什么是长表（一行 = 月份 × 产品线）

- 加第六条产品线只需新增一个 select 选项，不用改 schema；
- 各产品线的趋势、占比可以直接 pivot；
- 一行一月 + 五列横向铺开的短表，一加线就整张表错位，且 pivot 不出来。

## 每月怎么录

一个月填 3–5 行（有几条线在跑就填几行，某条线当月为 0 可以空着不填）：

```
2026-11 | 上架      | orders 12 | revenue 3456 | refunds 0    | new 9 | repeat 3
2026-11 | 藏馆      | orders  2 | revenue 576  | refunds 0    | new 2 | repeat 0
2026-11 | Signature | orders  1 | revenue 288  | refunds 0    | new 1 | repeat 0
```

数据来源：收款渠道（Stripe / 银行流水）按产品线归并后的月度汇总，不是单笔明细。

**边界：这张表只放月度聚合，不放单笔明细。** 单笔流水留在收款渠道里，Airtable 免费版单表约 1000 条上限要留给 `buyer_leads` 和 `antiques`。

## 基建说明

- 这张表不写代码、不接 API，纯手工按月录；不与 `sellers` 建 link（当前需求只要汇总，跨表联动等真有尽调问题再补）。
- 已有 `buyer_leads`（买家名单）、`sellers`、`antiques` 在同一 base，同一个 PAT 可读全套，导出复用 `scripts/archive-buyer-leads.ps1` 的 Token 解析逻辑。

## 待办 / 未做

- `revenue` / `refunds` 的币种符号仍是默认 `$`，未显式设成 `S$`（Airtable 的 currency symbol 下拉在本次会话里一直展开失败，不影响数值）。
- `month` 为主字段且是文本类型；若之后要做时间轴图表，可改成 Date（空表状态下可直接改）。
