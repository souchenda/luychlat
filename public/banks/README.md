# Bank logos

Logos used in wallet avatars to show which bank or e-wallet a wallet belongs
to. Each one is the institution's trademark, taken from its own official
website on 2026-10-05. They are used only to identify that institution, not
to suggest any partnership or endorsement.

| File | Source |
|---|---|
| `acleda.png` | https://www.acledabank.com.kh/kh/assets/layout/logo1.png |
| `wing.png` | https://www.wingbank.com.kh/images/favicon.png |
| `bakong.svg` | https://bakong.nbc.gov.kh/images/logo.svg: the emblem paths only, white on red, without the wordmark |
| `truemoney.webp` | https://www.truemoney.com.kh/wp-content/uploads/2024/08/favicon-300x300.webp |

The other providers show their letter badge until a sharp official file is
added:
- ABA's site refuses automated downloads.
- Canadia's site only has a small JPEG.

To add a bank, put the file here and set `logo` in
`src/lib/wallets/providers.ts`.
