-- Split the "Front / Back Finish" option group (neck-finish) into two groups,
-- so a customer picks one front finish AND one back finish instead of one of
-- the four:
--   front-finish: plain-front, embroidered-front
--   back-finish:  closed-back, keyhole-back
--
-- The option values keep their ids (they are moved, not copied), so template
-- prices and defaults carry over. Everything that names the old group key is
-- moved too: template_options, fabrics.supported_options and order_drafts.options.
-- order_items.options is left alone: it is the snapshot of a placed order
-- (with its own labels) and must stay as the customer saw it.
--
-- Does nothing when neck-finish doesn't exist (e.g. a fresh database, where
-- seed-demo-catalog creates the two groups directly).

do $$
declare
  v_old   public.option_groups;
  v_front uuid;
  v_back  uuid;
begin
  select * into v_old from public.option_groups where key = 'neck-finish';
  if not found then
    return;
  end if;

  insert into public.option_groups (key, label, sort)
  values ('front-finish', 'Front Finish', v_old.sort)
  on conflict (key) do update set label = excluded.label
  returning id into v_front;

  insert into public.option_groups (key, label, sort)
  values ('back-finish', 'Back Finish', v_old.sort)
  on conflict (key) do update set label = excluded.label
  returning id into v_back;

  -- Values: move into their new group, renumbered within it.
  update public.option_values
     set group_id = case when key in ('closed-back', 'keyhole-back') then v_back else v_front end,
         sort     = case key when 'plain-front' then 1 when 'embroidered-front' then 2
                             when 'closed-back' then 1 when 'keyhole-back' then 2 else sort end
   where group_id = v_old.id;

  -- Template options follow their value.
  update public.template_options o
     set group_id = v.group_id
    from public.option_values v
   where o.value_id = v.id
     and o.group_id = v_old.id;

  -- Each template needs one default per group. The old group's single default
  -- was a back finish, so give templates without a front default Plain Front.
  update public.template_options o
     set is_default = true
    from public.option_values v
   where o.value_id = v.id
     and v.key = 'plain-front'
     and o.group_id = v_front
     and not exists (
       select 1 from public.template_options d
        where d.template_id = o.template_id and d.group_id = v_front and d.is_default
     );

  -- Fabrics: split the supported list between the two keys.
  update public.fabrics f
     set supported_options = (f.supported_options - 'neck-finish')
       || jsonb_build_object(
            'front-finish', coalesce((select jsonb_agg(e) from jsonb_array_elements_text(f.supported_options -> 'neck-finish') e
                                       where e in ('plain-front', 'embroidered-front')), '[]'::jsonb),
            'back-finish',  coalesce((select jsonb_agg(e) from jsonb_array_elements_text(f.supported_options -> 'neck-finish') e
                                       where e in ('closed-back', 'keyhole-back')), '[]'::jsonb))
   where jsonb_typeof(f.supported_options -> 'neck-finish') = 'array';

  -- Drafts in progress: the one saved choice goes to the group it belongs to;
  -- the other group falls back to its default in the customize screens.
  update public.order_drafts d
     set options = (d.options - 'neck-finish')
       || jsonb_build_object(
            case when d.options ->> 'neck-finish' in ('closed-back', 'keyhole-back') then 'back-finish' else 'front-finish' end,
            d.options -> 'neck-finish')
   where d.options ? 'neck-finish';

  -- Nothing references the old group any more.
  delete from public.option_groups where id = v_old.id;
end;
$$;
