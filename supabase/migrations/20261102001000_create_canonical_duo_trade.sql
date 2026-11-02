-- Canonical Duo trade foundation.
-- Depends on 20261102000900_create_persistent_lobby_inventory.sql.
-- No legacy localStorage data is imported or modified by this migration.

alter table public.fibula_player_item_stacks
  add column if not exists reserved_quantity bigint not null default 0
  check (reserved_quantity >= 0 and reserved_quantity <= quantity);

alter table public.fibula_player_equipment
  add column if not exists reserved_trade_id uuid;

create table if not exists public.fibula_duo_trade_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.fibula_duo_rooms(id) on delete cascade,
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open'
    check (status in ('open', 'completed', 'cancelled')),
  host_confirmed boolean not null default false,
  guest_confirmed boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check (host_id <> guest_id)
);

create unique index if not exists fibula_duo_trade_one_open_per_room_idx
  on public.fibula_duo_trade_sessions (room_id)
  where status = 'open';

create table if not exists public.fibula_duo_trade_offers (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.fibula_duo_trade_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id text references public.fibula_item_catalog(item_id),
  quantity bigint,
  equipment_id uuid references public.fibula_player_equipment(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (item_id is not null and quantity is not null and quantity > 0 and equipment_id is null)
    or (item_id is null and quantity is null and equipment_id is not null)
  )
);

create index if not exists fibula_duo_trade_offers_owner_idx
  on public.fibula_duo_trade_offers (owner_id, trade_id);
create unique index if not exists fibula_duo_trade_offer_stack_uidx
  on public.fibula_duo_trade_offers (trade_id, owner_id, item_id)
  where item_id is not null;
create unique index if not exists fibula_duo_trade_offer_equipment_uidx
  on public.fibula_duo_trade_offers (trade_id, owner_id, equipment_id)
  where equipment_id is not null;

alter table public.fibula_duo_trade_sessions enable row level security;
alter table public.fibula_duo_trade_offers enable row level security;
revoke all on public.fibula_duo_trade_sessions from anon, authenticated;
revoke all on public.fibula_duo_trade_offers from anon, authenticated;

-- Prevent ordinary inventory RPCs from spending or deleting quantities reserved
-- by an open trade. The existing inventory adjustment function stays unchanged.
create or replace function public.fibula_inventory_guard_reserved_stack()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.reserved_quantity > 0 then
      raise exception 'Este material está reservado em uma troca.';
    end if;
    return old;
  end if;

  if new.quantity < new.reserved_quantity then
    raise exception 'Parte deste material está reservada em uma troca.';
  end if;
  return new;
end;
$function$;

drop trigger if exists fibula_inventory_reserved_stack_guard
  on public.fibula_player_item_stacks;
create trigger fibula_inventory_reserved_stack_guard
before update or delete on public.fibula_player_item_stacks
for each row execute function public.fibula_inventory_guard_reserved_stack();

