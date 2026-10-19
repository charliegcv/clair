-- À exécuter une fois pour ajouter les entrées d'argent au projet Supabase déjà configuré.
create table if not exists public.income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  label text not null check (length(trim(label)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now()
);

alter table public.income_entries enable row level security;

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

grant select, insert, update, delete on public.income_entries to authenticated;
create index if not exists income_entries_user_month_idx on public.income_entries(user_id, month);
