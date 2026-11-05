-- Jabuticaba: special world tree, lobby consumable, and guarded account progression.
-- Review-only migration. Do not apply automatically.

alter table public.fibula_profiles
  add column if not exists jabuticaba_progress integer not null default 0
  check (jabuticaba_progress >= 0);

insert into public.fibula_item_catalog
  (item_id, display_name, rarity, item_type, stackable, metadata)
values
  ('jabuticaba', 'Jabuticaba', 'normal', 'consumable', true,
   '{"category":"fruit","usable_in_lobby":true,"crafting_ingredient":false}'::jsonb)
on conflict (item_id) do update
set display_name = excluded.display_name,
    rarity = 'normal',
    item_type = 'consumable',
    stackable = true,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = now();

create or replace function public.fibula_consume_jabuticaba()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_level integer;
  v_progress integer;
  v_cost integer := 4;
  v_index integer;
  v_inventory jsonb;
  v_next_inventory jsonb := '[]'::jsonb;
  v_item jsonb;
  v_quantity integer;
  v_consumed boolean := false;
  v_leveled_up boolean := false;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  insert into public.fibula_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  select p.level, p.jabuticaba_progress
    into v_level, v_progress
    from public.fibula_profiles p
   where p.user_id = v_user_id
   for update;

  select h.inventory
    into v_inventory
    from public.fibula_house_storage h
   where h.user_id = v_user_id
   for update;

  if not found or v_inventory is null or jsonb_typeof(v_inventory) <> 'array' then
    raise exception 'O Baú ainda não está disponível para consumo.';
  end if;

  for v_item in select value from jsonb_array_elements(v_inventory) loop
    if not v_consumed and v_item ->> 'itemId' = 'jabuticaba' then
      v_quantity := (v_item ->> 'quantity')::integer;
      if v_quantity > 0 then
        v_consumed := true;
        if v_quantity > 1 then
          v_next_inventory := v_next_inventory || jsonb_build_array(
            jsonb_set(v_item, '{quantity}', to_jsonb(v_quantity - 1), false)
          );
        end if;
      else
        v_next_inventory := v_next_inventory || jsonb_build_array(v_item);
      end if;
    else
      v_next_inventory := v_next_inventory || jsonb_build_array(v_item);
    end if;
  end loop;

  if not v_consumed then
    raise exception 'Você não possui jabuticabas no Baú.';
  end if;

  v_progress := v_progress + 1;
  for v_index in 1..v_level loop
    v_cost := ceil(v_cost * 1.25)::integer;
  end loop;

  if v_progress >= v_cost then
    v_level := v_level + 1;
    v_progress := 0;
    v_leveled_up := true;
  end if;

  update public.fibula_house_storage
     set inventory = v_next_inventory,
         updated_at = now()
   where user_id = v_user_id;

  update public.fibula_profiles
     set level = v_level,
         jabuticaba_progress = v_progress,
         updated_at = now()
   where user_id = v_user_id;

  v_cost := 4;
  for v_index in 1..v_level loop
    v_cost := ceil(v_cost * 1.25)::integer;
  end loop;

  return jsonb_build_object(
    'level', v_level,
    'progress', v_progress,
    'next_cost', v_cost,
    'leveled_up', v_leveled_up
  );
end;
$function$;

revoke all on function public.fibula_consume_jabuticaba() from public, anon;
grant execute on function public.fibula_consume_jabuticaba() to authenticated;
