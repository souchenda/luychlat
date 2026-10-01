# 📘 ឯកសារណែនាំស្ថាបត្យកម្មប្រព័ន្ធ៖ លុយឆ្លាត (LuySmart)

## ១. ទស្សនវិស័យនៃផលិតផល (Product Vision)
**លុយឆ្លាត (LuySmart)** គឺជាកម្មវិធីគ្រប់គ្រងលុយកាក់ និងបំណុលបែបទំនើប ងាយស្រួលប្រើប្រាស់លើទូរស័ព្ទដៃ (Mobile-First) សម្រាប់ប្រជាជនកម្ពុជា។ អេបនេះជួយឱ្យអ្នកប្រើប្រាស់គ្រប់គ្រងលំហូរសាច់ប្រាក់ផ្ទាល់ខ្លួន និងអាជីវកម្មបានដាច់ដោយឡែកពីគ្នា ព្រមទាំងមាន AI ជួយប្រឹក្សា និងប្រព័ន្ធរំលឹកបំណុលស្វ័យប្រវត្តិតាម Telegram។

---

## ២. បច្ចេកវិទ្យាគោល (Tech Stack)
* **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui
* **Database & Auth:** Supabase (PostgreSQL + Auth + Storage + RLS)
* **Charts:** Recharts
* **Data Validation:** Zod
* **Bot Notification:** Telegram Bot API
* **AI Engine:** Claude API / OpenAI API (Serverless Edge Functions)

---

## ៣. គំរូទិន្នន័យ (Database Schema Design)

### 3.1 `workspaces` (បែងចែកផ្ទាល់ខ្លួន និងអាជីវកម្ម)
- `id` (UUID, PK)
- `user_id` (UUID, References auth.users)
- `name` (TEXT: "ផ្ទាល់ខ្លួន" / "អាជីវកម្ម")
- `type` (ENUM: `PERSONAL`, `BUSINESS`)
- `currency_default` (ENUM: `USD`, `KHR`, default `USD`)
- `created_at` (TIMESTAMPTZ)

### 3.2 `wallets_accounts` (កាបូបលុយ និងធនាគារ)
- `id` (UUID, PK)
- `workspace_id` (UUID, FK -> workspaces)
- `name` (TEXT: ឧ. "ABA Bank", "អេស៊ីលីដា", "លុយសុទ្ធ")
- `balance` (DECIMAL, default 0)
- `currency` (ENUM: `USD`, `KHR`)
- `icon` (TEXT)

### 3.3 `transactions` (ប្រតិបត្តិការចំណូល-ចំណាយ)
- `id` (UUID, PK)
- `workspace_id` (UUID, FK -> workspaces)
- `wallet_id` (UUID, FK -> wallets_accounts)
- `category_id` (UUID, FK -> categories)
- `amount` (DECIMAL)
- `currency` (ENUM: `USD`, `KHR`)
- `type` (ENUM: `INCOME`, `EXPENSE`, `TRANSFER`)
- `exchange_rate` (DECIMAL, nullable)
- `note` (TEXT)
- `receipt_url` (TEXT, nullable)
- `transaction_date` (TIMESTAMPTZ)

### 3.4 `debts` (តារាងបំណុល)
- `id` (UUID, PK)
- `workspace_id` (UUID, FK -> workspaces)
- `type` (ENUM: `PAYABLE` [ត្រូវសងគេ], `RECEIVABLE` [គេជំពាក់])
- `party_name` (TEXT: ឈ្មោះបុគ្គល ឬដៃគូអាជីវកម្ម)
- `contact_phone` (TEXT, nullable)
- `total_amount` (DECIMAL)
- `paid_amount` (DECIMAL, default 0)
- `currency` (ENUM: `USD`, `KHR`)
- `interest_rate` (DECIMAL, default 0)
- `due_date` (DATE)
- `status` (ENUM: `ACTIVE`, `PARTIALLY_PAID`, `SETTLED`, `OVERDUE`)
- `created_at` (TIMESTAMPTZ)

### 3.5 `debt_repayments` (ប្រវត្តិសងបំណុលរំលស់)
- `id` (UUID, PK)
- `debt_id` (UUID, FK -> debts)
- `wallet_id` (UUID, FK -> wallets_accounts)
- `amount_paid` (DECIMAL)
- `payment_date` (TIMESTAMPTZ)
- `note` (TEXT)

### 3.6 `notifications` (ប្រព័ន្ធជូនដំណឹង)
- `id` (UUID, PK)
- `workspace_id` (UUID, FK -> workspaces)
- `debt_id` (UUID, FK -> debts, nullable)
- `title` (TEXT)
- `message` (TEXT)
- `type` (ENUM: `DUE_DATE`, `SYSTEM`, `AI_ADVICE`)
- `is_read` (BOOLEAN, default false)
- `scheduled_at` (TIMESTAMPTZ)

---

## ៤. មុខងារពិសេស (Special Features)

### 4.1 ផ្ទាំងចូលគណនីទំនើប (Smart Authentication)
- ចូលដោយលេខទូរស័ព្ទ (+855)
- ចូលរហ័សដោយ **FaceID / ស្កេនមេដៃ** ឬ **PIN ៤ ខ្ទង់**
- ចូលតាម Telegram OTP, Google និង Apple
- ប៊ូតុង **"សាកល្បងប្រើប្រាស់សិន" (Guest Mode)**

### 4.2 ទីប្រឹក្សាឆ្លាតវៃ (AI Financial Advisor)
- វិភាគសមាមាត្របំណុលធៀបចំណូល (Debt-to-Income Ratio)
- ណែនាំយុទ្ធសាស្ត្រសងបំណុល (Snowball ឬ Avalanche)
- ព្រមានទុកជាមុនពីហានិភ័យខ្វះសាច់ប្រាក់នៅចុងខែ

### 4.3 ការរំលឹកបំណុលស្វ័យប្រវត្តិ (Debt Alerts)
- Cron job ស្កេនរៀងរាល់ព្រឹកម៉ោង ៨:០០
- ជូនដំណឹងមុន ៧ ថ្ងៃ, ៣ ថ្ងៃ និងនៅថ្ងៃកំណត់ តាម In-app និង Telegram Bot
- One-click Reminder Template សម្រាប់ផ្ញើទៅកូនបំណុលតាម Telegram

---

## ៥. ផែនទីបង្ហាញផ្លូវនៃការអភិវឌ្ឍ (Development Roadmap)

- [x] **ដំណាក់កាលទី ១:** Setup Next.js, Tailwind, shadcn/ui និងប្រព័ន្ធ Auth (Phone + Biometric Mock + Guest Mode)
- [x] **ដំណាក់កាលទី ២:** បង្កើត Workspace Switcher (ផ្ទាល់ខ្លួន vs អាជីវកម្ម) និងតារាងកាបូបលុយ (Wallets)
- [x] **ដំណាក់កាលទី ៣:** បង្កើតទម្រង់កត់ត្រាចំណូល-ចំណាយ (USD/KHR) និង Dashboard
- [x] **ដំណាក់កាលទី ៤:** បង្កើតម៉ូឌុលគ្រប់គ្រងបំណុល (Debt Engine) និងប្រព័ន្ធសងរំលស់
- [ ] **ដំណាក់កាលទី ៥:** ភ្ជាប់ Telegram Bot Notification និងទីប្រឹក្សា AI Advisor
- [ ] **ដំណាក់កាលទី ៦:** របាយការណ៍សង្ខេបចំណេញ-ខាត (P&L) និងមុខងារ Export Excel/PDF
