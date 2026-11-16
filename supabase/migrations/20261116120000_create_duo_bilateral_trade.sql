-- Bilateral lobby trade against the live inventory model:
-- fibula_house_storage (JSON stacks), fibula_weapons (weapon instances),
-- and fibula_cooking_state (prepared/ready/pending meal JSON).
-- Armor is intentionally not exposed until its persistent table exists.

create table if not exists public.fibula_duo_trade_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.fibula_duo_rooms(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested', 'open', 'completed', 'cancelled')),
  host_offer jsonb not null default '[]'::jsonb
    check (jsonb_typeof(host_offer) = 'array' and jsonb_array_length(host_offer) <= 5),
  guest_offer jsonb not null default '[]'::jsonb
    check (jsonb_typeof(guest_offer) = 'array' and jsonb_array_length(guest_offer) <= 5),
  host_confirmed boolean not null default false,
  guest_confirmed boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (host_id <> guest_id),
  check (requester_id in (host_id, guest_id))
);

create unique index if not exists fibula_duo_trade_one_pending_per_room_idx
  on public.fibula_duo_trade_sessions(room_id)
  where status in ('requested', 'open');

alter table public.fibula_duo_trade_sessions enable row level security;
revoke all on public.fibula_duo_trade_sessions from anon, authenticated;

create or replace function public.fibula_duo_trade_assert_user()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;
  return v_user_id;
end;
$function$;

