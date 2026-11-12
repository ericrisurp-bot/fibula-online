-- Atomically consume cooking ingredients and create the production job.
-- The inventory returned by this RPC is the authoritative post-transaction snapshot.
create or replace function public.fibula_cooking_start(p_meal jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.fibula_cooking_state;
  v_storage public.fibula_house_storage;
  v_ready_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint + 30 * 60 * 1000;
  v_meal jsonb;
  v_inventory jsonb;
  v_next jsonb;
  v_need record;
  v_entry jsonb;
  v_have bigint;
  v_left bigint;
  v_quantity bigint;
  v_take bigint;
begin
  if p_meal is null or jsonb_typeof(p_meal) <> 'object' or pg_column_size(p_meal) > 4000
    or coalesce(p_meal->>'id', '') = '' or char_length(p_meal->>'id') > 80
    or (p_meal->>'slot') not in ('quick', 'pan')
    or jsonb_typeof(p_meal->'ingredients') is distinct from 'array'
    or jsonb_array_length(p_meal->'ingredients') = 0 then
    raise exception 'Refeição inválida.';
  end if;

  for v_need in
    select * from jsonb_to_recordset(p_meal->'ingredients') as x("itemId" text, quantity bigint)
  loop
    if v_need."itemId" is null or char_length(v_need."itemId") not between 1 and 100
      or v_need.quantity is null or v_need.quantity <= 0 or v_need.quantity > 1000000000 then
      raise exception 'Ingrediente inválido.';
    end if;
  end loop;

  v_row := public.fibula_cooking_lock_row();
  if jsonb_array_length(v_row.prepared) >= 3 then
    raise exception 'Os três espaços de produção estão ocupados.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_row.prepared || v_row.ready || v_row.pending) e
    where e->>'id' = p_meal->>'id'
  ) then
    raise exception 'Esta refeição já existe.';
  end if;

  select * into v_storage
    from public.fibula_house_storage
   where user_id = v_row.user_id
   for update;
  if not found or jsonb_typeof(v_storage.inventory) is distinct from 'array' then
    raise exception 'Baú não encontrado ou inválido.';
  end if;
  v_inventory := v_storage.inventory;

  for v_need in
    select * from jsonb_to_recordset(p_meal->'ingredients') as x("itemId" text, quantity bigint)
  loop
    select coalesce(sum((e->>'quantity')::bigint), 0)
      into v_have
      from jsonb_array_elements(v_inventory) e
     where e->>'itemId' = v_need."itemId"
       and coalesce(e->>'quantity', '') ~ '^[1-9][0-9]*$';
    if v_have < v_need.quantity then
      raise exception 'Ingredientes insuficientes no Baú: %.', v_need."itemId";
    end if;

    v_left := v_need.quantity;
    v_next := '[]'::jsonb;
    for v_entry in select value from jsonb_array_elements(v_inventory) as entry(value)
    loop
      if v_entry->>'itemId' = v_need."itemId" and v_left > 0 then
        if coalesce(v_entry->>'quantity', '') !~ '^[1-9][0-9]*$' then
          raise exception 'Quantidade inválida no Baú: %.', v_need."itemId";
        end if;
        v_quantity := (v_entry->>'quantity')::bigint;
        v_take := least(v_quantity, v_left);
        v_left := v_left - v_take;
        if v_quantity > v_take then
          v_next := v_next || jsonb_build_array(jsonb_set(v_entry, '{quantity}', to_jsonb(v_quantity - v_take)));
        end if;
      else
        v_next := v_next || jsonb_build_array(v_entry);
      end if;
    end loop;
    if v_left <> 0 then
      raise exception 'Não foi possível descontar os ingredientes do Baú.';
    end if;
    v_inventory := v_next;
  end loop;

  update public.fibula_house_storage
     set inventory = v_inventory, updated_at = now()
   where user_id = v_row.user_id;

  v_meal := p_meal || jsonb_build_object('productionReadyAt', v_ready_ms);
  update public.fibula_cooking_state
     set prepared = prepared || jsonb_build_array(v_meal), updated_at = now()
   where user_id = v_row.user_id
   returning * into v_row;

  return public.fibula_cooking_snapshot(v_row)
    || jsonb_build_object('inventory', v_inventory);
end;
$function$;

revoke all on function public.fibula_cooking_start(jsonb) from public, anon;
grant execute on function public.fibula_cooking_start(jsonb) to authenticated;
