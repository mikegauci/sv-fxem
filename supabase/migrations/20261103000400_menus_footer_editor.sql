-- Menu and footer editors: replace a menu's items, or a language's footer
-- widgets, in one transaction. Run as the caller (the `menus` capability).
create function public.admin_save_menu(target_menu uuid, new_items jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.has_admin_capability('menus') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(new_items) <> 'array' or jsonb_array_length(new_items) > 500 then
    raise exception 'A menu can have up to 500 items.';
  end if;
  if not exists (select 1 from public.menus where id = target_menu) then
    raise exception 'Menu not found.';
  end if;
  delete from public.menu_items
  where menu_id = target_menu
    and not (id = any (coalesce((select array_agg((i ->> 'id')::uuid) from jsonb_array_elements(new_items) i), '{}')));
  -- One statement, so parent links are checked once every row is in place.
  insert into public.menu_items (id, menu_id, parent_id, position, label, page_id, url, open_in_new_tab, css_classes, options, wp_id)
  select (i ->> 'id')::uuid, target_menu, (i ->> 'parent_id')::uuid, (i ->> 'position')::integer,
    i ->> 'label', (i ->> 'page_id')::uuid, coalesce(i ->> 'url', ''), coalesce((i ->> 'open_in_new_tab')::boolean, false),
    coalesce(i ->> 'css_classes', ''), coalesce(i -> 'options', '{}'::jsonb), (i ->> 'wp_id')::bigint
  from jsonb_array_elements(new_items) i
  on conflict (id) do update set
    parent_id = excluded.parent_id, position = excluded.position, label = excluded.label,
    page_id = excluded.page_id, url = excluded.url, open_in_new_tab = excluded.open_in_new_tab,
    css_classes = excluded.css_classes, options = excluded.options
  where menu_items.menu_id = excluded.menu_id;
end;
$$;
revoke all on function public.admin_save_menu(uuid, jsonb) from public, anon;
grant execute on function public.admin_save_menu(uuid, jsonb) to authenticated;

create function public.admin_save_footer(target_language public.site_language, new_widgets jsonb)
returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if not private.has_admin_capability('menus') then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(new_widgets) <> 'array' or jsonb_array_length(new_widgets) > 100 then
    raise exception 'The footer can have up to 100 widgets.';
  end if;
  delete from public.footer_widgets
  where language = target_language
    and not (id = any (coalesce((select array_agg((w ->> 'id')::uuid) from jsonb_array_elements(new_widgets) w), '{}')));
  insert into public.footer_widgets (id, language, column_index, position, kind, title, html, menu_id, options)
  select (w ->> 'id')::uuid, target_language, (w ->> 'column_index')::smallint, (w ->> 'position')::integer,
    (w ->> 'kind')::public.footer_widget_kind, coalesce(w ->> 'title', ''), coalesce(w ->> 'html', ''),
    (w ->> 'menu_id')::uuid, coalesce(w -> 'options', '{}'::jsonb)
  from jsonb_array_elements(new_widgets) w
  on conflict (id) do update set
    column_index = excluded.column_index, position = excluded.position, kind = excluded.kind,
    title = excluded.title, html = excluded.html, menu_id = excluded.menu_id, options = excluded.options
  where footer_widgets.language = excluded.language;
end;
$$;
revoke all on function public.admin_save_footer(public.site_language, jsonb) from public, anon;
grant execute on function public.admin_save_footer(public.site_language, jsonb) to authenticated;
