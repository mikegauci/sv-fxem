-- Script guard, editor embeds and per-language page code.
alter type public.section_kind add value if not exists 'embed';
alter table public.page_sections add column options jsonb;
alter table public.pages add column custom_code jsonb not null default '{}';

create function private.is_full_admin() returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.is_admin() $$;
revoke all on function private.is_full_admin() from public;
grant execute on function private.is_full_admin() to authenticated;

-- Conservative SQL backstop; the application additionally parses HTML and
-- decodes entities. Sort the fragments, retaining duplicates (a multiset).
-- Temper the script body explicitly: PostgreSQL's alternation greediness can
-- otherwise consume text between separate scripts despite a lazy quantifier.
create or replace function private.script_signature(html text) returns text[]
language sql immutable set search_path = ''
as $fn$
 select coalesce(array_agg(fragment order by fragment), '{}') from (
  select m[1] as fragment from regexp_matches(coalesce(html,''),
   $rx$(<script\y[^>]*>(?:(?!</script\s*>)[\s\S])*</script\s*>|<script\y[^>]*>|\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)|(?:href|src|action|formaction|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]+)|<iframe\y[^>]*\ssrcdoc\y[^>]*>|<(?:object|embed|base)\y[^>]*>|<meta\y[^>]*http-equiv\s*=\s*["']?refresh\y[^>]*>)$rx$, 'gi') m
 ) fragments
$fn$;
revoke all on function private.script_signature(text) from public;
grant execute on function private.script_signature(text) to authenticated;

create function private.guard_editor_scripts() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare before_html text := ''; after_html text := ''; before_code jsonb := '{}';
begin
 if auth.uid() is null or private.is_full_admin() then return new; end if;
 if tg_table_name = 'pages' then
  if tg_op = 'UPDATE' then before_code := old.custom_code; end if;
  if new.custom_code is distinct from before_code then raise exception 'Only full admins can change page code.' using errcode = '42501'; end if;
  return new;
 elsif tg_table_name = 'page_sections' then
  -- ON CONFLICT invokes BEFORE INSERT before BEFORE UPDATE. Look up the
  -- saved section here so unchanged imported scripts can still be saved.
  select html into before_html from public.page_sections where id = new.id and page_id = new.page_id;
  after_html := new.html;
 elsif tg_table_name = 'footer_widgets' then
  select html into before_html from public.footer_widgets where id = new.id and language = new.language;
  after_html := new.html;
 else
  select coalesce(options->>'html','') into before_html from public.menu_items where id = new.id and menu_id = new.menu_id;
  after_html := coalesce(new.options->>'html','');
 end if;
 if private.script_signature(before_html) is distinct from private.script_signature(after_html) then
  raise exception 'Only full admins can add or change scripts.' using errcode = '42501';
 end if;
 return new;
end $$;
revoke all on function private.guard_editor_scripts() from public;
grant execute on function private.guard_editor_scripts() to authenticated;
create trigger page_sections_script_guard before insert or update on public.page_sections for each row execute function private.guard_editor_scripts();
create trigger pages_code_guard before insert or update on public.pages for each row execute function private.guard_editor_scripts();
create trigger footer_script_guard before insert or update on public.footer_widgets for each row execute function private.guard_editor_scripts();
create trigger menu_script_guard before insert or update on public.menu_items for each row execute function private.guard_editor_scripts();

-- Page editor: save a page and its ordered sections in one transaction.
-- Runs as the caller, so row level security (the `pages` capability) applies.
create or replace function public.admin_save_page(target_page uuid, fields jsonb, new_sections jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  saved_id uuid := target_page;
  kept uuid[];
begin
  if not private.has_admin_capability('pages') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(new_sections) <> 'array' or jsonb_array_length(new_sections) > 200 then
    raise exception 'A page can have up to 200 sections.';
  end if;

  if saved_id is null then
    insert into public.pages (language, translation_id, path, title, kind, status, seo, layout, custom_code)
    values (
      (fields ->> 'language')::public.site_language,
      coalesce((fields ->> 'translation_id')::uuid, gen_random_uuid()),
      fields ->> 'path', fields ->> 'title',
      coalesce((fields ->> 'kind')::public.page_kind, 'page'),
      (fields ->> 'status')::public.publish_status,
      coalesce(fields -> 'seo', '{}'::jsonb),
      coalesce(fields -> 'layout', '{}'::jsonb),
      coalesce(fields -> 'custom_code', '{}'::jsonb)
    )
    returning id into saved_id;
  else
    update public.pages set
      path = fields ->> 'path',
      title = fields ->> 'title',
      status = (fields ->> 'status')::public.publish_status,
      seo = coalesce(fields -> 'seo', seo),
      custom_code = coalesce(fields -> 'custom_code', custom_code)
    where id = saved_id;
    if not found then raise exception 'Page not found.'; end if;
  end if;

  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into kept
  from jsonb_array_elements(new_sections) s where s ->> 'id' is not null;
  delete from public.page_sections where page_sections.page_id = saved_id and not (page_sections.id = any (kept));

  -- Positions are unique per page, checked at commit, so reordering is safe.
  insert into public.page_sections (id, page_id, position, kind, label, html, options)
  select coalesce((s ->> 'id')::uuid, gen_random_uuid()), saved_id, (ordinality - 1)::integer,
    (s ->> 'kind')::public.section_kind, coalesce(s ->> 'label', ''), coalesce(s ->> 'html', ''), s -> 'options'
  from jsonb_array_elements(new_sections) with ordinality as t(s, ordinality)
  on conflict (id) do update set
    position = excluded.position, kind = excluded.kind, label = excluded.label, html = excluded.html, options = excluded.options
  where page_sections.page_id = excluded.page_id;

  return saved_id;
end;
$$;
revoke all on function public.admin_save_page(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_save_page(uuid, jsonb, jsonb) to authenticated;
