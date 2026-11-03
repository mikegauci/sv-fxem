-- Bilingual content: pages and news posts made of ordered sections, menus and
-- footer widgets. English and Arabic versions of the same page, category or
-- post share a `translation_id`, so the editor can toggle between them and the
-- site's language switcher can link them. Menus and footers are linked by
-- their location instead (one per language).

create type public.site_language as enum ('en', 'ar');
create type public.publish_status as enum ('draft', 'published');
create type public.page_kind as enum ('page', 'post', 'archive', 'standalone');
create type public.section_kind as enum ('html', 'rich_text');

-- ---------------------------------------------------------------- pages

-- Every public content type has an `seo` column:
-- {"title", "description", "og_media_id", "canonical", "noindex"}, all optional.
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  wp_id bigint unique,
  language public.site_language not null,
  translation_id uuid not null default gen_random_uuid(),
  -- URL path without slashes at the ends: '' (English home), 'ar' (Arabic
  -- home), 'about-us', 'ar/about-us'. Arabic paths always start with 'ar'.
  path text not null unique,
  title text not null,
  kind public.page_kind not null default 'page',
  status public.publish_status not null default 'draft',
  seo jsonb not null default '{}'::jsonb,
  -- Theme chrome kept from the original page: head markup (styles), <html>
  -- and <body> attributes, footer scripts and page-level flags such as the
  -- registration form a page hosts. Not edited in the page editor.
  layout jsonb not null default '{}'::jsonb,
  -- News posts only.
  published_at timestamptz,
  author_name text,
  featured_media_id uuid references public.media (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pages_one_per_language unique (translation_id, language),
  constraint pages_path_format check (path = '' or path ~ '^[^/](.*[^/])?$'),
  constraint pages_path_language check ((language = 'ar') = (path = 'ar' or path like 'ar/%'))
);
create index pages_kind_language_idx on public.pages (kind, language);
create index pages_featured_media_idx on public.pages (featured_media_id);

create table public.page_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  position integer not null,
  kind public.section_kind not null default 'html',
  -- Shown in the editor only, e.g. "Hero", "Account types".
  label text not null default '',
  html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint page_sections_order unique (page_id, position) deferrable initially deferred
);

-- News categories (archives at /category/<slug>/ and /ar/category/<slug>/).
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  wp_id bigint unique,
  language public.site_language not null,
  translation_id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_slug_per_language unique (language, slug),
  constraint categories_one_per_language unique (translation_id, language)
);

create table public.page_categories (
  page_id uuid not null references public.pages (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (page_id, category_id)
);
create index page_categories_category_idx on public.page_categories (category_id);

-- ---------------------------------------------------------------- menus

-- One menu per location and language: 'primary' (header mega menu) and the
-- footer menus ('footer-news-tools', 'footer-trading-accounts', ...).
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  language public.site_language not null,
  location text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menus_location_per_language unique (location, language),
  constraint menus_location_format check (location ~ '^[a-z0-9-]{1,64}$')
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  wp_id bigint,
  menu_id uuid not null references public.menus (id) on delete cascade,
  parent_id uuid references public.menu_items (id) on delete cascade,
  position integer not null,
  label text not null,
  -- Either a page (URL follows the page path) or a custom URL.
  page_id uuid references public.pages (id) on delete set null,
  url text not null default '',
  open_in_new_tab boolean not null default false,
  css_classes text not null default '',
  -- Theme options such as mega menu column layout and icons.
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_items_not_own_parent check (parent_id is distinct from id)
);
create index menu_items_menu_idx on public.menu_items (menu_id, parent_id, position);
create index menu_items_parent_idx on public.menu_items (parent_id);
create index menu_items_page_idx on public.menu_items (page_id);

-- ---------------------------------------------------------------- footer

create type public.footer_widget_kind as enum ('image', 'text', 'heading', 'menu', 'news', 'html');

