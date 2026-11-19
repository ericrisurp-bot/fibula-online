-- Foundation for offline-first player proficiencies.
-- Counts are accumulated by event key; no level or gameplay bonus is granted here.

create table public.fibula_proficiency_catalog (
  proficiency_key text primary key
    check (proficiency_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  display_name text not null
    check (char_length(display_name) between 1 and 80),
  category text not null
    check (category in ('combate', 'defesa', 'sobrevivencia', 'transporte')),
  counter_unit text not null
    check (counter_unit in ('acertos', 'impactos', 'acoes', 'puxadas', 'distancia')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.fibula_proficiency_catalog
  (proficiency_key, display_name, category, counter_unit)
values
  ('espada', 'Espada', 'combate', 'acertos'),
  ('arco', 'Arco', 'combate', 'acertos'),
  ('cajado', 'Cajado', 'combate', 'acertos'),
  ('bastao_natureza', 'Bastão da Natureza', 'combate', 'acertos'),
  ('golpes_recebidos', 'Golpes recebidos', 'defesa', 'impactos'),
  ('machado_madeira', 'Machado de madeira', 'sobrevivencia', 'acoes'),
  ('picareta', 'Picareta', 'sobrevivencia', 'acoes'),
  ('faca_esfolar', 'Faca de esfolar', 'sobrevivencia', 'acoes'),
  ('vara_pesca', 'Vara de pesca', 'sobrevivencia', 'puxadas'),
  ('foice_mao', 'Foice de mão', 'sobrevivencia', 'acoes'),
  ('carroca_distancia', 'Carroça', 'transporte', 'distancia');

create table public.fibula_proficiencies (
  user_id uuid not null
    references public.fibula_profiles(user_id) on delete cascade,
  proficiency_key text not null
    references public.fibula_proficiency_catalog(proficiency_key) on update cascade,
  counter bigint not null default 0 check (counter >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, proficiency_key)
);

create table public.fibula_proficiency_batches (
  user_id uuid not null
    references public.fibula_profiles(user_id) on delete cascade,
  batch_id uuid not null,
  payload_hash text not null
    check (payload_hash ~ '^[0-9a-f]{32}$'),
  applied_at timestamptz not null default now(),
  primary key (user_id, batch_id)
);

create index fibula_proficiencies_user_idx
  on public.fibula_proficiencies (user_id);

alter table public.fibula_proficiency_catalog enable row level security;
alter table public.fibula_proficiencies enable row level security;
alter table public.fibula_proficiency_batches enable row level security;

revoke all on table public.fibula_proficiency_catalog from anon, authenticated;
revoke all on table public.fibula_proficiencies from anon, authenticated;
revoke all on table public.fibula_proficiency_batches from anon, authenticated;

grant select on table public.fibula_proficiency_catalog to authenticated;
grant select on table public.fibula_proficiencies to authenticated;

create policy "Arena players can read proficiency catalog"
  on public.fibula_proficiency_catalog
  for select
  to authenticated
  using (
    (select auth.jwt() ->> 'iss')
      = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

create policy "Players can read their own proficiencies"
  on public.fibula_proficiencies
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'iss')
      = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

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

revoke all on function public.fibula_apply_proficiency_batch(uuid, jsonb)
  from public, anon;
grant execute on function public.fibula_apply_proficiency_batch(uuid, jsonb)
  to authenticated;