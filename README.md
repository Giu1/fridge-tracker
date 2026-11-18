# Fridge

A private food tracker for one household of two people: an **Android app** (APK) for one, a **web app** (GitHub Pages)
for the other. Both see the same food, places and receipts, live.

- **Places.** Fridge, Freezer and Emergency supplies come ready. Add your own (wine rack, garage shelf…), rename,
  reorder or remove them in the app (Settings → Places, or **+ Place** on the Food tab). Changes appear on both devices.
- **Receipts, no AI in the app.** The **Receipts** tab stores a photo or PDF of each receipt in a private bucket,
  listed and downloadable on both devices. Download it, turn it into a list with whatever AI you like (outside the
  app), then **upload the list** (paste it or pick the file). Every line becomes a draft and opens a **Check the list**
  page where you correct the whole list at once: name, amount, place, category, expiry, photo. Nothing is added until
  you press Save. See [Receipt list format](#receipt-list-format).
- **What you spend, month by month.** Each receipt has an amount paid, a purchase day and a shop (typed in, or taken
  from the uploaded list). The Receipts tab reads like a timeline: one section per month with its total, and a summary
  card with this month's spending, the change from last month and a bar chart of the last six months.
- **Photos suggested by name.** For each line the app fuzzy-searches the database (Postgres `pg_trgm`, accents ignored)
  for photos that items with a similar name had before ("LEITE MG MIMOSA" finds "Leite meio gordo Mimosa"), and uses an
  exact name match straight away. Lines without a photo can get one later on the item page; every photo an item gets
  is remembered for its name (`name_photos`) so future receipts suggest it.
- **Photos in batch.** Snap or pick dozens of photos at once; they wait in a photo inbox (Add photos → Name them) where
  you say what each one is or match it to an item you already created.
- **Whole-number amounts.** Each item has an amount (2, 6, 12…) with − / + buttons.
- **Fuzzy search while typing.** When you add an item by hand, typing `iogurt grgo` still finds "Iogurte Grego"
  (Open Food Facts Portugal), and you can also scan a barcode.
- **Opens instantly.** Each device keeps a copy of the food, places, receipts and photo links (SQLite on Android, browser
  storage on web). The app shows that copy at once, refreshes once in the background, then applies live changes in place
  instead of reloading. Photo links are signed in one batch per screen. Works offline; signing out erases the copy.
- **Expiry.** Quick expiry dates, an "expiring soon" banner, and sorting by expiring first or by category.
- **Security.** Only two allow-listed e-mails can exist (the database refuses a third): sign-ups are blocked in the database. Every table and photo is
  behind row-level security, photos sit in a private bucket with 1-hour links, two-step sign-in (authenticator app) is
  available in Settings. The app only ever holds the **publishable** key; the secret key is never needed.

## Setup (about 20 minutes, once)

### 1. Supabase (free tier is enough)
1. Create a project at <https://supabase.com> (Free plan; pick the region closest to you, e.g. *West EU*).
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), **put your two e-mails in step 1**, and run it.
   The script refuses to run until the example e-mails are replaced. **Upgrading an existing project?** Just run the
   new script again: it only adds what is missing and upgrades old data (see *Upgrading* below).
3. Go to **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**, and leave Email enabled.
4. Go to **Authentication → Users → Add user → Create new user** and create both accounts (tick *Auto confirm*).
   Use long passwords. Then turn on **Two-step sign-in** for each account in the app's Settings (recommended).
5. Optional hardening under **Authentication**: set a minimum password length of 12+ under *Policies/Passwords*, and
   check that *Database → Publications → supabase_realtime* lists `items`, `photo_jobs`, `locations`, `categories`,
   `receipts` and `receipt_items` (the script adds them).
