-- Clair — schéma Supabase. À exécuter dans SQL Editor > New query.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  avatar_path text,
  avatar_url text,
  profile_setup_completed boolean not null default false,
  monthly_income numeric(12, 2) not null default 0 check (monthly_income >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  label text not null check (length(trim(label)) > 0),
  category text not null check (category in (
    'alimentation', 'logement', 'factures', 'transport', 'sante',
    'vetements', 'sorties', 'loisirs', 'achats-divers', 'epargne'
  )),
  amount numeric(12, 2) not null check (amount > 0),
  envelope text not null check (envelope in ('needs', 'wants', 'savings')),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  label text not null check (length(trim(label)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_clair_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (user_id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_clair on auth.users;
create trigger on_auth_user_created_clair
  after insert on auth.users
  for each row execute function public.handle_new_clair_user();

insert into public.profiles (user_id, email)
select id, coalesce(email, '') from auth.users
on conflict (user_id) do update set email = excluded.email;

alter table public.profiles enable row level security;
alter table public.expenses enable row level security;
alter table public.income_entries enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can add own profile" on public.profiles;
create policy "Users can add own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can read own expenses" on public.expenses;
create policy "Users can read own expenses" on public.expenses
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can add own expenses" on public.expenses;
create policy "Users can add own expenses" on public.expenses
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own expenses" on public.expenses;
create policy "Users can update own expenses" on public.expenses
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own expenses" on public.expenses;
create policy "Users can delete own expenses" on public.expenses
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own income entries" on public.income_entries;
create policy "Users can read own income entries" on public.income_entries
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can add own income entries" on public.income_entries;
create policy "Users can add own income entries" on public.income_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own income entries" on public.income_entries;
create policy "Users can update own income entries" on public.income_entries
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own income entries" on public.income_entries;
create policy "Users can delete own income entries" on public.income_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.income_entries to authenticated;

create index if not exists expenses_user_month_idx on public.expenses(user_id, month);
create index if not exists expenses_user_date_idx on public.expenses(user_id, date);
create index if not exists income_entries_user_month_idx on public.income_entries(user_id, month);

-- Photos de profil privées : chaque utilisateur ne peut lire/modifier que son dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read own profile photos" on storage.objects;
create policy "Users can read own profile photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "Users can upload own profile photos" on storage.objects;
create policy "Users can upload own profile photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "Users can update own profile photos" on storage.objects;
create policy "Users can update own profile photos" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "Users can delete own profile photos" on storage.objects;
create policy "Users can delete own profile photos" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
