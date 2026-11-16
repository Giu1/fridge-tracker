-- Fridge tracker: private shared household (fridge, freezer, emergency supplies, recipes) for exactly two people.
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
  quantity      text,
  location      text not null default 'fridge',
  expires_on    date,
  photo_path    text,
  barcode       text,
  brand         text,
  product_name  text,
  stores        text,
  nutriscore    text check (nutriscore in ('a','b','c','d','e')),
  nova_group    smallint,
  kcal_100g     numeric,
  off_image_url text,
  notes         text,
  added_by      uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists items_created_idx on public.items (created_at desc);

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

-- 3b. Saved Cookidoo (Bimby) recipes, ingredients linked to stored items -------------------
create table if not exists public.recipes (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(title) between 1 and 200),
  url            text check (url is null or (url ~* '^https://' and length(url) <= 2000)),
  notes          text check (notes is null or length(notes) <= 5000),
  ingredients    jsonb not null default '[]'::jsonb   -- [{"name":"natas","item_id":"<items.id>"|null}]
                 check (jsonb_typeof(ingredients) = 'array' and jsonb_array_length(ingredients) <= 60),
  planned        boolean not null default false,       -- on the menu
  times_cooked   integer not null default 0 check (times_cooked >= 0),
  last_cooked_on date,
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists recipes_touch on public.recipes;
create trigger recipes_touch before update on public.recipes for each row execute function public.touch_updated_at();

-- 3c. Product pages of items at each supermarket, with the data read from them (no AI) ----------
-- One link per item per shop. The app reads the page (schema.org data, meta tags, labelled text, then Open Food Facts
-- by EAN) and stores the main fields as columns and everything it found in `data`.
create table if not exists public.product_links (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items(id) on delete cascade,
  store       text not null check (store in ('continente','pingo-doce','lidl','auchan','intermarche','mercadona','minipreco','aldi','el-corte-ingles')),
  url         text not null check (url ~* '^https://' and length(url) <= 2000),
  status      text not null default 'pending' check (status in ('pending','ok','failed')),
  error       text check (error is null or length(error) <= 1000),
  name        text,
  brand       text,
  ean         text,
  price       numeric,
  currency    text,
  unit_price  text,
  quantity    text,
  image_url   text,
  data        jsonb check (data is null or (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000)),
  fetched_at  timestamptz,
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (item_id, store)
);
create index if not exists product_links_ean_idx on public.product_links (ean);
drop trigger if exists product_links_touch on public.product_links;
create trigger product_links_touch before update on public.product_links for each row execute function public.touch_updated_at();
alter table public.product_links enable row level security;
drop policy if exists "allowed users manage product links" on public.product_links;
create policy "allowed users manage product links" on public.product_links
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());
alter table public.product_links replica identity full;
do $$ begin alter publication supabase_realtime add table public.product_links;
exception when duplicate_object then null; end $$;

-- 4. Row level security: only the two allowed accounts, nothing for anyone else ---------
alter table public.locations     enable row level security;
alter table public.recipes       enable row level security;
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

drop policy if exists "allowed users manage recipes" on public.recipes;
create policy "allowed users manage recipes" on public.recipes
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

-- 5. Live sync between the phone and the browser ---------------------------------
alter table public.items replica identity full;
alter table public.photo_jobs replica identity full;
alter table public.locations replica identity full;
alter table public.recipes replica identity full;
alter table public.categories replica identity full;
do $$ begin alter publication supabase_realtime add table public.locations;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.categories;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.recipes;
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
