# Sign-in setup (frictionless onboarding)

The login screen shows **Continue with Google** first, then "ឬប្រើអ៊ីមែល" (or with email). Passwords only need 6 characters of any kind. New accounts are signed in right away and start on the Free plan.

Three switches live in Supabase, not in the code.

## 1. Instant access: turn off email confirmation

Supabase › **Authentication › Sign In / Providers › Email** › turn **off "Confirm email"** › Save.

Sign-up then returns a session at once and the app opens the dashboard. While it's on, users get "we sent a confirmation link" instead.

## 2. Simple passwords

Supabase › **Authentication › Sign In / Providers › Email** (password settings):
- **Minimum password length:** 6.
- **Password requirements:** none ("No required characters").
- **Leaked password protection:** optional. If on, very common passwords such as `123456` are refused; the app then says "too easy to guess, try another one".

The app checks only the length. If Supabase is stricter, Supabase's rule wins.

## 3. Continue with Google

1. **Google Cloud Console** › APIs & Services › Credentials › **Create OAuth client ID** (Web application).
   - Authorised JavaScript origins: `https://luy.ibmserp.com`
   - Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - The OAuth consent screen needs your app name, support email and the `luy.ibmserp.com` domain.
2. Supabase › **Authentication › Sign In / Providers › Google** › enable, then paste the Client ID and Client secret › Save.
3. Supabase › **Authentication › URL Configuration**: Site URL `https://luy.ibmserp.com`, and add `https://luy.ibmserp.com/auth/callback` to the redirect URLs.
4. On the server, in `.env`: `NEXT_PUBLIC_AUTH_METHODS=google,email`, then rebuild (`docker compose up -d --build`). This variable is read at build time.

Show Google only once step 2 is done; otherwise the button leads to Supabase's "provider is not enabled" error.

Google One Tap (the floating account picker) is a possible later step. It needs Google's script allowed in the security policy and the same Client ID. The button above already signs a user up or in with one tap plus the Google account choice.
