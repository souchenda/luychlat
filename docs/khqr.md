# Paying for PRO with a static KHQR

No external API: the customer scans the shop's static KHQR and pays, then taps "I have paid". The admin checks the slip and approves with one tap.

## Set up (once)

1. Run the updated `supabase_full_setup.sql` in Supabase. It's safe to re-run. It adds the `payment-qr` storage bucket and removes the earlier dynamic Bakong version if you had applied it.
2. In the **ABA app**, open your account's KHQR to receive money (Receive money › KHQR) and take a screenshot.
3. Go to **/admin › Payment details**:
   - **Upload QR image** with that screenshot. It's stored in the public `payment-qr` bucket, and only admins can upload or replace it.
   - Fill in **Account name**, **Bank** and **Account number**, then tap **Save**.
   - A pasted image link only works if it's a link to this project's Supabase Storage. The app's security policy blocks images from other websites, so uploading is the easy way.
4. Optional: in **/admin › Support contacts**, set your Telegram link so customers can send their slip with one tap.

## What the customer sees (Get PRO)

1. They pick monthly ($2.99) or yearly ($24.99), in USD or riel.
2. The screen shows the KHQR, **the exact amount to enter** (a static QR has no amount in it), the account name and number, **Save QR to Gallery** and "Scan to pay, then tap 'I have paid' below."
3. They tap **I have paid**, optionally with the transaction reference first. This creates a PENDING payment.
4. They see a short code (e.g. `#3F2A9C`) and **Send slip on Telegram**, which opens your support chat and copies the code.

## Approving

**/admin › Payments to review › Approve.** PRO starts, or is extended from the current end date, and the customer's app shows "PRO is on" right away. Reject sends them a message to check their payment.

Match the code from Telegram to the code shown with each pending payment, and check the amount in your ABA history.