create or replace function public.fibula_duo_trade_request(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_duo_trade_assert_user();
  v_host uuid;
  v_guest uuid;
  v_trade_id uuid;
begin
  select r.host_id, r.guest_id into v_host, v_guest
    from public.fibula_duo_rooms r
   where r.id = p_room_id and r.phase = 'lobby'
   for update;
  if not found or v_guest is null or v_user_id not in (v_host, v_guest)
    or (select count(*) from public.fibula_duo_room_participants p
         where p.room_id = p_room_id and p.left_at is null) <> 2
    or not exists (select 1 from public.fibula_duo_room_participants p
                    where p.room_id = p_room_id and p.user_id = v_user_id and p.left_at is null) then
    raise exception 'A troca só pode ser solicitada entre os dois jogadores conectados no lobby.';
  end if;

  select id into v_trade_id from public.fibula_duo_trade_sessions
   where room_id = p_room_id and status in ('requested', 'open')
   for update;
  if v_trade_id is not null then
    raise exception 'Já existe uma solicitação ou troca aberta neste lobby.';
  end if;

  insert into public.fibula_duo_trade_sessions(room_id, host_id, guest_id, requester_id)
  values (p_room_id, v_host, v_guest, v_user_id)
  returning id into v_trade_id;
  return v_trade_id;
end;
$function$;

create or replace function public.fibula_duo_trade_answer(p_trade_id uuid, p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_duo_trade_assert_user();
  v_trade public.fibula_duo_trade_sessions%rowtype;
  v_phase text;
  v_room_id uuid;
begin
  select room_id into v_room_id from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'requested';
  if not found then raise exception 'Solicitação não encontrada ou você não pode responder a ela.'; end if;
  select phase into v_phase from public.fibula_duo_rooms
   where id = v_room_id for update;
  select * into v_trade from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'requested' for update;
  if not found or v_user_id not in (v_trade.host_id, v_trade.guest_id)
    or v_user_id = v_trade.requester_id
    or (select count(*) from public.fibula_duo_room_participants p
         where p.room_id = v_trade.room_id and p.left_at is null) <> 2
    or not exists (select 1 from public.fibula_duo_room_participants p
                    where p.room_id = v_trade.room_id and p.user_id = v_trade.host_id and p.left_at is null)
    or not exists (select 1 from public.fibula_duo_room_participants p
                    where p.room_id = v_trade.room_id and p.user_id = v_trade.guest_id and p.left_at is null) then
    raise exception 'Solicitação não encontrada ou você não pode responder a ela.';
  end if;
  if v_phase is distinct from 'lobby' then
    update public.fibula_duo_trade_sessions set status = 'cancelled', updated_at = pg_catalog.now()
     where id = p_trade_id;
    return false;
  end if;
  update public.fibula_duo_trade_sessions
     set status = case when p_accept then 'open' else 'cancelled' end,
         updated_at = pg_catalog.now()
   where id = p_trade_id;
  return true;
end;
$function$;

create or replace function public.fibula_duo_trade_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_duo_trade_assert_user();
  v_result jsonb;
begin
  if not exists (select 1 from public.fibula_duo_room_participants p
                 where p.room_id = p_room_id and p.user_id = v_user_id and p.left_at is null) then
    raise exception 'Você não participa deste lobby.';
  end if;
  select jsonb_build_object(
    'id', t.id, 'room_id', t.room_id, 'host_id', t.host_id, 'guest_id', t.guest_id,
    'requester_id', t.requester_id, 'status', t.status,
    'host_offer', t.host_offer, 'guest_offer', t.guest_offer,
    'host_confirmed', t.host_confirmed, 'guest_confirmed', t.guest_confirmed,
    'revision', t.revision
  ) into v_result
  from public.fibula_duo_trade_sessions t
  where t.room_id = p_room_id
    and v_user_id in (t.host_id, t.guest_id)
  order by t.created_at desc limit 1;
  return v_result;
end;
$function$;

create or replace function public.fibula_duo_trade_set_offer(p_trade_id uuid, p_offer jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_duo_trade_assert_user();
  v_trade public.fibula_duo_trade_sessions%rowtype;
  v_room_phase text;
  v_entry jsonb;
  v_kind text;
  v_item_id text;
  v_quantity bigint;
  v_weapon_id uuid;
  v_meal_id text;
  v_meal_state text;
  v_array jsonb;
  v_meal jsonb;
  v_label text;
  v_rarity text;
  v_tier smallint;
  v_normalized_offer jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if p_offer is null or jsonb_typeof(p_offer) <> 'array' or jsonb_array_length(p_offer) > 5 then
    raise exception 'Cada oferta pode conter no máximo 5 itens.';
  end if;
  select * into v_trade from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open';
  if not found or v_user_id not in (v_trade.host_id, v_trade.guest_id) then
    raise exception 'Troca não encontrada ou não autorizada.';
  end if;
  select phase into v_room_phase from public.fibula_duo_rooms
   where id = v_trade.room_id for update;
  if v_room_phase is distinct from 'lobby'
    or (select count(*) from public.fibula_duo_room_participants p
         where p.room_id = v_trade.room_id and p.left_at is null) <> 2
    or not exists (select 1 from public.fibula_duo_room_participants p
                    where p.room_id=v_trade.room_id and p.user_id=v_trade.host_id and p.left_at is null)
    or not exists (select 1 from public.fibula_duo_room_participants p
                    where p.room_id=v_trade.room_id and p.user_id=v_trade.guest_id and p.left_at is null) then
    raise exception 'A oferta só pode ser alterada enquanto os dois participantes originais estiverem no lobby.';
  end if;
  select * into v_trade from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open' for update;

  for v_entry in select value from jsonb_array_elements(p_offer)
  loop
    if jsonb_typeof(v_entry) <> 'object' then raise exception 'Item de oferta inválido.'; end if;
    v_kind := v_entry ->> 'kind';
    if v_kind = 'stack' then
      v_item_id := v_entry ->> 'itemId';
      if v_entry ->> 'quantity' !~ '^[1-9][0-9]*$' then raise exception 'Quantidade inválida.'; end if;
      v_quantity := (v_entry ->> 'quantity')::bigint;
      if v_item_id is null or char_length(v_item_id) not between 1 and 100 then raise exception 'Material inválido.'; end if;
      if not exists (
        select 1 from public.fibula_house_storage h,
          lateral jsonb_array_elements(h.inventory) e
        where h.user_id = v_user_id and e.value ->> 'itemId' = v_item_id
          and coalesce(e.value ->> 'quantity','') ~ '^[1-9][0-9]*$'
          and (e.value ->> 'quantity')::bigint >= v_quantity
      ) then raise exception 'Quantidade insuficiente no seu Baú.'; end if;
      if (select count(*) from jsonb_array_elements(p_offer) e
           where e.value ->> 'kind' = 'stack' and e.value ->> 'itemId' = v_item_id) > 1 then
        raise exception 'Use apenas uma entrada por tipo de recurso.';
      end if;
      v_normalized_offer := v_normalized_offer || jsonb_build_array(v_entry);
    elsif v_kind = 'weapon' then
      v_weapon_id := (v_entry ->> 'weaponId')::uuid;
      select w.model, w.rarity, w.tier into v_label, v_rarity, v_tier
        from public.fibula_weapons w where w.id = v_weapon_id and w.user_id = v_user_id;
      if not found then raise exception 'A arma selecionada não pertence mais a você.'; end if;
      v_entry := v_entry || jsonb_build_object(
        'label', case v_label when 'espada' then 'Espada' when 'arco' then 'Arco' when 'cajado' then 'Cajado' else 'Bastão da Natureza' end,
        'rarity', v_rarity, 'tier', v_tier
      );
      v_normalized_offer := v_normalized_offer || jsonb_build_array(v_entry);
    elsif v_kind = 'meal' then
      v_meal_id := v_entry ->> 'mealId';
      v_meal_state := v_entry ->> 'mealState';
      if v_meal_state is null or v_meal_state not in ('prepared', 'ready', 'pending') or v_meal_id is null then
        raise exception 'Refeição inválida.';
      end if;
      select case v_meal_state when 'prepared' then prepared when 'ready' then ready else pending end
        into v_array from public.fibula_cooking_state where user_id = v_user_id;
      select m.value into v_meal from jsonb_array_elements(coalesce(v_array, '[]'::jsonb)) m where m.value ->> 'id' = v_meal_id;
      if v_meal is null then raise exception 'A refeição selecionada não está mais disponível.'; end if;
      v_entry := v_entry || jsonb_build_object(
        'label', coalesce(v_meal ->> 'name', 'Refeição'),
        'icon', coalesce(v_meal ->> 'icon', '🍲'),
        'rarity', coalesce(v_meal ->> 'rarity', 'normal')
      );
      v_normalized_offer := v_normalized_offer || jsonb_build_array(v_entry);
    else
      raise exception 'Categoria de item não permitida na troca.';
    end if;
    v_count := v_count + 1;
  end loop;

  if v_user_id = v_trade.host_id then
    update public.fibula_duo_trade_sessions
       set host_offer = v_normalized_offer, host_confirmed = false, guest_confirmed = false,
           revision = revision + 1, updated_at = pg_catalog.now()
     where id = p_trade_id;
  else
    update public.fibula_duo_trade_sessions
       set guest_offer = v_normalized_offer, host_confirmed = false, guest_confirmed = false,
           revision = revision + 1, updated_at = pg_catalog.now()
     where id = p_trade_id;
  end if;
  return v_count;
end;
$function$;


create or replace function public.fibula_duo_trade_confirm(p_trade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_duo_trade_assert_user();
  v_trade public.fibula_duo_trade_sessions%rowtype;
  v_room_phase text;
  v_room_id uuid;
  v_owner uuid;
  v_receiver uuid;
  v_offer jsonb;
  v_entry jsonb;
  v_item_id text;
  v_quantity bigint;
  v_inventory jsonb;
  v_next jsonb;
  v_current bigint;
  v_weapon_id uuid;
  v_meal_id text;
  v_meal_state text;
  v_source jsonb;
  v_target jsonb;
  v_meal jsonb;
  v_source_next jsonb;
  v_target_next jsonb;
  v_source_prepared jsonb;
  v_source_ready jsonb;
  v_source_pending jsonb;
  v_target_prepared jsonb;
  v_target_ready jsonb;
  v_target_pending jsonb;
begin
  select room_id into v_room_id
    from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open';
  if not found then raise exception 'Troca não encontrada ou encerrada.'; end if;

  select phase into v_room_phase
    from public.fibula_duo_rooms
   where id = v_room_id
   for update;
  if v_room_phase is distinct from 'lobby' then
    raise exception 'A troca só pode ser concluída no lobby.';
  end if;

  select * into v_trade
    from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open'
   for update;
  if not found or v_user_id not in (v_trade.host_id, v_trade.guest_id)
    or (select count(*) from public.fibula_duo_room_participants p
         where p.room_id = v_trade.room_id and p.left_at is null) <> 2
    or not exists (select 1 from public.fibula_duo_room_participants p
                    where p.room_id = v_trade.room_id and p.user_id = v_trade.host_id and p.left_at is null)
    or not exists (select 1 from public.fibula_duo_room_participants p
                    where p.room_id = v_trade.room_id and p.user_id = v_trade.guest_id and p.left_at is null) then
    raise exception 'Os dois participantes originais precisam continuar no lobby.';
  end if;

  update public.fibula_duo_trade_sessions
     set host_confirmed = host_confirmed or (v_user_id = host_id),
         guest_confirmed = guest_confirmed or (v_user_id = guest_id),
         updated_at = pg_catalog.now()
   where id = p_trade_id
  returning * into v_trade;
  if not (v_trade.host_confirmed and v_trade.guest_confirmed) then return false; end if;

  insert into public.fibula_house_storage(user_id, inventory)
  values (v_trade.host_id, '[]'::jsonb), (v_trade.guest_id, '[]'::jsonb)
  on conflict (user_id) do nothing;
  perform 1 from public.fibula_house_storage
   where user_id in (v_trade.host_id, v_trade.guest_id)
   order by user_id for update;

  insert into public.fibula_cooking_state(user_id)
  values (v_trade.host_id), (v_trade.guest_id)
  on conflict (user_id) do nothing;
  perform 1 from public.fibula_cooking_state
   where user_id in (v_trade.host_id, v_trade.guest_id)
   order by user_id for update;

  for v_owner, v_offer in
    select v_trade.host_id, v_trade.host_offer
    union all
    select v_trade.guest_id, v_trade.guest_offer
  loop
    v_receiver := case when v_owner = v_trade.host_id then v_trade.guest_id else v_trade.host_id end;
    for v_entry in select value from jsonb_array_elements(v_offer)
    loop
      if v_entry ->> 'kind' = 'stack' then
        v_item_id := v_entry ->> 'itemId';
        v_quantity := (v_entry ->> 'quantity')::bigint;

        select inventory into v_inventory
          from public.fibula_house_storage where user_id = v_owner;
        if exists (
          select 1 from jsonb_array_elements(v_inventory) e
           where e.value ->> 'itemId' = v_item_id
             and coalesce(e.value ->> 'quantity','') !~ '^[1-9][0-9]*$'
        ) then
          raise exception 'O Baú contém uma quantidade inválida para um item da oferta.';
        end if;
        select coalesce(sum((e.value ->> 'quantity')::bigint),0) into v_current
          from jsonb_array_elements(v_inventory) e
         where e.value ->> 'itemId' = v_item_id;
        if v_current < v_quantity then
          raise exception 'Um recurso da oferta não está mais disponível.';
        end if;
        select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb) into v_next
          from jsonb_array_elements(v_inventory) with ordinality e(value, ordinality)
         where e.value ->> 'itemId' is distinct from v_item_id;
        if v_current > v_quantity then
          v_next := v_next || jsonb_build_array(jsonb_build_object('itemId',v_item_id,'quantity',v_current-v_quantity));
        end if;
        update public.fibula_house_storage
           set inventory = v_next, updated_at = pg_catalog.now()
         where user_id = v_owner;

        select inventory into v_inventory
          from public.fibula_house_storage where user_id = v_receiver;
        if exists (
          select 1 from jsonb_array_elements(v_inventory) e
           where e.value ->> 'itemId' = v_item_id
             and coalesce(e.value ->> 'quantity','') !~ '^[1-9][0-9]*$'
        ) then
          raise exception 'O Baú de destino contém uma quantidade inválida para um item da oferta.';
        end if;
        select coalesce(sum((e.value ->> 'quantity')::bigint),0) into v_current
          from jsonb_array_elements(v_inventory) e
         where e.value ->> 'itemId' = v_item_id;
        if v_current = 0 and jsonb_array_length(v_inventory) >= 50 then
          raise exception 'O Baú do outro jogador está cheio.';
        end if;
        if v_current + v_quantity > 1000000000 then
          raise exception 'Quantidade máxima excedida no Baú.';
        end if;
        select coalesce(jsonb_agg(e.value order by e.ordinality), '[]'::jsonb) into v_next
          from jsonb_array_elements(v_inventory) with ordinality e(value, ordinality)
         where e.value ->> 'itemId' is distinct from v_item_id;
        v_next := v_next || jsonb_build_array(jsonb_build_object('itemId',v_item_id,'quantity',v_current+v_quantity));
        update public.fibula_house_storage
           set inventory = v_next, updated_at = pg_catalog.now()
         where user_id = v_receiver;

      elsif v_entry ->> 'kind' = 'weapon' then
        v_weapon_id := (v_entry ->> 'weaponId')::uuid;
        update public.fibula_weapons set user_id = v_receiver
         where id = v_weapon_id and user_id = v_owner;
        if not found then raise exception 'Uma arma da oferta não está mais disponível.'; end if;

      elsif v_entry ->> 'kind' = 'meal' then
        v_meal_id := v_entry ->> 'mealId';
        v_meal_state := v_entry ->> 'mealState';
        select prepared, ready, pending
          into v_source_prepared, v_source_ready, v_source_pending
          from public.fibula_cooking_state where user_id = v_owner;
        select prepared, ready, pending
          into v_target_prepared, v_target_ready, v_target_pending
          from public.fibula_cooking_state where user_id = v_receiver;

        v_source := case v_meal_state
          when 'prepared' then v_source_prepared
          when 'ready' then v_source_ready
          else v_source_pending end;
        v_target := case v_meal_state
          when 'prepared' then v_target_prepared
          when 'ready' then v_target_ready
          else v_target_pending end;

        select m.value into v_meal
          from jsonb_array_elements(v_source) m
         where m.value ->> 'id' = v_meal_id;
        if v_meal is null then raise exception 'Uma refeição da oferta não está mais disponível.'; end if;
        if exists (select 1 from jsonb_array_elements(v_target) m where m.value ->> 'id' = v_meal_id) then
          raise exception 'A refeição já existe no inventário de destino.';
        end if;
        if (v_meal_state = 'prepared' and jsonb_array_length(v_target) >= 3)
          or (v_meal_state = 'pending' and jsonb_array_length(v_target) >= 2)
          or (v_meal_state = 'ready' and jsonb_array_length(v_target) >= 200) then
          raise exception 'O espaço de refeições do outro jogador está cheio.';
        end if;

        select coalesce(jsonb_agg(m.value order by m.ordinality),'[]'::jsonb) into v_source_next
          from jsonb_array_elements(v_source) with ordinality m(value, ordinality)
         where m.value ->> 'id' is distinct from v_meal_id;
        v_target_next := v_target || jsonb_build_array(v_meal);

        update public.fibula_cooking_state
           set prepared = case when v_meal_state='prepared' then v_source_next else prepared end,
               ready = case when v_meal_state='ready' then v_source_next else ready end,
               pending = case when v_meal_state='pending' then v_source_next else pending end,
               updated_at = pg_catalog.now()
         where user_id = v_owner;
        update public.fibula_cooking_state
           set prepared = case when v_meal_state='prepared' then v_target_next else prepared end,
               ready = case when v_meal_state='ready' then v_target_next else ready end,
               pending = case when v_meal_state='pending' then v_target_next else pending end,
               updated_at = pg_catalog.now()
         where user_id = v_receiver;
      end if;
    end loop;
  end loop;

  update public.fibula_duo_trade_sessions
     set status='completed', completed_at=pg_catalog.now(), updated_at=pg_catalog.now()
   where id=p_trade_id;
  return true;
end;
$function$;

create or replace function public.fibula_duo_trade_cancel(p_trade_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_duo_trade_assert_user();
  v_room_id uuid;
begin
  select room_id into v_room_id from public.fibula_duo_trade_sessions
   where id=p_trade_id and status in ('requested','open')
     and v_user_id in (host_id,guest_id);
  if not found then return false; end if;
  perform 1 from public.fibula_duo_rooms where id=v_room_id for update;
  update public.fibula_duo_trade_sessions
     set status='cancelled', updated_at=pg_catalog.now()
   where id=p_trade_id and status in ('requested','open')
     and v_user_id in (host_id,guest_id);
  return found;
end;
$function$;

revoke all on function public.fibula_duo_trade_assert_user() from public, anon, authenticated;
revoke all on function public.fibula_duo_trade_request(uuid) from public, anon;
revoke all on function public.fibula_duo_trade_answer(uuid, boolean) from public, anon;
revoke all on function public.fibula_duo_trade_snapshot(uuid) from public, anon;
revoke all on function public.fibula_duo_trade_set_offer(uuid, jsonb) from public, anon;
revoke all on function public.fibula_duo_trade_confirm(uuid) from public, anon;
revoke all on function public.fibula_duo_trade_cancel(uuid) from public, anon;

grant execute on function public.fibula_duo_trade_request(uuid) to authenticated;
grant execute on function public.fibula_duo_trade_answer(uuid, boolean) to authenticated;
grant execute on function public.fibula_duo_trade_snapshot(uuid) to authenticated;
grant execute on function public.fibula_duo_trade_set_offer(uuid, jsonb) to authenticated;
grant execute on function public.fibula_duo_trade_confirm(uuid) to authenticated;
grant execute on function public.fibula_duo_trade_cancel(uuid) to authenticated;
