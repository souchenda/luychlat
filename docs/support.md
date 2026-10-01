# Help & Support

**Settings › Help › ជំនួយ និងទំនាក់ទំនង** (`/support`) has three parts:

- **Contact channels:** Telegram support (the main channel), a call button and the community group. You set them in **/admin › Support contacts**.
  - Links must start with `https://t.me/`.
  - Guests can see these too.
- **Report a problem:** pick Payment issue, Bug report, Feature request or Other, write a message, and optionally leave a Telegram name or phone for the reply.
  - Each user can send up to 5 messages a day and have up to 10 open at once.
  - Each message also records the screen, language, plan and browser, to help reproduce the problem. No personal data is included.
- **My messages:** the status of each message and your reply.

The Get PRO sheet links to the form with "Payment issue" already selected.

## Admin

- **/admin › Support messages:** reply, then mark **In progress** or **Resolved**.
  - The user sees the reply in the app, and on Telegram too if they connected a bot in Settings › Telegram.
- **New-message alerts:** connect a Telegram bot in **Settings › Telegram** on your admin account. Each new message is then sent there.

## Database

- **Table:** `support_tickets`. Users can only read their own; there are no direct writes.
- **Functions:**
  - `support_contacts()`: readable without signing in.
  - `submit_support_ticket()`, `close_my_ticket()`.
  - `admin_list_tickets()`, `admin_update_ticket()`, `admin_set_support_contacts()`.
