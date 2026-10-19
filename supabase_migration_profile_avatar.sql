-- Migration Clair : profils personnalisés et photos privées.
-- À exécuter dans Supabase > SQL Editor > New query. Peut être relancée sans danger.

alter table public.profiles
  add column if not exists full_name text not null default '',
  add column if not exists avatar_path text,
  add column if not exists avatar_url text,
  add column if not exists profile_setup_completed boolean not null default false;

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

update public.profiles p
set full_name = coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
    avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
    profile_setup_completed = (
      coalesce(nullif(p.full_name, ''), u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '') <> ''
      and coalesce(p.avatar_path, p.avatar_url, u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture') is not null
    )
from auth.users u
where p.user_id = u.id;

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
