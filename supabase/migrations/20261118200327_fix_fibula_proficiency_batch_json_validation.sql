create or replace function public.fibula_apply_proficiency_batch(
  p_batch_id uuid,
  p_deltas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_existing_hash text;
  v_inserted boolean := false;
  v_delta record;
  v_delta_count integer;
  v_updated integer := 0;
begin
  if v_uid is null
    or (auth.jwt() ->> 'iss') is distinct from
      'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if p_batch_id is null then
    raise exception 'Identificador do lote obrigatório.';
  end if;

  if p_deltas is null
    or jsonb_typeof(p_deltas) is distinct from 'object' then
    raise exception 'Lote de proficiências inválido.';
  end if;

  select count(*)::integer
    into v_delta_count
    from jsonb_object_keys(p_deltas);

  if v_delta_count < 1 or v_delta_count > 20 then
    raise exception 'Lote de proficiências inválido.';
  end if;

  for v_delta in
    select key, value
      from jsonb_each(p_deltas)
  loop
    if jsonb_typeof(v_delta.value) is distinct from 'number'
      or (v_delta.value #>> '{}') !~ '^[0-9]+$'
      or (v_delta.value #>> '{}')::numeric < 1
      or (v_delta.value #>> '{}')::numeric > 10000 then
      raise exception 'Quantidade inválida para a proficiência %.', v_delta.key;
    end if;

    if not exists (
      select 1
        from public.fibula_proficiency_catalog c
       where c.proficiency_key = v_delta.key
         and c.active
    ) then
      raise exception 'Proficiência desconhecida ou inativa: %.', v_delta.key;
    end if;
  end loop;

  v_hash := md5(p_deltas::text);

  insert into public.fibula_proficiency_batches (user_id, batch_id, payload_hash)
  values (v_uid, p_batch_id, v_hash)
  on conflict (user_id, batch_id) do nothing
  returning true into v_inserted;

  if not coalesce(v_inserted, false) then
    select b.payload_hash
      into v_existing_hash
      from public.fibula_proficiency_batches b
     where b.user_id = v_uid
       and b.batch_id = p_batch_id;

    if v_existing_hash is distinct from v_hash then
      raise exception 'Identificador de lote reutilizado com conteúdo diferente.';
    end if;

    return jsonb_build_object(
      'applied', false,
      'duplicate', true,
      'batch_id', p_batch_id
    );
  end if;

  for v_delta in
    select key, (value #>> '{}')::bigint as amount
      from jsonb_each(p_deltas)
  loop
    insert into public.fibula_proficiencies (
      user_id, proficiency_key, counter, updated_at
    )
    values (v_uid, v_delta.key, v_delta.amount, now())
    on conflict (user_id, proficiency_key)
    do update set
      counter = public.fibula_proficiencies.counter + excluded.counter,
      updated_at = now();

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'batch_id', p_batch_id,
    'updated', v_updated
  );
end;
$function$;