create or replace function public.fibula_duo_trade_open(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_host_id uuid;
  v_guest_id uuid;
  v_trade_id uuid;
begin
  perform public.fibula_inventory_assert_session();

  select r.host_id, r.guest_id
    into v_host_id, v_guest_id
    from public.fibula_duo_rooms r
   where r.id = p_room_id and r.phase = 'lobby'
   for update;

  if not found or v_guest_id is null
    or v_user_id not in (v_host_id, v_guest_id)
    or not exists (
      select 1 from public.fibula_duo_room_participants p
       where p.room_id = p_room_id and p.user_id = v_user_id
         and p.left_at is null
    ) then
    raise exception 'A troca só pode ser aberta pelos dois participantes no lobby.';
  end if;

  select t.id into v_trade_id
    from public.fibula_duo_trade_sessions t
   where t.room_id = p_room_id and t.status = 'open'
   for update;

  if v_trade_id is null then
    insert into public.fibula_duo_trade_sessions (room_id, host_id, guest_id)
    values (p_room_id, v_host_id, v_guest_id)
    returning id into v_trade_id;
  end if;

  return v_trade_id;
end;
$function$;

-- p_offer is an array of {item_id, quantity} stack entries or
-- {equipment_id} individual equipment entries.
create or replace function public.fibula_duo_trade_set_offer(
  p_trade_id uuid,
  p_offer jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_trade public.fibula_duo_trade_sessions%rowtype;
  v_entry jsonb;
  v_item_id text;
  v_quantity bigint;
  v_equipment_id uuid;
  v_count integer := 0;
  v_keys integer;
begin
  perform public.fibula_inventory_assert_session();

  if p_offer is null or jsonb_typeof(p_offer) <> 'array'
    or jsonb_array_length(p_offer) > 40 then
    raise exception 'Oferta inválida.';
  end if;

  select * into v_trade
    from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open'
   for update;
  if not found or v_user_id not in (v_trade.host_id, v_trade.guest_id) then
    raise exception 'Negociação não encontrada ou não autorizada.';
  end if;
  if not exists (
    select 1 from public.fibula_duo_rooms r
     join public.fibula_duo_room_participants p on p.room_id = r.id
     where r.id = v_trade.room_id and r.phase = 'lobby'
       and p.user_id = v_user_id and p.left_at is null
  ) then
    raise exception 'A negociação só pode mudar enquanto você estiver no lobby.';
  end if;

  -- Release the caller's previous reservation before validating its replacement.
  update public.fibula_player_item_stacks s
     set reserved_quantity = s.reserved_quantity - o.quantity,
         updated_at = pg_catalog.now()
    from public.fibula_duo_trade_offers o
   where o.trade_id = p_trade_id and o.owner_id = v_user_id
     and o.item_id = s.item_id and s.user_id = v_user_id
     and s.location = 'house';

  update public.fibula_player_equipment e
     set reserved_trade_id = null, updated_at = pg_catalog.now()
    from public.fibula_duo_trade_offers o
   where o.trade_id = p_trade_id and o.owner_id = v_user_id
     and o.equipment_id = e.id and e.user_id = v_user_id
     and e.reserved_trade_id = p_trade_id;

  delete from public.fibula_duo_trade_offers
   where trade_id = p_trade_id and owner_id = v_user_id;

  for v_entry in select value from jsonb_array_elements(p_offer)
  loop
    if jsonb_typeof(v_entry) <> 'object' then
      raise exception 'Formato de item inválido.';
    end if;
    v_keys := (case when v_entry ? 'item_id' then 1 else 0 end)
            + (case when v_entry ? 'quantity' then 1 else 0 end)
            + (case when v_entry ? 'equipment_id' then 1 else 0 end);

    if v_keys = 2 and v_entry ? 'item_id' and v_entry ? 'quantity' then
      v_item_id := v_entry ->> 'item_id';
      v_quantity := (v_entry ->> 'quantity')::bigint;
      if v_item_id is null or char_length(v_item_id) not between 1 and 100
        or v_quantity is null or v_quantity <= 0 then
        raise exception 'Quantidade de material inválida.';
      end if;

      update public.fibula_player_item_stacks s
         set reserved_quantity = s.reserved_quantity + v_quantity,
             updated_at = pg_catalog.now()
        from public.fibula_item_catalog c
       where s.user_id = v_user_id and s.item_id = v_item_id
         and s.location = 'house'
         and c.item_id = s.item_id and c.is_active and c.stackable
         and s.quantity - s.reserved_quantity >= v_quantity;
      if not found then
        raise exception 'Material insuficiente ou indisponível para troca.';
      end if;

      insert into public.fibula_duo_trade_offers
        (trade_id, owner_id, item_id, quantity)
      values (p_trade_id, v_user_id, v_item_id, v_quantity);
    elsif v_keys = 1 and v_entry ? 'equipment_id' then
      v_equipment_id := (v_entry ->> 'equipment_id')::uuid;
      update public.fibula_player_equipment
         set reserved_trade_id = p_trade_id, updated_at = pg_catalog.now()
       where id = v_equipment_id and user_id = v_user_id
         and reserved_trade_id is null;
      if not found then
        raise exception 'Equipamento indisponível para troca.';
      end if;

      insert into public.fibula_duo_trade_offers
        (trade_id, owner_id, equipment_id)
      values (p_trade_id, v_user_id, v_equipment_id);
    else
      raise exception 'Cada item deve informar material e quantidade ou um equipamento.';
    end if;
    v_count := v_count + 1;
  end loop;

  update public.fibula_duo_trade_sessions
     set host_confirmed = false, guest_confirmed = false,
         revision = revision + 1, updated_at = pg_catalog.now()
   where id = p_trade_id;

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
  v_user_id uuid := (select auth.uid());
  v_trade public.fibula_duo_trade_sessions%rowtype;
  v_offer record;
  v_receiver uuid;
  v_next_slot smallint;
  v_current_quantity bigint;
begin
  perform public.fibula_inventory_assert_session();

  select * into v_trade
    from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open'
   for update;
  if not found or v_user_id not in (v_trade.host_id, v_trade.guest_id) then
    raise exception 'Negociação não encontrada ou não autorizada.';
  end if;
  if not exists (
    select 1 from public.fibula_duo_rooms r
     where r.id = v_trade.room_id and r.phase = 'lobby'
  ) then
    raise exception 'A negociação não está mais no lobby.';
  end if;

  update public.fibula_duo_trade_sessions
     set host_confirmed = host_confirmed or (v_user_id = host_id),
         guest_confirmed = guest_confirmed or (v_user_id = guest_id),
         updated_at = pg_catalog.now()
   where id = p_trade_id
  returning * into v_trade;

  if not (v_trade.host_confirmed and v_trade.guest_confirmed) then
    return false;
  end if;

  -- Check receiver capacity before transferring any item.
  for v_offer in
    select o.* from public.fibula_duo_trade_offers o
     where o.trade_id = p_trade_id
     order by o.owner_id, o.item_id nulls last, o.equipment_id
  loop
    v_receiver := case when v_offer.owner_id = v_trade.host_id
                       then v_trade.guest_id else v_trade.host_id end;

    if v_offer.item_id is not null then
      select s.quantity into v_current_quantity
        from public.fibula_player_item_stacks s
       where s.user_id = v_receiver and s.item_id = v_offer.item_id
         and s.location = 'house'
       for update;
      if not found then
        if (select count(*) from public.fibula_player_item_stacks s
             where s.user_id = v_receiver and s.location = 'house') >= 50 then
          raise exception 'O armazenamento do outro jogador está cheio.';
        end if;
        v_current_quantity := 0;
      end if;
      if v_current_quantity + v_offer.quantity > 1000000000 then
        raise exception 'A quantidade excede o limite permitido.';
      end if;
    else
      select candidate.slot into v_next_slot
        from generate_series(1, 30) as candidate(slot)
       where not exists (
         select 1 from public.fibula_player_equipment e
          where e.user_id = v_receiver and e.arsenal_slot = candidate.slot
       )
       order by candidate.slot limit 1;
      if v_next_slot is null then
        raise exception 'O Arsenal do outro jogador está cheio.';
      end if;
    end if;
  end loop;

  -- Transfer stack quantities while releasing their reservations.
  for v_offer in
    select o.* from public.fibula_duo_trade_offers o
     where o.trade_id = p_trade_id and o.item_id is not null
     order by o.owner_id, o.item_id
  loop
    v_receiver := case when v_offer.owner_id = v_trade.host_id
                       then v_trade.guest_id else v_trade.host_id end;

    update public.fibula_player_item_stacks
       set quantity = quantity - v_offer.quantity,
           reserved_quantity = reserved_quantity - v_offer.quantity,
           updated_at = pg_catalog.now()
     where user_id = v_offer.owner_id and item_id = v_offer.item_id
       and location = 'house'
       and reserved_quantity >= v_offer.quantity
       and quantity >= v_offer.quantity;

    if not found then
      raise exception 'Um material reservado não está mais disponível.';
    end if;

    delete from public.fibula_player_item_stacks
     where user_id = v_offer.owner_id and item_id = v_offer.item_id
       and location = 'house' and quantity = 0;

    insert into public.fibula_player_item_stacks
      (user_id, item_id, location, quantity, updated_at)
    values (v_receiver, v_offer.item_id, 'house', v_offer.quantity, pg_catalog.now())
    on conflict (user_id, item_id, location)
    do update set quantity = public.fibula_player_item_stacks.quantity + excluded.quantity,
                  updated_at = pg_catalog.now();
  end loop;

  -- Equipment retains its instance ID, attributes and durability.
  for v_offer in
    select o.* from public.fibula_duo_trade_offers o
     where o.trade_id = p_trade_id and o.equipment_id is not null
     order by o.owner_id, o.equipment_id
  loop
    v_receiver := case when v_offer.owner_id = v_trade.host_id
                       then v_trade.guest_id else v_trade.host_id end;

    update public.fibula_player_loadouts
       set equipment_instance_id = null, updated_at = pg_catalog.now()
     where user_id = v_offer.owner_id
       and equipment_instance_id = v_offer.equipment_id;

    select candidate.slot into v_next_slot
      from generate_series(1, 30) as candidate(slot)
     where not exists (
       select 1 from public.fibula_player_equipment e
        where e.user_id = v_receiver and e.arsenal_slot = candidate.slot
     )
     order by candidate.slot limit 1;

    update public.fibula_player_equipment
       set user_id = v_receiver, arsenal_slot = v_next_slot,
           reserved_trade_id = null, updated_at = pg_catalog.now()
     where id = v_offer.equipment_id and user_id = v_offer.owner_id
       and reserved_trade_id = p_trade_id;
    if not found then
      raise exception 'Um equipamento reservado não está mais disponível.';
    end if;
  end loop;

  update public.fibula_duo_trade_sessions
     set status = 'completed', completed_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = p_trade_id;
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
  v_user_id uuid := (select auth.uid());
begin
  perform public.fibula_inventory_assert_session();

  perform 1 from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open'
     and v_user_id in (host_id, guest_id)
   for update;
  if not found then
    return false;
  end if;

  update public.fibula_player_item_stacks s
     set reserved_quantity = s.reserved_quantity - o.quantity,
         updated_at = pg_catalog.now()
    from public.fibula_duo_trade_offers o
   where o.trade_id = p_trade_id and o.item_id = s.item_id
     and o.owner_id = s.user_id and s.location = 'house';

  update public.fibula_player_equipment e
     set reserved_trade_id = null, updated_at = pg_catalog.now()
    from public.fibula_duo_trade_offers o
   where o.trade_id = p_trade_id and o.equipment_id = e.id
     and e.user_id = o.owner_id and e.reserved_trade_id = p_trade_id;

  update public.fibula_duo_trade_sessions
     set status = 'cancelled', updated_at = pg_catalog.now()
   where id = p_trade_id;
  return true;
end;
$function$;

revoke all on function public.fibula_inventory_guard_reserved_stack() from public, anon, authenticated;
revoke all on function public.fibula_duo_trade_open(uuid) from public, anon;
revoke all on function public.fibula_duo_trade_set_offer(uuid, jsonb) from public, anon;
revoke all on function public.fibula_duo_trade_confirm(uuid) from public, anon;
revoke all on function public.fibula_duo_trade_cancel(uuid) from public, anon;
grant execute on function public.fibula_duo_trade_open(uuid) to authenticated;
grant execute on function public.fibula_duo_trade_set_offer(uuid, jsonb) to authenticated;
grant execute on function public.fibula_duo_trade_confirm(uuid) to authenticated;
grant execute on function public.fibula_duo_trade_cancel(uuid) to authenticated;
