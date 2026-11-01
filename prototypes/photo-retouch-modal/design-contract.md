# Design Contract — Photo Retouch Modal (Founder-Seller Exclusive Benefit)

## Style Tier & Aesthetic Direction
- style: business-international (minimal-light leaning)
- aesthetic: luxury-refined but restrained — antique-brand warmth (warm brown + gold accents) on a calm neutral canvas, generous whitespace, thin borders, soft layered shadows. No decorative noise.
- tone keywords: clean / trustworthy / premium / high information clarity

## Tech Stack + Delivery Type
- stack: vanilla HTML + CSS + vanilla JS (no build, no framework)
- delivery: pure-static, self-contained, offline-openable (inline SVG icons, no CDN)

## Design Tokens
| token | value |
|---|---|
| color.primary | #8A5A3B |
| color.primary-hover | #68432D |
| color.primary-soft | #F1E8DF |
| color.bg | #F5F2EC |
| color.surface | #FFFFFF |
| color.border | #E4DED5 |
| color.text | #25221E |
| color.text-sub | #716B63 |
| color.text-muted | #A49D94 |
| color.gold | #B08A45 |
| color.gold-soft | rgba(176,138,69,.10) |
| color.success | #526657 |
| color.warning-bg | #FDF6EC |
| color.warning-border | #F0E0C0 |
| color.warning-text | #8A6D3B |
| font.body | "PingFang SC","Microsoft YaHei","Helvetica Neue",Helvetica,Arial,sans-serif |
| font.scale | 12 / 13 / 14 / 16 / 20 / 24 (px) |
| radius | sm 8 / md 10 / lg 12 |
| shadow.sm | 0 1px 2px rgba(37,34,30,.06) |
| shadow.md | 0 6px 18px rgba(37,34,30,.10) |
| shadow.lg | 0 18px 50px rgba(0,0,0,.22) |
| spacing.unit | 4px (4/8/12/16/24/32/48) |
| modal.max-width | 560px |
| modal.max-height | 90vh |
| icon.lib | inline Lucide SVG (offline) |
| icon.size | 16 / 20 / 24 |
| icon.stroke | 1.75 |

## Component Spec (relevant to this prototype)
- **Modal overlay**: fixed inset 0, bg rgba(0,0,0,.55), flex center, fade via `.show` class.
- **Modal box**: white surface, radius 12, padding 1.7rem 1.5rem, max-h 90vh overflow-y auto, shadow.lg.
- **Close button (×)**: absolute top-right, no border, text-sub color, 1.5rem.
- **Founder badge**: inline-block, gold-soft bg, gold text, radius 6, 12px bold.
- **Title (h3)**: 20px / 700 / text, line-height 1.4.
- **Price block**: primary-soft bg, radius 10, padding 1rem 1.1rem.
  - price-main: 18px / 800 / primary; `.amt` 24px.
  - checklist: no bullets, Lucide `check` icon (success color) + 14px text.
- **Warning box**: warning-bg, warning-border, warning-text, radius 8, padding .8rem 1rem, 13px.
- **Workflow block**: #FAFAF7 bg, radius 8, padding .8rem 1rem, 13.5px text-sub, line-height 1.7.
- **Inputs / textarea**: full width, border 1px border, radius 8, padding .65rem .8rem, 14px; focus → gold ring 4px gold-soft.
- **File upload dropzone**: dashed 1.5px border, radius 8, padding 1rem, text-center; hover → primary border + primary-soft bg.
- **PayNow block**: primary-soft bg, radius 10; amount 17px/800/primary; QR placeholder 150×150 white box bordered.
- **Submit button**: full width, primary bg, white text, 16px/700, radius 10, padding .9rem; hover → primary-hover.

## Page List
- index.html | demo page | trigger link "想要同款图片效果？" → opens modal | (single page, no cross-page nav)

## Mock Schema
- No backend data required. Form is client-side only; submit builds a WhatsApp deep-link with pre-filled text (stub — real number TBD, currently platform placeholder 6591234567).
- Required fields for validation: sellerId, whatsapp, images (≥1), paynowScreenshot (≥1). remark optional.