-- Footer widgets per language, in four columns (as in the theme's footer builder).
create table public.footer_widgets (
  id uuid primary key default gen_random_uuid(),
  language public.site_language not null,
  column_index smallint not null check (column_index between 1 and 4),
  position integer not null,
  kind public.footer_widget_kind not null,
  title text not null default '',
  html text not null default '',
  menu_id uuid references public.menus (id) on delete set null,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index footer_widgets_order_idx on public.footer_widgets (language, column_index, position);
create index footer_widgets_menu_idx on public.footer_widgets (menu_id);

-- ---------------------------------------------------------------- triggers

do $$
declare t text;
begin
  foreach t in array array['pages', 'page_sections', 'categories', 'menus', 'menu_items', 'footer_widgets'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch_updated_at', t);
    execute format('create trigger cms_history after insert or update or delete on public.%I for each row execute function private.capture_content_history()', t);
  end loop;
end $$;

-- A published page that moves keeps its old URL working.
create function private.page_path_redirect() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  old_url text := '/' || old.path || '/';
  new_url text := '/' || new.path || '/';
begin
  if old.path is not distinct from new.path or old.status <> 'published' or old.path in ('', 'ar') then return new; end if;
  insert into public.redirects (source, destination, permanent)
  values (old_url, new_url, true)
  on conflict (source) do update set destination = excluded.destination, permanent = true;
  -- Never leave a redirect pointing away from a live page.
  delete from public.redirects where source = new_url;
  return new;
end;
$$;
revoke all on function private.page_path_redirect() from public, anon, authenticated;
create trigger page_path_redirect after update of path on public.pages
  for each row execute function private.page_path_redirect();

-- Files used by content cannot be deleted from the media library.
create function private.protect_used_media() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare t text; used boolean;
begin
  foreach t in array array['pages', 'page_sections', 'menu_items', 'footer_widgets', 'settings'] loop
    execute format('select exists (select 1 from public.%I r where strpos(to_jsonb(r)::text, $1) > 0 or strpos(to_jsonb(r)::text, $2) > 0)', t)
      into used using old.id::text, old.path;
    if used then raise exception 'This file is used by %. Remove its content references first.', t; end if;
  end loop;
  if exists (
    select 1 from public.content_history h
    where h.entity in ('pages', 'page_sections', 'footer_widgets')
      and (strpos(h.before_data::text, old.id::text) > 0 or strpos(h.before_data::text, old.path) > 0)
  ) then
    raise exception 'This file is retained by a saved content revision.';
  end if;
  return old;
end;
$$;
revoke all on function private.protect_used_media() from public, anon, authenticated;
create trigger protect_used_media before delete on public.media
  for each row execute function private.protect_used_media();

-- ---------------------------------------------------------------- access

alter table public.pages enable row level security;
alter table public.page_sections enable row level security;
alter table public.categories enable row level security;
alter table public.page_categories enable row level security;
alter table public.menus enable row level security;
alter table public.menu_items enable row level security;
alter table public.footer_widgets enable row level security;

create policy "Published pages are public" on public.pages for select to anon, authenticated
  using (status = 'published' or (select private.has_admin_capability('pages')));
create policy "Sections of published pages are public" on public.page_sections for select to anon, authenticated
  using (exists (
    select 1 from public.pages p where p.id = page_id
      and (p.status = 'published' or (select private.has_admin_capability('pages')))
  ));
create policy "Anyone can read" on public.categories for select to anon, authenticated using (true);
create policy "Anyone can read" on public.page_categories for select to anon, authenticated using (true);
create policy "Anyone can read" on public.menus for select to anon, authenticated using (true);
create policy "Anyone can read" on public.menu_items for select to anon, authenticated using (true);
create policy "Anyone can read" on public.footer_widgets for select to anon, authenticated using (true);

do $$
declare t text; scope text;
begin
  foreach t in array array['pages', 'page_sections', 'categories', 'page_categories', 'menus', 'menu_items', 'footer_widgets'] loop
    scope := case when t in ('menus', 'menu_items', 'footer_widgets') then 'menus' else 'pages' end;
    execute format('create policy "Admins can insert" on public.%I for insert to authenticated with check ((select private.has_admin_capability(%L)))', t, scope);
    execute format('create policy "Admins can update" on public.%I for update to authenticated using ((select private.has_admin_capability(%L))) with check ((select private.has_admin_capability(%L)))', t, scope, scope);
    execute format('create policy "Admins can delete" on public.%I for delete to authenticated using ((select private.has_admin_capability(%L)))', t, scope);
  end loop;
end $$;

create function public.admin_bulk_status(target_ids uuid[], new_status public.publish_status)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare affected integer;
begin
  if not private.has_admin_capability('pages') then raise exception 'Not authorised' using errcode = '42501'; end if;
  if coalesce(array_length(target_ids, 1), 0) not between 1 and 100 then raise exception 'Select between 1 and 100 pages'; end if;
  update public.pages set status = new_status where id = any (target_ids);
  get diagnostics affected = row_count;
  return affected;
end;
$$;
revoke all on function public.admin_bulk_status(uuid[], public.publish_status) from public, anon;
grant execute on function public.admin_bulk_status(uuid[], public.publish_status) to authenticated;