6. Note two values:
   - the **Project URL** (`https://<ref>.supabase.co`, under *Project Settings → Data API*, or the *Connect* button), and
   - the **publishable key** `sb_publishable_…` (*Project Settings → API Keys*).

   **Never use the secret key (`sb_secret_…`) or the legacy `service_role` key in the app or in GitHub secrets.**
   Anything built into the APK or the website can be read by anyone, and the secret key bypasses every database rule.
   The app refuses to start with a secret key. Nothing in this setup needs it. (The legacy *anon* key also works in the
   same place, but Supabase retires legacy keys in early 2027.)
7. **Upgrading from the AI version?** Run the schema again (it removes the AI job queue and puts waiting photos into
   the photo inbox), then delete the old function in *Edge Functions → process-photos* and its `ANTHROPIC_API_KEY` secret in
   *Edge Functions → Secrets*.

### 2. Website (GitHub Pages)
GitHub Actions only builds the website. Every push to `main` publishes it at `https://<user>.github.io/<repo>/`
(**Settings → Pages → Source: GitHub Actions**).

- **Without secrets the site runs in demo mode.** There's no login and no Supabase: items and photos are saved in that
  browser only. This is handy for trying it out.
- **For the real shared version**, add both of these under **Settings → Secrets and variables → Actions** (as
  repository secrets or as repository variables; both work) and re-run the
  *Web app* action:

| Secret | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` key (meant to be public: the database rules do the protecting). Never the `sb_secret_…` key. |

  The sign-in screen still has a "Try it without an account" button for demo mode.

### 3. Android APK (built on your computer)
You need Node 22, JDK 17 and the Android SDK (installing Android Studio gives you both of the last two).
```bash
cp .env.example .env        # fill in the Supabase URL + publishable key (leave empty for a demo-only APK)
npm install
npm run android:apk         # Windows: npm run android:apk:win
```
The APK ends up in `android/app/build/outputs/apk/release/app-release.apk`. Copy it to the phone and open it (allow
"install unknown apps"). Or, with the phone plugged in over USB: `npx expo run:android --variant release`.

The default build is signed with a debug key, which is fine for personal use. Keep the same machine/`android` folder so
updates install over the old version.

### Upgrading to the receipts version
Run `supabase/schema.sql` again (with your two e-mails in step 1). It:
- turns the old free-text quantity into a whole-number `amount` ("3", "2 x", "4 un" keep their number; anything else
  such as "500 g" becomes 1 and the old text is copied into the item's notes as "Size: 500 g");
- removes Nutri-Score and supermarket store names from items, and **deletes the `recipes` and `product_links` tables**
  (saved recipes and product links are gone after this);
- adds `receipts`, `receipt_items`, `name_photos`, the `match_photos` search function (extensions `pg_trgm` and
  `unaccent`), and the private `receipts` storage bucket.

Then delete the old Edge Function in *Edge Functions → fetch-product* (nothing calls it any more), and install the new
APK on the phone: the old one still sends the removed fields and cannot save items after the upgrade.

### Free-tier notes
- A Free project **pauses after 7 days with no activity**. Daily use keeps it awake; if it pauses, press *Restore* in the
  dashboard (data is kept).
- Limits that matter here: 500 MB database (years of items and receipts), 1 GB file storage (photos are resized to
  ~150–250 KB, so roughly 4,000+ photos; photos you refuse are deleted). No Edge Functions or paid APIs are used. Receipts count toward the 1 GB file storage too (a phone photo is 1–4 MB; delete old receipts from the list when you no longer need them).

### Running locally
```bash
npm install
npx expo start         # press w for web, or scan the QR with Expo Go on Android
```

## How the receipt flow works
1. **Photo of receipt / Photo or PDF file** uploads the photo or PDF (up to 20 MB) to the private `receipts` bucket and adds a `receipts` row.
2. **Download** gives you the file (a 10-minute signed link). Turn it into a list with any AI; the upload screen has a
   ready-made prompt under "Show the list format".
3. **Upload its list** parses the text (no AI) into `receipt_items` drafts linked to that receipt, matching place and
   category names to yours, and opens **Check the list**.
4. On that page each line shows photo suggestions from `match_photos` (fuzzy search over `name_photos`). Fix anything,
   then **Save**: the lines become items in one request and the drafts are removed. Both devices see the drafts live, so
   either of you can finish the check.
5. **Add amount** on a receipt (or the amount itself, to change it) opens a small sheet for the amount paid, the day of
   purchase and the shop. Without a day, a receipt counts for the day it was sent. If the uploaded list has a `total`
   (or prices per line, which are added up), a `date` and a `shop`, they fill these in, unless you already typed them.

## Receipt list format
Only the name is required. Paste or upload any of these:

**JSON** (an array, or an object with an `items` array; a ```json fence around it is fine):
```json
[
  {"name": "Leite meio gordo Mimosa", "amount": 6, "place": "Fridge", "category": "Dairy", "expires_in_days": 7},
  {"name": "Pão de forma", "amount": 1, "expires": "2026-12-01", "notes": "Pingo Doce"}
]
```

