alter table public.fibula_house_ops
  add column if not exists delta jsonb not null default '[]'::jsonb,
  add column if not exists result_item_count integer;

create or replace function public.fibula_house_apply_delta(p_op_id uuid, p_delta jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv jsonb;
  v_el jsonb;
  v_id text;
  v_q bigint;
  v_cur bigint;
  v_map jsonb := '{}'::jsonb;
  v_order text[] := '{}';
  v_overflow jsonb := '[]'::jsonb;
  v_shortfall jsonb := '[]'::jsonb;
  v_next jsonb := '[]'::jsonb;
  k text;
  v_inserted int;
begin
  if v_uid is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;
  if p_op_id is null then
    raise exception 'Operação inválida.';
  end if;
  if p_delta is null or jsonb_typeof(p_delta) <> 'array' or jsonb_array_length(p_delta) > 100 then
    raise exception 'Alteração inválida.';
  end if;

  insert into public.fibula_house_storage (user_id, inventory)
  values (v_uid, '[]'::jsonb)
  on conflict (user_id) do nothing;

  select inventory into v_inv
  from public.fibula_house_storage
  where user_id = v_uid
  for update;

  if v_inv is null or jsonb_typeof(v_inv) <> 'array' then
    raise exception 'Baú não encontrado.';
  end if;

  insert into public.fibula_house_ops(user_id, op_id, delta)
  values (v_uid, p_op_id, p_delta)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object(
      'inventory', v_inv,
      'applied', false,
      'overflow', '[]'::jsonb,
      'shortfall', '[]'::jsonb
    );
  end if;

  delete from public.fibula_house_ops
  where user_id = v_uid
    and created_at < now() - interval '30 days';

  for v_el in
    select value from jsonb_array_elements(v_inv) as entry(value)
  loop
    v_id := v_el->>'itemId';
    if coalesce(v_el->>'quantity', '') ~ '^[1-9][0-9]*$' then
      if not (v_map ? v_id) then
        v_order := v_order || v_id;
      end if;
      v_map := jsonb_set(
        v_map,
        array[v_id],
        to_jsonb(coalesce((v_map->>v_id)::bigint, 0) + (v_el->>'quantity')::bigint)
      );
    end if;
  end loop;

  for v_el in
    select value from jsonb_array_elements(p_delta) as entry(value)
  loop
    v_id := v_el->>'itemId';
    if v_id is null or char_length(v_id) not between 1 and 1000 then
      raise exception 'Item inválido.';
    end if;
    if coalesce(v_el->>'quantity', '') !~ '^-?[1-9][0-9]{0,5}$' then
      raise exception 'Quantidade inválida.';
    end if;

    v_q := (v_el->>'quantity')::bigint;
    v_cur := coalesce((v_map->>v_id)::bigint, 0);

    if v_q < 0 then
      if v_cur < -v_q then
        v_shortfall := v_shortfall || jsonb_build_array(
          jsonb_build_object('itemId', v_id, 'quantity', -v_q - v_cur)
        );
        v_q := -v_cur;
      end if;
      if v_q <> 0 then
        v_map := jsonb_set(v_map, array[v_id], to_jsonb(v_cur + v_q));
      end if;
    else
      if v_cur = 0 and coalesce(array_length(v_order, 1), 0) >= 50
        and not (v_id = any(v_order)) then
        v_overflow := v_overflow || jsonb_build_array(
          jsonb_build_object('itemId', v_id, 'quantity', v_q)
        );
      else
        if not (v_id = any(v_order)) then
          v_order := v_order || v_id;
        end if;
        v_map := jsonb_set(v_map, array[v_id], to_jsonb(v_cur + v_q));
      end if;
    end if;
  end loop;

  foreach k in array v_order
  loop
    if coalesce((v_map->>k)::bigint, 0) > 0 then
      v_next := v_next || jsonb_build_array(
        jsonb_build_object('itemId', k, 'quantity', (v_map->>k)::bigint)
      );
    end if;
  end loop;

  -- Automatic delta sync may remove individual quantities, but may never clear
  -- an entire non-empty chest. Explicit discards use fibula_house_discard.
  if jsonb_array_length(v_inv) > 0 and jsonb_array_length(v_next) = 0 then
    raise exception 'Alteração bloqueada: sincronização automática não pode esvaziar o Baú.';
  end if;

  update public.fibula_house_ops
  set result_item_count = jsonb_array_length(v_next)
  where user_id = v_uid and op_id = p_op_id;

  update public.fibula_house_storage
  set inventory = v_next,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'inventory', v_next,
    'applied', true,
    'overflow', v_overflow,
    'shortfall', v_shortfall
  );
end;
$function$;
