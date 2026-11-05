# Fridge

A private fridge tracker for two people: an **Android app** for one, a **web app** (GitHub Pages) for the other.
Both see the same fridge, live.

- **Photos in batch, sorted by AI.** Snap or pick dozens of photos at once. They upload straight away and a background
  worker recognises each food with Claude Haiku 5.5 (about €0.0003 per photo). It also links each food to real products
  sold in Portuguese supermarkets. In **Review** you accept the best match, pick another option, or refuse it.
- **Supermarket products with Nutri-Score.** Matches come from Open Food Facts (Portugal), with Nutri-Score, NOVA group,
  kcal and barcode. The real logos of Continente, Pingo Doce, Lidl, Auchan, Intermarché, Mercadona, Minipreço and Aldi
  appear on products, filters and AI options.
- **Fuzzy search while typing.** When you add an item by hand, typing `iogurt grgo` still finds "Iogurte Grego". Products
  from the supermarkets you pick are listed first, and you can also scan a barcode.
- **Local database.** Each device keeps the products it has seen (SQLite on Android, browser storage on web) plus an offline
  copy of the fridge.
- **Expiry.** Quick expiry dates, an "expiring soon" banner, and sorting by expiring first or healthiest.
- **Receitas Bimby.** Turns what is about to expire into a Cookidoo (pt-PT) recipe search.
- **Security.** Only two allow-listed e-mails can exist: sign-ups are blocked in the database. Every table and photo is
  behind row-level security, photos sit in a private bucket with 1-hour links, two-step sign-in (authenticator app) is
  available in Settings, and the AI key lives only on the server.

## Setup (about 20 minutes, once)

### 1. Supabase (free)
1. Create a project at <https://supabase.com>.
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), **put your two e-mails in step 1**, and run it.
3. Go to **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**, and leave Email enabled.
4. Go to **Authentication → Users → Add user → Create new user** and create both accounts (tick *Auto confirm*).
   Use long passwords.
5. Note the following from **Project Settings → API**: the *Project URL*, the *anon public* key and the *Project ref*.

### 2. AI worker (Supabase Edge Function)
1. Get an API key at <https://console.anthropic.com> and add a few euros of credit (1,000 photos ≈ €0.30).
2. Deploy, using either option:
   - **From your computer:** `npx supabase login`, then
     `npx supabase functions deploy process-photos --project-ref <ref> --no-verify-jwt` and
     `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>`
   - **From GitHub:** add the repo secrets `SUPABASE_ACCESS_TOKEN` (from supabase.com/dashboard/account/tokens) and
     `SUPABASE_PROJECT_REF`, then run the *Deploy AI worker* action. Still set `ANTHROPIC_API_KEY` in Supabase
     (**Edge Functions → Secrets**).

   `--no-verify-jwt` is intended: the function checks the caller itself and only accepts the two allowed accounts.

### 3. GitHub secrets and Pages
In the repo, under **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon public key (meant to be public: the database rules do the protecting) |

Then go to **Settings → Pages → Source: GitHub Actions**. Every push to `main` publishes the web app at
`https://<user>.github.io/<repo>/`.

### 4. Android APK
Open **Actions → Android APK → Run workflow**, or push a tag like `v1.0.0` to also get a GitHub Release. Download
`fridge.apk` and open it on the phone (allow "install unknown apps").

To install updates over the old app without uninstalling, sign every build with the same key. Do this once:
```bash
keytool -genkeypair -v -keystore release.jks -alias fridge -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.jks   # paste into secret ANDROID_KEYSTORE_BASE64; password into ANDROID_KEYSTORE_PASSWORD
```

### Running locally
```bash
cp .env.example .env   # fill in URL + anon key
npm install
npx expo start         # press w for web, or scan the QR with Expo Go on Android
```

## How the AI flow works
1. **Add photos** resizes each photo to 1280 px, uploads it to `fridge-photos/inbox/` and creates a `photo_jobs` row.
2. The app calls the `process-photos` function. The function answers straight away and keeps working in the background.
   It claims jobs one by one, asks Claude Haiku 5.5 what food is in the photo (structured output: Portuguese name, brand,
   quantity, search query, storage place, shelf life), then searches Open Food Facts Portugal. Searches are cached in
   `product_cache` and throttled to the API's limits. After ~110 s it hands over to a fresh run until the queue is empty.
3. **Review** updates live. Accept creates the fridge item with the chosen product's Nutri-Score, stores and barcode,
   plus an expiry estimate. Refuse drops it. Once every food in a photo is decided, the job disappears. The photo is
   deleted unless an item uses it.

## Project layout
```
src/app/(tabs)/       Fridge, Add photos, Review tabs
src/app/              add / edit item, item details, settings (2FA), login, Bimby recipes
src/lib/              Supabase client, items + jobs, local DB (.ts native / .web.ts browser), product search, stores
supabase/schema.sql   tables, allow-list, RLS, storage, realtime, job queue
supabase/functions/   process-photos AI worker (Deno)
.github/workflows/    web → GitHub Pages, Android APK, edge function deploy
```

Product data: © Open Food Facts contributors, ODbL. Supermarket logos are loaded from each chain's own website icon and
belong to their owners. They are shown only to identify where a product is sold.
