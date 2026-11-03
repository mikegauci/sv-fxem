-- Foundation: profiles and roles, media library, redirects, site settings and
-- content history. Adapted from the Battery Factory schema (itself from Rotta)
-- without the shop. The CMS has admins only: there are no customer accounts.

-- ---------------------------------------------------------------- profiles

create type public.app_role as enum ('admin', 'member');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  username text,
  full_name text,
  role public.app_role not null default 'member',
  -- null = full administrator; otherwise only the named CMS sections.
  admin_capabilities text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format
    check (username is null or username ~ '^[a-z0-9_.-]{3,32}$'),
  constraint valid_admin_capabilities check (
    (role = 'admin' or admin_capabilities is null) and
    (admin_capabilities is null or admin_capabilities <@ array['pages', 'menus', 'media']::text[])
  )
);

create unique index profiles_username_key on public.profiles (lower(username));
create index profiles_role_idx on public.profiles (role);

comment on table public.profiles is 'One row per auth user. Role changes go through public.admin_save_user_profile().';

-- Helpers live in a schema that the Data API does not expose.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and admin_capabilities is null
  )
$$;

create function private.has_admin_capability(capability text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
      and (admin_capabilities is null or capability = any (admin_capabilities))
  )
$$;

revoke all on function private.is_admin() from public;
revoke all on function private.has_admin_capability(text) from public;
grant execute on function private.is_admin() to anon, authenticated;
grant execute on function private.has_admin_capability(text) to anon, authenticated;

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Every new auth user gets a profile; admin is never self-assigned.
create function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted_username text := lower(nullif(trim(meta ->> 'username'), ''));
begin
  if wanted_username is not null
     and (wanted_username !~ '^[a-z0-9_.-]{3,32}$'
          or exists (select 1 from public.profiles where lower(username) = wanted_username)) then
    wanted_username := null;
  end if;

  insert into public.profiles (id, email, username, full_name)
  values (new.id, new.email, wanted_username, nullif(trim(meta ->> 'full_name'), ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.handle_user_email_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

alter table public.profiles enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- Users may only edit these columns directly; role and email are protected.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (username, full_name) on public.profiles to authenticated;

create function private.protect_last_full_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and old.admin_capabilities is null then
    if TG_OP = 'UPDATE' and new.role = 'admin' and new.admin_capabilities is null then return new; end if;
    perform pg_advisory_xact_lock(7244771);
    if not exists (select 1 from public.profiles where id <> old.id and role = 'admin' and admin_capabilities is null) then
      raise exception 'Keep at least one full administrator.' using errcode = '23514';
    end if;
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.protect_last_full_admin() from public, anon, authenticated;
create trigger protect_last_full_admin
  before update of role, admin_capabilities or delete on public.profiles
  for each row execute function private.protect_last_full_admin();

create function public.admin_save_user_profile(target_user uuid, display_name text, new_username text, new_role public.app_role, capabilities text[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare previous public.profiles;
begin
  if not private.is_admin() then raise exception 'Only full administrators can manage users' using errcode = '42501'; end if;
  select * into previous from public.profiles where id = target_user for update;
  if not found then raise exception 'User not found.'; end if;
  if target_user = auth.uid() and (previous.role is distinct from new_role or previous.admin_capabilities is distinct from capabilities) then
    raise exception 'You cannot change your own access.';
  end if;
  if length(trim(display_name)) > 150 or length(trim(new_username)) > 32 then raise exception 'User details are too long.'; end if;
  update public.profiles
  set full_name = nullif(trim(display_name), ''),
      username = nullif(lower(trim(new_username)), ''),
      role = new_role,
      admin_capabilities = case when new_role = 'admin' then capabilities else null end
  where id = target_user;
end;
$$;
revoke all on function public.admin_save_user_profile(uuid, text, text, public.app_role, text[]) from public, anon;
grant execute on function public.admin_save_user_profile(uuid, text, text, public.app_role, text[]) to authenticated;

create function public.admin_list_users(search_text text default '', filter_role text default '', page_number integer default 1)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'Only full administrators can manage users' using errcode = '42501'; end if;
  if filter_role not in ('', 'admin', 'member') then raise exception 'Unknown role.'; end if;
  with filtered as (
    select id, email, username, full_name, role, admin_capabilities, created_at from public.profiles
    where (filter_role = '' or role::text = filter_role)
      and (trim(search_text) = '' or strpos(lower(coalesce(full_name, '') || ' ' || coalesce(username, '') || ' ' || email), lower(left(trim(search_text), 200))) > 0)
  ), totals as (select count(*)::integer as total from filtered), pagination as (
    select total, greatest(1, (total + 49) / 50) as pages,
      least(greatest(1, coalesce(page_number, 1)), greatest(1, (total + 49) / 50)) as page
    from totals
  )
  select jsonb_build_object('total', total, 'pages', pages, 'page', page, 'users', coalesce((
    select jsonb_agg(to_jsonb(u) order by u.created_at desc, u.id)
    from (select * from filtered order by created_at desc, id limit 50 offset ((select page from pagination) - 1) * 50) u
  ), '[]'::jsonb)) into result from pagination;
  return result;
end;
$$;
revoke all on function public.admin_list_users(text, text, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, integer) to authenticated;

-- Keep uploads when deleting an account through the Auth Admin API.
create function public.admin_release_user_files(target_user uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.is_admin() or target_user = auth.uid() then raise exception 'Not authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = target_user) then raise exception 'User not found.'; end if;
  update storage.objects set owner = null, owner_id = null where owner_id = target_user::text or owner = target_user;
end;
$$;
revoke all on function public.admin_release_user_files(uuid) from public, anon;
grant execute on function public.admin_release_user_files(uuid) to authenticated;

-- ---------------------------------------------------------------- media

-- Files live in the public `media` storage bucket; each has a row in
-- public.media with its alt text and dimensions.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true,
  20971520, -- 20 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'video/mp4', 'application/pdf']
);

create policy "Admins can upload media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (select private.has_admin_capability('media')));
create policy "Admins can update media"
  on storage.objects for update to authenticated
  using (bucket_id = 'media' and (select private.has_admin_capability('media')));
create policy "Admins can delete media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (select private.has_admin_capability('media')));

create table public.media (
  id uuid primary key default gen_random_uuid(),
  -- Original site path (e.g. /assets/e486f0721487-fxem-final-logo.png) for imported files.
  source_path text unique,
  path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width integer,
  height integer,
  alt text not null default '',
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index media_created_at_idx on public.media (created_at desc);
create index media_uploaded_by_idx on public.media (uploaded_by);

-- ---------------------------------------------------------------- redirects, settings

create table public.redirects (
  id uuid primary key default gen_random_uuid(),
  source text not null unique, -- path with leading and trailing slash
  destination text not null,
  permanent boolean not null default true,
  hits integer not null default 0,
  created_at timestamptz not null default now()
);

-- Key/value site settings (contact details, analytics...).
create table public.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger settings_touch_updated_at before update on public.settings
  for each row execute function private.touch_updated_at();

alter table public.media enable row level security;
alter table public.redirects enable row level security;
alter table public.settings enable row level security;

create policy "Anyone can read" on public.media for select to anon, authenticated using (true);
create policy "Anyone can read" on public.redirects for select to anon, authenticated using (true);
create policy "Anyone can read" on public.settings for select to anon, authenticated using (true);

create policy "Admins can insert" on public.media for insert to authenticated with check ((select private.has_admin_capability('media')));
create policy "Admins can update" on public.media for update to authenticated using ((select private.has_admin_capability('media'))) with check ((select private.has_admin_capability('media')));
create policy "Admins can delete" on public.media for delete to authenticated using ((select private.has_admin_capability('media')));

do $$
declare t text;
begin
  foreach t in array array['redirects', 'settings'] loop
    execute format('create policy "Admins can insert" on public.%I for insert to authenticated with check ((select private.is_admin()))', t);
    execute format('create policy "Admins can update" on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t);
    execute format('create policy "Admins can delete" on public.%I for delete to authenticated using ((select private.is_admin()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- history

create table public.content_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  entity text not null,
  record_key text not null,
  operation text not null,
  before_data jsonb,
  after_data jsonb
);
create index content_history_recent on public.content_history (created_at desc);
create index content_history_record on public.content_history (record_key);
alter table public.content_history enable row level security;
revoke all on public.content_history from anon;
revoke insert, update, delete on public.content_history from authenticated;
grant select on public.content_history to authenticated;
create policy "Admins read history" on public.content_history for select to authenticated using ((select private.is_admin()));

create function private.capture_content_history() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare previous jsonb; current_row jsonb;
begin
  if TG_OP <> 'INSERT' then previous := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then current_row := to_jsonb(NEW); end if;
  if TG_OP = 'UPDATE' and previous - 'updated_at' = current_row - 'updated_at' then return NEW; end if;
  insert into public.content_history (actor_id, entity, record_key, operation, before_data, after_data)
  values (
    auth.uid(), TG_TABLE_NAME,
    coalesce(current_row ->> 'id', previous ->> 'id', current_row ->> 'key', previous ->> 'key'),
    TG_OP, previous, current_row
  );
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function private.capture_content_history() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'media', 'redirects', 'settings'] loop
    execute format('create trigger cms_history after insert or update or delete on public.%I for each row execute function private.capture_content_history()', t);
  end loop;
end $$;
