# Fridge

A private food tracker for one household of two people: an **Android app** (APK) for one, a **web app** (GitHub Pages)
for the other. Both see the same food, places and recipes, live.

- **Places.** Fridge, Freezer and Emergency supplies come ready. Add your own (wine rack, garage shelf…), rename,
  reorder or remove them in the app (Settings → Places, or **+ Place** on the Food tab). Changes appear on both devices.
- **Photos in batch, sorted by AI.** Snap or pick dozens of photos at once. They upload straight away and a background
  worker recognises each food with Claude Haiku 5.5 (about €0.0003 per photo). It also links each food to real products
  sold in Portuguese supermarkets. In **Review** you add it as a new item (picking the place), **match the photo to an
  item you already created** (the app suggests look-alikes, or pick any item), or refuse it.
- **Supermarket products with Nutri-Score.** Matches come from Open Food Facts (Portugal), with Nutri-Score, NOVA group,
  kcal and barcode. The real logos of Continente, Pingo Doce, Lidl, Auchan, Intermarché, Mercadona, Minipreço and Aldi
  appear on products, filters and AI options.
- **Fuzzy search while typing.** When you add an item by hand, typing `iogurt grgo` still finds "Iogurte Grego". Products
  from the supermarkets you pick are listed first, and you can also scan a barcode.
- **Opens instantly.** Each device keeps a copy of the food, places, recipes and photo links (SQLite on Android, browser
  storage on web). The app shows that copy at once, refreshes once in the background, then applies live changes in place
  instead of reloading. Photo links are signed in one batch per screen. Works offline; signing out erases the copy.
- **Expiry.** Quick expiry dates, an "expiring soon" banner, and sorting by expiring first or healthiest.
- **Recipes (Cookidoo / Bimby).** The Recipes tab keeps the Cookidoo recipes you like: paste the link, list the
  ingredients and link each one to an item in the house. It shows "3 of 4 in the house", a to-buy list, what you can
  cook now, what is on the menu and how often you cooked it. "Cooked it" can remove the used items. Each item's page
  lists the recipes that use it. "Find on Cookidoo" still turns what is about to expire into a Cookidoo (pt-PT) search.
  Cookidoo has no public API, so the app only stores and opens links; it never signs in to Cookidoo.
- **Security.** Only two allow-listed e-mails can exist (the database refuses a third): sign-ups are blocked in the database. Every table and photo is
  behind row-level security, photos sit in a private bucket with 1-hour links, two-step sign-in (authenticator app) is
  available in Settings, and the AI key lives only on the server.

## Setup (about 20 minutes, once)

### 1. Supabase (free tier is enough)
1. Create a project at <https://supabase.com> (Free plan; pick the region closest to you, e.g. *West EU*).
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), **put your two e-mails in step 1**, and run it.
   The script refuses to run until the example e-mails are replaced. **Upgrading an existing project?** Just run the
   new script again: it adds places and recipes, and moves old "Pantry" items to "Emergency supplies".
3. Go to **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**, and leave Email enabled.
4. Go to **Authentication → Users → Add user → Create new user** and create both accounts (tick *Auto confirm*).
   Use long passwords. Then turn on **Two-step sign-in** for each account in the app's Settings (recommended).
5. Optional hardening under **Authentication**: set a minimum password length of 12+ under *Policies/Passwords*, and
   check that *Database → Publications → supabase_realtime* lists `items`, `photo_jobs`, `locations` and `recipes`
   (the script adds them).
6. Note the following from **Project Settings → API**: the *Project URL*, the *anon public* key and the *Project ref*.

### 2. AI worker (Supabase Edge Function)
1. Get an API key at <https://console.anthropic.com> and add a few euros of credit (1,000 photos ≈ €0.30).
2. Deploy it.
   From your computer: `npx supabase login`, then
     `npx supabase functions deploy process-photos --project-ref <ref> --no-verify-jwt` and
     `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref <ref>`

   `--no-verify-jwt` is intended: the function checks the caller itself and only accepts the two allowed accounts.

### 3. Website (GitHub Pages)
GitHub Actions only builds the website. Every push to `main` publishes it at `https://<user>.github.io/<repo>/`
(**Settings → Pages → Source: GitHub Actions**).

- **Without secrets the site runs in demo mode.** There's no login and no Supabase: items and photos are saved in that
  browser only, and you name photos yourself in Review (no AI). This is handy for trying it out.
- **For the real shared version**, add these under **Settings → Secrets and variables → Actions** and re-run the
  *Web app* action:

| Secret | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | anon public key (meant to be public: the database rules do the protecting) |

  The sign-in screen still has a "Try it without an account" button for demo mode.

### 4. Android APK (built on your computer)
You need Node 22, JDK 17 and the Android SDK (installing Android Studio gives you both of the last two).
```bash
cp .env.example .env        # fill in the Supabase URL + anon key (leave empty for a demo-only APK)
npm install
npm run android:apk         # Windows: npm run android:apk:win
```
The APK ends up in `android/app/build/outputs/apk/release/app-release.apk`. Copy it to the phone and open it (allow
"install unknown apps"). Or, with the phone plugged in over USB: `npx expo run:android --variant release`.

The default build is signed with a debug key, which is fine for personal use. Keep the same machine/`android` folder so
updates install over the old version.

### Free-tier notes
- A Free project **pauses after 7 days with no activity**. Daily use keeps it awake; if it pauses, press *Restore* in the
  dashboard (data is kept).
- Limits that matter here: 500 MB database (years of items and recipes), 1 GB file storage (photos are resized to
  ~150–250 KB, so roughly 4,000+ photos; photos you refuse are deleted), 500,000 Edge Function calls a month.

### Running locally
```bash
npm install
npx expo start         # press w for web, or scan the QR with Expo Go on Android
```

## How the AI flow works
1. **Add photos** resizes each photo to 1280 px, uploads it to `fridge-photos/inbox/` and creates a `photo_jobs` row.
2. The app calls the `process-photos` function. The function answers straight away and keeps working in the background.
   It claims jobs one by one, asks Claude Haiku 5.5 what food is in the photo (structured output: Portuguese name, brand,
   quantity, search query, storage place, shelf life), then searches Open Food Facts Portugal. Searches are cached in
   `product_cache` and throttled to the API's limits. After ~110 s it hands over to a fresh run until the queue is empty.
3. **Review** updates live. "Add new" creates the item in the place you pick, with the chosen product's Nutri-Score, stores and barcode,
   plus an expiry estimate. Refuse drops it. Once every food in a photo is decided, the job disappears. The photo is
   deleted unless an item uses it.

## Project layout
```
src/app/(tabs)/       Food, Add photos, Review, Recipes tabs
src/app/              add / edit item, item details, places, settings (2FA), login
src/app/recipe/       recipe details, save/edit recipe, find on Cookidoo
src/lib/store.ts      local-first sync: device cache → one fetch → realtime patches (shared by all screens)
src/lib/              Supabase client, items, jobs, places, recipes, local DB (.ts native / .web.ts browser), products
supabase/schema.sql   tables (items, places, recipes, photo jobs), allow-list, RLS, storage, realtime, job queue
supabase/functions/   process-photos AI worker (Deno)
.github/workflows/    web.yml → GitHub Pages (website only)
```

Product data: © Open Food Facts contributors, ODbL. Supermarket logos are loaded from each chain's own website icon and
belong to their owners. They are shown only to identify where a product is sold.
