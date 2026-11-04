# Order-ahead — «កម្មង់ទុកមុន» (ULTRA)

**Decided by the founder on 4/11/2026.** A café's or restaurant's customers order and pay ahead on their phone, then pick
up without queueing, like Starbucks. Only a business on **ULTRA** can use it, which makes it a revenue feature. It sits
behind the feature flag `order_ahead`, open to staff first and then to one pilot shop.

## The founder's decisions

| Question | Decision |
|---|---|
| How customers order | A public link or QR (`/s/<shop>`). No install, no sign-up: a name, a phone number and a pickup time |
| When they pay | **Upfront, by KHQR, right away.** The shop's own KHQR carries the order amount (`khqrWithAmount`). This is an exception to the invoice rule «never add an amount», for order-ahead only. Test it with ABA, ACLEDA and Wing first |
| Proof of payment | 1) AUTOBOK / the KHQR API: the same amount and currency, one open order only. 2) The customer uploads the slip screenshot, which `readSlipImage` checks: amount, receiving account and a time after the order. 3) The shop taps «បានទទួលលុយ» |
| Pilot | A café or restaurant: items with options (size, sugar, ice) |
| «Ready» notice | The order page shows the status live, and the customer can follow it on Telegram if they want |

## The flow

1. **Owner (app):** at `/business/menu`, items with name, price, photo, options, and «available» on or off. At `/business/orders`, the shop's link and QR and the order board.
2. **Customer (`/s/<shop>`):** picks items and options, chooses a pickup time, and leaves a name and phone. That creates an order with a secret token, and the customer goes to `/o/<token>`.
3. **Pay (`/o/<token>`):** the KHQR with the amount; «uploaded slip» → checked; or the automatic match. Then the order is marked PAID.
4. **Shop:** a Telegram message to the owner, SoundBox «មានការកម្មង់ថ្មី» (phase 2), and the board ទទួល → កំពុងរៀបចំ → រួចរាល់ → បានយក.
5. **Customer:** the status updates live; Telegram optionally (`t.me/luychlat_bot?start=o_<token>`).

## Data (additive migrations)

- `order_shops`: workspace (BUSINESS), a unique slug, enabled, KHQR code, pickup lead minutes.
- `order_items`: workspace, name, price, currency, photo, options jsonb, available, sort order.
- `customer_orders`: a token (secret), a short code (A-012), an items snapshot, total, currency, name and phone, pickup time,
  status, paid_via and paid_at, slip bank_ref (unique: one slip pays one order), created_at.
- Customers never touch the tables. Server routes do it with the service role, rate-limited (`guardRequest`).

## Phases

- **1:** data, menu editor, public menu and order, order page with the KHQR and amount, owner Telegram, board with a manual «paid».
- **2:** slip upload check, AUTOBOK auto-match, customer Telegram, SoundBox voice.
- **3:** pilot with one café, then open to ULTRA.

## Done

- [x] `khqrWithAmount` (lib/khqr.ts): the shop's KHQR made dynamic with the amount and a fresh checksum (khqr.test.ts).
