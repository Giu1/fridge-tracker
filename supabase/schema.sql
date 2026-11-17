-- Fridge tracker: private shared household (fridge, freezer, emergency supplies, receipts) for exactly two people.
-- Run in Supabase: Dashboard > SQL Editor > New query > paste everything > Run.
-- FIRST edit the two e-mail addresses in step 1.
-- Safe to run again: it only adds what is missing, so re-run it after updating the app to upgrade an existing project.

-- 1. The only two accounts allowed ---------------------------------------------
create table if not exists public.app_users (
  email text primary key check (email = lower(email))
);
alter table public.app_users enable row level security;  -- no policies: invisible to the API

-- Never more than two accounts, whatever is run later.
create or replace function public.app_users_max_two() returns trigger
language plpgsql set search_path = public as $$
begin
  if (select count(*) from public.app_users) > 2 then
    raise exception 'Only two accounts are allowed. Remove one from public.app_users first.';
  end if;
  return null;
end $$;
drop trigger if exists app_users_max_two on public.app_users;
create trigger app_users_max_two after insert or update on public.app_users
  for each statement execute function public.app_users_max_two();

do $$
declare
  wanted text[] := array[
    'you@example.com',        -- <-- your e-mail (Android app)
    'wife@example.com'        -- <-- your wife's e-mail (web app)
  ];
begin
  if 'you@example.com' = any(wanted) or 'wife@example.com' = any(wanted) then
    raise exception 'Edit the two e-mail addresses in step 1 of this script first.';
  end if;
  delete from public.app_users where email <> all (select lower(unnest(wanted)));
  insert into public.app_users (email) select lower(unnest(wanted)) on conflict do nothing;
end $$;

-- Block any sign-up that is not on the list (defence in depth: also turn sign-ups off in Auth settings).
create or replace function public.block_unknown_signups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.app_users where email = lower(new.email)) then
    raise exception 'sign-ups are closed';
  end if;
  return new;
end $$;
drop trigger if exists block_unknown_signups on auth.users;
create trigger block_unknown_signups before insert on auth.users
  for each row execute function public.block_unknown_signups();

-- Access check used by every rule below: on the list AND, once two-factor is enabled
-- for that account, signed in with the second factor (aal2).
create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from public.app_users where email = lower(coalesce(auth.jwt() ->> 'email', '')))
     and (
       coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
     );
$$;
revoke all on function public.is_allowed() from public, anon;
grant execute on function public.is_allowed() to authenticated;

-- 2. Places (Fridge, Freezer, Emergency supplies + any you add in the app) and items ----------
create table if not exists public.locations (
  id         text primary key default gen_random_uuid()::text,
  label      text not null check (length(label) between 1 and 40),
  icon       text check (icon is null or length(icon) <= 16),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists locations_label_idx on public.locations (lower(label));
insert into public.locations (id, label, icon, sort) values
  ('fridge',    'Fridge',             '🥛', 0),
  ('freezer',   'Freezer',            '🧊', 1),
  ('emergency', 'Emergency supplies', '🥫', 2)
on conflict (id) do nothing;

create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 200),
  amount        integer not null default 1,
  location      text not null default 'fridge',
  expires_on    date,
  photo_path    text,
  barcode       text,
  brand         text,
  product_name  text,
  nova_group    smallint,
  kcal_100g     numeric,
  off_image_url text,
  notes         text,
  added_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists items_created_idx on public.items (created_at desc);

-- Upgrade: the amount is a whole number now (was free text "quantity"). A plain count ("3", "2 x", "4 un") is kept;
-- anything else ("500 g", "1 L", "half") becomes 1 and the old text is kept in the item's notes as "Size: ...".
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'items' and column_name = 'quantity') then
    alter table public.items add column if not exists amount integer;
    update public.items set
      amount = coalesce(substring(quantity from '^\s*(\d{1,5})\s*(x|un|unid|unidades|units?|pcs?)?\.?\s*$')::integer, 1),
      notes  = case
                 when quantity is null or btrim(quantity) = ''
                   or quantity ~* '^\s*\d{1,5}\s*(x|un|unid|unidades|units?|pcs?)?\.?\s*$' then notes
                 else concat_ws(E'\n', nullif(notes, ''), 'Size: ' || btrim(quantity))
               end;
    alter table public.items drop column quantity;
  end if;
end $$;
update public.items set amount = 1 where amount is null;
alter table public.items alter column amount set default 1;
alter table public.items alter column amount set not null;
alter table public.items drop constraint if exists items_amount_check;
alter table public.items add constraint items_amount_check check (amount between 0 and 99999);

-- Upgrade: Nutri-Score and supermarket store names are no longer used.
alter table public.items drop column if exists nutriscore;
alter table public.items drop column if exists stores;

-- Upgrade from the first version (fixed fridge/freezer/pantry): pantry becomes Emergency supplies,
-- and an item's place must be one of the places above (renaming a place keeps its items; a place with items
-- inside cannot be deleted).
alter table public.items drop constraint if exists items_location_check;
update public.items set location = 'emergency' where location = 'pantry';
alter table public.items drop constraint if exists items_location_fkey;
alter table public.items add constraint items_location_fkey
  foreign key (location) references public.locations (id) on update cascade on delete restrict;
