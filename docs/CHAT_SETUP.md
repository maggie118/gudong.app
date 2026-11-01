# Gudong anonymous item chat

## Flow

- Each buyer browser gets a random UUID in `localStorage`; the display alias is `PWA藏友_XXXX`. Chat transcripts are cached per item and seller in the same browser.
- `/api/chat` writes each buyer message to Airtable and sets `is_read_by_seller` to false. Buyer pages poll every four seconds while the chat panel is open and merge server messages back into localStorage.
- Sellers can use `/seller-inbox.html` to view every conversation for their seller ID and reply in the same site. Seller replies are saved to the existing `chat_messages` table; the buyer receives them through polling. No additional Airtable table or seller account is needed.
- The inbox uses a private signed link as its access credential. It expires after 365 days. Generate the initial link only after payment, and issue a replacement after confirming each annual renewal. An expired link stops working automatically. Anyone holding a live link can read and reply to every conversation for that seller, so deliver it privately. Generate links after pulling the production secret locally:

  ```powershell
  vercel env pull .env.production.local --environment production --scope hanlingo
  node scripts/generate-seller-inbox-links.js
  ```

  The script prints one link per current seller. For a new seller, pass their exact `seller_id`, for example `node scripts/generate-seller-inbox-links.js New-Seller`. The env file is ignored by Git; do not share or commit it.

- Optional notifications still use `CHAT_NOTIFY_WEBHOOK_URL`. A webhook returning HTTP 2xx means it accepted the event; it does not prove a seller received it.

## Airtable message table

Create a table (default name `chat_messages`, configurable by `AIRTABLE_CHAT_TABLE`) with these exact field names and compatible types:

- `buyer_tmp_id` (single line text)
- `buyer_label` (single line text)
- `seller_id` (single line text)
- `item_id` (single line text)
- `item_title` (single line text)
- `sender_type` (single line text: `buyer` or `seller`)
- `content` (long text)
- `is_read_by_seller` (checkbox; buyer messages start unchecked)
- `is_read_by_buyer` (checkbox; seller replies start unchecked)
- `client_id` (single line text; idempotency key)
- `notification_sent` (checkbox; marks that the configured webhook accepted the event, not proof that a seller received it)
- `created_at` (single line text; ISO-8601 timestamp)

Create an Airtable personal access token with records:read and records:write access for the listings and chat tables. Configure it as `CHAT_AIRTABLE_TOKEN`. Set Vercel environment variables `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE`, `AIRTABLE_CHAT_TABLE`, `CHAT_AIRTABLE_TOKEN`, `CHAT_REPLY_SECRET`, and `CHAT_NOTIFY_WEBHOOK_URL`. `CHAT_REPLY_SECRET` must be a private random value of at least 32 characters. Set `CHAT_PUBLIC_URL` to the production origin if it is not `https://gudong.app`. Redeploy after configuring variables.

The webhook receiver should route each event using `seller_id` to the seller's chosen channel (email, Telegram bot, or another webhook) and deliver its `reply_url`. Do not forward the reply URL to anyone else: possession of that link grants access to that one conversation until it expires.

Seller and buyer account logins are not used. The signed inbox link is a bearer credential. The random buyer UUID is private and should not be shown in public item URLs. Messages are stored on the server and in buyer localStorage; clearing browser storage removes the local copy, but server history remains accessible to the seller through the private inbox link.





