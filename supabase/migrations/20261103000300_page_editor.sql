-- Page editor: save a page and its ordered sections in one transaction.
-- Runs as the caller, so row level security (the `pages` capability) applies.
create function public.admin_save_page(target_page uuid, fields jsonb, new_sections jsonb)
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
    insert into public.pages (language, translation_id, path, title, kind, status, seo, layout)
    values (
      (fields ->> 'language')::public.site_language,
      coalesce((fields ->> 'translation_id')::uuid, gen_random_uuid()),
      fields ->> 'path', fields ->> 'title',
      coalesce((fields ->> 'kind')::public.page_kind, 'page'),
      (fields ->> 'status')::public.publish_status,
      coalesce(fields -> 'seo', '{}'::jsonb),
      coalesce(fields -> 'layout', '{}'::jsonb)
    )
    returning id into saved_id;
  else
    update public.pages set
      path = fields ->> 'path',
      title = fields ->> 'title',
      status = (fields ->> 'status')::public.publish_status,
      seo = coalesce(fields -> 'seo', seo)
    where id = saved_id;
    if not found then raise exception 'Page not found.'; end if;
  end if;

  select coalesce(array_agg((s ->> 'id')::uuid), '{}') into kept
  from jsonb_array_elements(new_sections) s where s ->> 'id' is not null;
  delete from public.page_sections where page_sections.page_id = saved_id and not (page_sections.id = any (kept));

  -- Positions are unique per page, checked at commit, so reordering is safe.
  insert into public.page_sections (id, page_id, position, kind, label, html)
  select coalesce((s ->> 'id')::uuid, gen_random_uuid()), saved_id, (ordinality - 1)::integer,
    (s ->> 'kind')::public.section_kind, coalesce(s ->> 'label', ''), coalesce(s ->> 'html', '')
  from jsonb_array_elements(new_sections) with ordinality as t(s, ordinality)
  on conflict (id) do update set
    position = excluded.position, kind = excluded.kind, label = excluded.label, html = excluded.html
  where page_sections.page_id = excluded.page_id;

  return saved_id;
end;
$$;
revoke all on function public.admin_save_page(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.admin_save_page(uuid, jsonb, jsonb) to authenticated;
