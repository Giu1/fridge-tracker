-- Fridge tracker: private shared inventory for exactly two people.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste everything > Run.
-- FIRST edit the two e-mail addresses in step 1.

-- 1. The only two accounts allowed ---------------------------------------------
create table if not exists public.app_users (
  email text primary key check (email = lower(email))
);
insert into public.app_users (email) values
  ('you@example.com'),        -- <-- your e-mail (Android app)
  ('wife@example.com')        -- <-- your wife's e-mail (web app)
on conflict do nothing;
alter table public.app_users enable row level security;  -- no policies: invisible to the API

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

-- 2. Fridge items --------------------------------------------------------------
create table if not exists public.items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(name) between 1 and 200),
  quantity      text,
  location      text not null default 'fridge' check (location in ('fridge','freezer','pantry')),
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

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items for each row execute function public.touch_updated_at();

-- 3. AI photo jobs (batch uploads waiting for review) -------------------------------
create table if not exists public.photo_jobs (
  id          uuid primary key default gen_random_uuid(),
  photo_path  text not null,
  status      text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  attempts    smallint not null default 0,
  detections  jsonb,           -- [{ guess..., candidates: [product...] }]
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

-- Worker queue: hand out the next pending job exactly once (also retries jobs stuck > 5 min).
create or replace function public.claim_photo_job() returns public.photo_jobs
language plpgsql security definer set search_path = public as $$
declare j photo_jobs;
begin
  update photo_jobs set status = 'pending'
   where status = 'processing' and updated_at < now() - interval '5 minutes' and attempts < 3;
  update photo_jobs set status = 'failed', error = coalesce(error, 'gave up after 3 attempts')
   where status = 'processing' and updated_at < now() - interval '5 minutes' and attempts >= 3;
  select * into j from photo_jobs where status = 'pending' order by created_at limit 1 for update skip locked;
  if not found then return null; end if;
  update photo_jobs set status = 'processing', attempts = attempts + 1 where id = j.id returning * into j;
  return j;
end $$;
revoke all on function public.claim_photo_job() from public, anon, authenticated;  -- service role only

-- Shared cache of supermarket product searches (keeps Open Food Facts calls low).
create table if not exists public.product_cache (
  query      text primary key,
  results    jsonb not null,
  fetched_at timestamptz not null default now()
);

-- 4. Row level security: only the two allowed accounts, nothing for anyone else ---------
alter table public.items         enable row level security;
alter table public.photo_jobs    enable row level security;
alter table public.product_cache enable row level security;

drop policy if exists "allowed users manage items" on public.items;
create policy "allowed users manage items" on public.items
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users manage jobs" on public.photo_jobs;
create policy "allowed users manage jobs" on public.photo_jobs
  for all to authenticated using (public.is_allowed()) with check (public.is_allowed());

drop policy if exists "allowed users read cache" on public.product_cache;
create policy "allowed users read cache" on public.product_cache
  for select to authenticated using (public.is_allowed());

-- 5. Live sync between the phone and the browser ---------------------------------
alter table public.items replica identity full;
alter table public.photo_jobs replica identity full;
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
