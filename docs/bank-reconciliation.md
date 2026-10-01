# Bank reconciliation (PRO): R1

Find where a wallet and the real bank account disagree, using the bank's statement export.

## Flow

1. **Wallet › ផ្ទៀងផ្ទាត់ជាមួយរបាយការណ៍ធនាគារ:** choose a CSV or Excel file.
   - The file is read **on the device** (SheetJS). Only cleaned-up lines and a SHA-256 of the file reach the server.
2. **Columns:** the header row and column roles are guessed from common English/Khmer labels. The user can change any of them.
   - The mapping is remembered per wallet, for the same header.
   - The running-balance check must pass. If a row doesn't add up, the screen names it.
3. **Compare:** each statement line is matched to this wallet's transactions. The amount must be exactly equal; date (±3 days), shared words and uniqueness add points.
   - **Matched** (≥70 points): shown with ✓.
   - **Review** (40–69 points): the user confirms or rejects the match.
   - **Missing:** "Add to app", with a category guessed from past choices or bank-fee words. "Add all" does the whole list.
   - **App only:** in the app but not on the statement. A likely double entry is flagged and can be deleted.
4. **Save:** one database call, `import_statement`, saves everything at once.
   - It checks each match: same wallet, not already matched, and the amount and sign agree.
   - It adds the missing rows (marked ✓, with the bank reference).
   - Optionally it adds one adjustment, dated the statement's last day, so the wallet equals the bank's closing balance.

## Rules

- **PRO only**, checked in the database (`plan_required`).
- **Same file twice** is refused (`already_imported`).
- **Overlapping statements:** lines already imported are skipped. The fingerprint is date + amount + reference/description + position among identical lines that day.
- **Keeping the ✓ honest:** changing a reconciled row's money, or deleting it, removes its ✓ and puts its statement line back to unmatched.
- **Undo:** "Previous imports › undo" removes the lines and the ✓ marks. Rows that were added stay.
- **Limits:** up to 3,000 lines and 5 MB per file. PDF comes in R2.

## Tables

- `statement_imports`: one per file. Holds the period, opening/closing balance and the file hash.
- `statement_lines`: one per line. Holds the status (UNMATCHED, MATCHED, CREATED or IGNORED) and the linked transaction.
- `transactions.reconciled_at` and `transactions.bank_ref`.
- `wallets_accounts.last_reconciled_on` and `wallets_accounts.last_reconciled_balance`.

## R2 (next)

Automatic ABA and ACLEDA profiles, including PDF statements, built from real sanitized sample exports. These become fixed test files, so a change in a bank's format shows up as a failing test.
