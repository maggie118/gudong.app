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

## 实录拆解：LIM-KW 交 S$588 开馆

定价口径：私家藏馆 S$588/年（早鸟价，全价 S$1,288），**含 2 件专业上架名额（价值 S$576）**。

填 1 行：

| 字段 | 值 |
| --- | --- |
| `month` | 收款当月，如 `2026-11` |
| `stream` | `藏馆` |
| `orders` | `1`（一份年度藏馆合同算一单） |
| `revenue` | `588` |
| `refunds` | `0` |
| `new_customers` | 首次付费则 `1`，否则 `0` |
| `repeat_customers` | 此前付过款则 `1`，否则 `0` |
| `notes` | `Lim-KW 首次开馆，年付；含2件专业上架名额未单独收费；MRR≈49` |

三条硬规则：

1. **套餐内含的 2 件专业上架不再计收入、不拆 orders。** 若另开 2 行按 S$288 记 revenue，收入虚增 S$576，asp 也会失真。
2. **new / repeat 按"此前有没有付过钱"判**：从没付过 → `new_customers=1`；此前付过 288 上架 → `repeat_customers=1`，且那笔历史要补进表，否则复购率分母缺一块。
3. **S$588 全额记入收款当月，不分摊 12 个月**（现金口径）；MRR 换算 `588/12≈49` 写进 `notes`，两套口径同时留痕。

派生场景：

- 次年再付 588 → `stream=续展`、`repeat_customers=1`、`new_customers=0`；`stream=续展` 那组即可算年度续展率 = 续展 orders / 去年同月藏馆 orders。
- 同月另付 288 上架 → 另起一行 `stream=上架`、`revenue=288`，不与藏馆行混记（两个价格混一行会稀释客单价）。

## 待办 / 未做

- `revenue` / `refunds` 的币种符号仍是默认 `$`，未显式设成 `S$`（Airtable 的 currency symbol 下拉在本次会话里一直展开失败，不影响数值）。
- `month` 为主字段且是文本类型；若之后要做时间轴图表，可改成 Date（空表状态下可直接改）。