**CSV / TSV** with a header line, separated by `,` `;` tab or `|` ("quoted, values" allowed):
```
name;amount;place;category;expires;notes
Leite meio gordo Mimosa;6;Fridge;Dairy;2026-12-01;
Gelado de baunilha;1;Freezer;;;
```

**Plain lines**, one product per line: `6 x Leite meio gordo`, `Leite meio gordo x6`, `Leite meio gordo; 6`,
`Leite meio gordo - 6` or just `Leite meio gordo` (amount 1). Bullets and numbering are ignored.

| Field | Also accepted as | Notes |
|---|---|---|
| `name` | `item`, `product`, `nome`, `produto`, `descricao` | required |
| `amount` | `qty`, `quantity`, `quantidade`, `count` | whole number, default 1 (decimals are rounded) |
| `place` | `location`, `local` | your place's name or id; `frigorifico`, `congelador`, `despensa` also work. Unknown → the place picked on the upload screen |
| `category` | `categoria` | your category's name; unknown → none |
| `expires` | `expires_on`, `expiry`, `validade` | `2026-12-01`, `01/12/2026`, `20261201`, `1/12`… |
| `expires_in_days` | `days`, `shelf_life_days` | instead of a date |
| `notes` | `note`, `brand`, `marca` | kept on the item |
| `price` | `preco`, `valor`, `total` | what the line cost (`5,94`, `5.94`, `5,94 €`); summed into the receipt's amount when the list has no `total` |

In the JSON object form, these keys next to `items` describe the receipt itself: `shop` (`store`, `loja`), `date`
(`2026-11-17` or `17/11/2026`) and `total` (the amount paid, e.g. `42.37`).

The parser lives in `src/lib/receiptList.ts`.

## How the photo flow works
1. **Add photos** resizes each photo to 1280 px, uploads it to the private `fridge-photos/inbox/` folder and creates a
   `photo_jobs` row: the photo inbox, shared live by both devices.
2. In **Name them**, for each food in the photo you search the product by name (this device's product list first, then
   Open Food Facts Portugal) or scan its barcode, pick the place, and either **Add new** or match it to an existing item.
3. Refuse drops a food. Once every food in a photo is decided, the photo leaves the inbox and is deleted unless an item
   (or a remembered name) uses it.

## Project layout
```
src/app/(tabs)/       Food, Add photos, Receipts tabs
src/app/              add / edit item, item details, photo inbox, places, categories, settings (2FA), login
src/app/receipt/      upload a list (import.tsx), check the list (bulk edit, [id].tsx)
src/lib/store.ts      local-first sync: device cache → one fetch → realtime patches (shared by all screens)
src/lib/              Supabase client, items, jobs, places, receipts, receipt list parser, local DB (.ts native / .web.ts browser), products
supabase/schema.sql   tables (items, places, categories, photo jobs, receipts, name photos), allow-list, RLS, storage, realtime
.github/workflows/    web.yml → GitHub Pages (website only)
```

Product data: © Open Food Facts contributors, ODbL.
