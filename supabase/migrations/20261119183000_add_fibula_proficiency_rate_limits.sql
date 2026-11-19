-- P7: server-side rate limits for account-wide proficiency counters.
-- Accepted portions are recorded in the batch receipt so retries remain idempotent.
-- Unaccepted portions stay in the client's offline queue and can be retried later.

alter table public.fibula_proficiency_batches
  add column applied_deltas jsonb
  check (applied_deltas is null or jsonb_typeof(applied_deltas) = 'object');

create table public.fibula_proficiency_rate_limits (
  user_id uuid not null
    references public.fibula_profiles(user_id) on delete cascade,
  proficiency_key text not null
    references public.fibula_proficiency_catalog(proficiency_key) on update cascade,
  window_started_at timestamptz not null,
  used_units bigint not null check (used_units >= 0),
  primary key (user_id, proficiency_key)
);

alter table public.fibula_proficiency_rate_limits enable row level security;
revoke all on table public.fibula_proficiency_rate_limits from public, anon, authenticated;

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
  v_now timestamptz := clock_timestamp();
  v_hash text;
  v_existing_hash text;
  v_existing_applied jsonb;
  v_delta record;
  v_window_started_at timestamptz;
  v_used bigint;
  v_limit bigint;
  v_available bigint;
  v_accepted bigint;
  v_applied jsonb := '{}'::jsonb;
  v_retry_after integer;
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
    or jsonb_typeof(p_deltas) is distinct from 'object'
    or jsonb_object_length(p_deltas) < 1
    or jsonb_object_length(p_deltas) > 20 then
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

  -- Serialize a single account's batches so simultaneous devices cannot exceed
  -- the same per-key window allowance.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select b.payload_hash, b.applied_deltas
    into v_existing_hash, v_existing_applied
    from public.fibula_proficiency_batches b
   where b.user_id = v_uid
     and b.batch_id = p_batch_id;

  if found then
    if v_existing_hash is distinct from v_hash then
      raise exception 'Identificador de lote reutilizado com conteúdo diferente.';
    end if;

    return jsonb_build_object(
      'applied', true,
      'duplicate', true,
      'batch_id', p_batch_id,
      -- NULL means a receipt created before P7, which was applied in full.
      'applied_deltas', coalesce(v_existing_applied, p_deltas)
    );
  end if;

  -- Server clock only. The rolling 60-second window prevents client clock
  -- manipulation and avoids fixed-minute boundary bursts.
  for v_delta in
    select key, (value #>> '{}')::bigint as amount
      from jsonb_each(p_deltas)
     order by key
  loop
    v_limit := case v_delta.key
      when 'espada' then 1200
      when 'arco' then 1200
      when 'cajado' then 1200
      when 'bastao_natureza' then 1200
      when 'golpes_recebidos' then 600
      when 'machado_madeira' then 240
      when 'picareta' then 240
      when 'faca_esfolar' then 240
      when 'foice_mao' then 240
      when 'vara_pesca' then 12
      when 'carroca_distancia' then 18000
      else 0
    end;

    select r.window_started_at, r.used_units
      into v_window_started_at, v_used
      from public.fibula_proficiency_rate_limits r
     where r.user_id = v_uid
       and r.proficiency_key = v_delta.key;

    if not found or v_now >= v_window_started_at + interval '60 seconds' then
      v_window_started_at := v_now;
      v_used := 0;
    end if;

    v_available := greatest(0, v_limit - v_used);
    v_accepted := least(v_delta.amount, v_available);

    if v_accepted > 0 then
      v_applied := v_applied || jsonb_build_object(v_delta.key, v_accepted);
      insert into public.fibula_proficiency_rate_limits (
        user_id, proficiency_key, window_started_at, used_units
      )
      values (v_uid, v_delta.key, v_window_started_at, v_accepted)
      on conflict (user_id, proficiency_key)
      do update set
        window_started_at = excluded.window_started_at,
        used_units = case
          when public.fibula_proficiency_rate_limits.window_started_at = excluded.window_started_at
            then public.fibula_proficiency_rate_limits.used_units + excluded.used_units
          else excluded.used_units
        end;
    end if;

    if v_accepted < v_delta.amount then
      v_retry_after := least(
        coalesce(v_retry_after, 2147483647),
        greatest(1, ceil(extract(epoch from
          (v_window_started_at + interval '60 seconds' - v_now)))::integer)
      );
    end if;
  end loop;

  if jsonb_object_length(v_applied) = 0 then
    return jsonb_build_object(
      'applied', false,
      'duplicate', false,
      'rate_limited', true,
      'batch_id', p_batch_id,
      'applied_deltas', '{}'::jsonb,
      'retry_after_seconds', coalesce(v_retry_after, 60)
    );
  end if;

  insert into public.fibula_proficiency_batches (
    user_id, batch_id, payload_hash, applied_deltas
  )
  values (v_uid, p_batch_id, v_hash, v_applied);

  for v_delta in
    select key, (value #>> '{}')::bigint as amount
      from jsonb_each(v_applied)
  loop
    insert into public.fibula_proficiencies (
      user_id, proficiency_key, counter, updated_at
    )
    values (v_uid, v_delta.key, v_delta.amount, v_now)
    on conflict (user_id, proficiency_key)
    do update set
      counter = public.fibula_proficiencies.counter + excluded.counter,
      updated_at = v_now;

    v_updated := v_updated + 1;
  end loop;

  return jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'batch_id', p_batch_id,
    'updated', v_updated,
    'applied_deltas', v_applied,
    'rate_limited', v_retry_after is not null,
    'retry_after_seconds', v_retry_after
  );
end;
$function$;

revoke all on function public.fibula_apply_proficiency_batch(uuid, jsonb)
  from public, anon;
grant execute on function public.fibula_apply_proficiency_batch(uuid, jsonb)
  to authenticated;