create index if not exists items_location_idx on public.items (location);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();

-- 2b. Categories (Dairy, Meat, ...): a coloured tag on each item, separate from where it is kept.
-- Created, renamed, recoloured and removed in the app. Removing one leaves its items without a category.
create table if not exists public.categories (
  id         text primary key default gen_random_uuid()::text,
  label      text not null check (length(label) between 1 and 40),
  color      text not null default '#8B8D98' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists categories_label_idx on public.categories (lower(label));
-- Icon shown on the chip and card (a Material Community Icons name, picked in the app).
alter table public.categories add column if not exists icon text check (icon is null or length(icon) between 1 and 40);
-- A few to start with, only while there are none (so ones you delete do not come back on a re-run).
insert into public.categories (id, label, color, sort)
select * from (values
  ('dairy',     'Dairy',          '#0090FF', 0),
  ('meat',      'Meat',           '#E5484D', 1),
  ('fish',      'Fish',           '#12A594', 2),
  ('veg',       'Vegetables',     '#46A758', 3),
  ('fruit',     'Fruit',          '#F76B15', 4),
  ('grains',    'Bread & grains', '#FFC53D', 5),
  ('drinks',    'Drinks',         '#6E56CF', 6),
  ('leftovers', 'Leftovers',      '#8D6E63', 7)
) v(id, label, color, sort)
where not exists (select 1 from public.categories)
on conflict do nothing;
-- Icons for the starters (only where none was picked yet; others are guessed from the name in the app).
update public.categories c set icon = v.icon
from (values
  ('dairy', 'cheese'), ('meat', 'food-drumstick'), ('fish', 'fish'), ('veg', 'carrot'),
  ('fruit', 'food-apple'), ('grains', 'baguette'), ('drinks', 'bottle-soda-classic'), ('leftovers', 'food-takeout-box')
) v(id, icon)
where c.id = v.id and c.icon is null;

alter table public.items add column if not exists category_id text;
alter table public.items drop constraint if exists items_category_fkey;
alter table public.items add constraint items_category_fkey
  foreign key (category_id) references public.categories (id) on update cascade on delete set null;
create index if not exists items_category_idx on public.items (category_id);

-- 3. Photo inbox: uploaded photos waiting for you to say what they are (no AI) ----------
create table if not exists public.photo_jobs (
  id          uuid primary key default gen_random_uuid(),
  photo_path  text not null,
  status      text not null default 'ready' check (status in ('pending','processing','ready','failed')),
  attempts    smallint not null default 0,
  detections  jsonb,           -- one entry per food in the photo, named by you in Review
  decisions   jsonb not null default '[]'::jsonb,  -- per detection: {"status":"accepted","item_id":...} | {"status":"rejected"}
  error       text,
  cost_usd    numeric,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists photo_jobs_status_idx on public.photo_jobs (status, created_at);
drop trigger if exists photo_jobs_touch on public.photo_jobs;
create trigger photo_jobs_touch before update on public.photo_jobs for each row execute function public.touch_updated_at();

-- Upgrade from the AI version: no worker any more, so everything waiting goes straight to Review.
alter table public.photo_jobs alter column status set default 'ready';
update public.photo_jobs set status = 'ready' where status <> 'ready';
drop function if exists public.claim_photo_job();
drop table if exists public.product_cache;

-- 3b. Recipes and supermarket product links were removed from the app: drop their tables.
-- (This deletes saved recipes and product links. Their Edge Function "fetch-product" can be deleted in the dashboard.)
drop table if exists public.recipes;
drop table if exists public.product_links;

-- 3c. Receipts: the receipt file (photo or PDF) and, once you upload the list you made from it, the draft lines you
-- check on the bulk edit page before they become items. A receipt with no file is a list imported on its own.
create table if not exists public.receipts (
  id          uuid primary key default gen_random_uuid(),
  title       text check (title is null or length(title) <= 200),
  file_path   text,
  file_name   text check (file_name is null or length(file_name) <= 200),
  mime_type   text,
  size_bytes  integer,
  status      text not null default 'sent' check (status in ('sent','drafts','done')),
  item_count  integer not null default 0,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists receipts_created_idx on public.receipts (created_at desc);
drop trigger if exists receipts_touch on public.receipts;
create trigger receipts_touch before update on public.receipts for each row execute function public.touch_updated_at();

create table if not exists public.receipt_items (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.receipts(id) on delete cascade,
  sort        integer not null default 0,
  name        text not null check (length(name) between 1 and 200),
  amount      integer not null default 1 check (amount between 0 and 99999),
  location    text,
  category_id text,
  expires_on  date,
  notes       text check (notes is null or length(notes) <= 2000),
  photo_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists receipt_items_receipt_idx on public.receipt_items (receipt_id, sort);
drop trigger if exists receipt_items_touch on public.receipt_items;
create trigger receipt_items_touch before update on public.receipt_items for each row execute function public.touch_updated_at();

-- 3d. Photos remembered by name: every photo an item ever had, so a later receipt line with a similar name
-- ("LEITE MG MIMOSA 1L" ~ "Leite meio gordo Mimosa") can suggest it. Filled automatically from items.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists public.name_photos (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 200),
  key         text generated always as (lower(btrim(name))) stored,
  photo_path  text not null,
  uses        integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (key, photo_path)
);
create index if not exists name_photos_trgm_idx on public.name_photos using gin (key extensions.gin_trgm_ops);
drop trigger if exists name_photos_touch on public.name_photos;
create trigger name_photos_touch before update on public.name_photos for each row execute function public.touch_updated_at();

create or replace function public.remember_item_photo() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.photo_path is not null and (tg_op = 'INSERT' or new.photo_path is distinct from old.photo_path or new.name is distinct from old.name) then
    insert into public.name_photos (name, photo_path) values (new.name, new.photo_path)
    on conflict (key, photo_path) do update set uses = public.name_photos.uses + 1, name = excluded.name;
  end if;
  return new;
end $$;
drop trigger if exists items_remember_photo on public.items;
create trigger items_remember_photo after insert or update of photo_path, name on public.items
  for each row execute function public.remember_item_photo();

-- Photos items already have.
insert into public.name_photos (name, photo_path)
select distinct on (lower(btrim(name)), photo_path) name, photo_path from public.items where photo_path is not null
on conflict (key, photo_path) do nothing;

-- Fuzzy search: for each name, the best matching remembered photos (one row per photo).
create or replace function public.match_photos(names text[], per_name integer default 4, min_score real default 0.3)
returns table (query_index integer, name text, photo_path text, score real)
language sql stable set search_path = public, extensions as $$
  select q.i::integer, m.name, m.photo_path, m.score
  from unnest(names) with ordinality as q(txt, i)
  cross join lateral (
    select d.name, d.photo_path, d.score from (
      select distinct on (np.photo_path) np.name, np.photo_path, np.uses,
        greatest(
          similarity(unaccent(np.key), unaccent(lower(q.txt))),
          word_similarity(unaccent(np.key), unaccent(lower(q.txt))),
          word_similarity(unaccent(lower(q.txt)), unaccent(np.key))
        )::real as score
      from public.name_photos np
      where public.is_allowed() and length(btrim(q.txt)) >= 2
      order by np.photo_path, score desc
    ) d
    where d.score >= min_score
    order by d.score desc, d.uses desc
    limit per_name
  ) m
  order by q.i, m.score desc;
$$;
revoke all on function public.match_photos(text[], integer, real) from public, anon;
grant execute on function public.match_photos(text[], integer, real) to authenticated;

-- 4. Row level security: only the two allowed accounts, nothing for anyone else ---------
alter table public.locations     enable row level security;
alter table public.receipts      enable row level security;
alter table public.receipt_items enable row level security;
alter table public.name_photos   enable row level security;
alter table public.categories    enable row level security;
alter table public.items         enable row level security;
alter table public.photo_jobs    enable row level security;

drop policy if exists "allowed users manage items" on public.items;
create policy "allowed users manage items" on public.items
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users manage jobs" on public.photo_jobs;
create policy "allowed users manage jobs" on public.photo_jobs
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users manage places" on public.locations;
create policy "allowed users manage places" on public.locations
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users manage categories" on public.categories;
create policy "allowed users manage categories" on public.categories
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users manage receipts" on public.receipts;
create policy "allowed users manage receipts" on public.receipts
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users manage receipt items" on public.receipt_items;
create policy "allowed users manage receipt items" on public.receipt_items
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users manage name photos" on public.name_photos;
create policy "allowed users manage name photos" on public.name_photos
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- 5. Live sync between the phone and the browser ---------------------------------
alter table public.items replica identity full;
alter table public.photo_jobs replica identity full;
alter table public.locations replica identity full;
alter table public.receipts replica identity full;
alter table public.receipt_items replica identity full;
alter table public.categories replica identity full;
do $$ begin alter publication supabase_realtime add table public.locations;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.receipts;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.receipt_items;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.items;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.photo_jobs;
exception when duplicate_object then null; end $$;

-- 6. Private photo storage --------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fridge-photos', 'fridge-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fridge photos read"   on storage.objects;
drop policy if exists "fridge photos write"  on storage.objects;
drop policy if exists "fridge photos delete" on storage.objects;
create policy "fridge photos read" on storage.objects for select to authenticated
  using (bucket_id = 'fridge-photos' and public.is_allowed());
create policy "fridge photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'fridge-photos' and public.is_allowed());
create policy "fridge photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'fridge-photos' and public.is_allowed());

-- 7. Private receipt storage (photos and PDFs of receipts, downloadable by both accounts) ------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 20971520,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipts read"   on storage.objects;
drop policy if exists "receipts write"  on storage.objects;
drop policy if exists "receipts delete" on storage.objects;
create policy "receipts read" on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_allowed());
create policy "receipts write" on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_allowed());
create policy "receipts delete" on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_allowed());
