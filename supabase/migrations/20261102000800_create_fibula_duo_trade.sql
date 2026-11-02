-- Duo trade foundation: private player items and atomic lobby transfers.
-- No existing inventory is imported or changed by this migration.
-- Client integration must register each player's current local inventory before trading.

create table if not exists public.fibula_player_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_data jsonb not null check (jsonb_typeof(item_data) = 'object'),
  quantity integer not null default 1 check (quantity > 0),
  reserved_trade_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fibula_player_items_owner_idx
  on public.fibula_player_items (owner_id, created_at);
create index if not exists fibula_player_items_reserved_idx
  on public.fibula_player_items (reserved_trade_id)
  where reserved_trade_id is not null;

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
  trade_id uuid not null references public.fibula_duo_trade_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.fibula_player_items(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (trade_id, item_id)
);

create index if not exists fibula_duo_trade_offers_owner_idx
  on public.fibula_duo_trade_offers (owner_id, trade_id);

alter table public.fibula_player_items enable row level security;
alter table public.fibula_duo_trade_sessions enable row level security;
alter table public.fibula_duo_trade_offers enable row level security;

-- All reads and writes go through security-definer RPCs; clients cannot
-- directly enumerate inventories or alter trade state.
revoke all on public.fibula_player_items from anon, authenticated;
revoke all on public.fibula_duo_trade_sessions from anon, authenticated;
revoke all on public.fibula_duo_trade_offers from anon, authenticated;

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
  v_phase text;
  v_trade_id uuid;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select r.host_id, r.guest_id, r.phase
    into v_host_id, v_guest_id, v_phase
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;

  if not found or v_phase <> 'lobby' or v_guest_id is null
    or v_user_id not in (v_host_id, v_guest_id) then
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

create or replace function public.fibula_duo_trade_set_offer(p_trade_id uuid, p_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_trade public.fibula_duo_trade_sessions%rowtype;
  v_item_id uuid;
  v_count integer := 0;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;
  if coalesce(pg_catalog.cardinality(p_item_ids), 0) > 40
    or (select pg_catalog.count(*) from pg_catalog.unnest(p_item_ids) as u(item_id)) <>
       (select pg_catalog.count(distinct u.item_id) from pg_catalog.unnest(p_item_ids) as u(item_id)) then
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
     where r.id = v_trade.room_id and r.phase = 'lobby'
  ) then
    raise exception 'A negociação só pode mudar enquanto os dois estão no lobby.';
  end if;

  -- Release the caller's previous offer before validating its replacement.
  delete from public.fibula_duo_trade_offers
   where trade_id = p_trade_id and owner_id = v_user_id;
  update public.fibula_player_items
     set reserved_trade_id = null, updated_at = pg_catalog.now()
   where reserved_trade_id = p_trade_id and owner_id = v_user_id;

  foreach v_item_id in array coalesce(p_item_ids, array[]::uuid[]) loop
    perform 1
      from public.fibula_player_items i
     where i.id = v_item_id and i.owner_id = v_user_id
       and i.reserved_trade_id is null
     for update;
    if not found then
      raise exception 'Um dos itens não está disponível no seu inventário.';
    end if;

    update public.fibula_player_items
       set reserved_trade_id = p_trade_id, updated_at = pg_catalog.now()
     where id = v_item_id and owner_id = v_user_id;

    insert into public.fibula_duo_trade_offers (trade_id, owner_id, item_id)
    values (p_trade_id, v_user_id, v_item_id);
    v_count := v_count + 1;
  end loop;

  update public.fibula_duo_trade_sessions
     set host_confirmed = false,
         guest_confirmed = false,
         revision = revision + 1,
         updated_at = pg_catalog.now()
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
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
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

  if v_trade.host_confirmed and v_trade.guest_confirmed then
    -- One transaction transfers every reserved item or none of them.
    update public.fibula_player_items i
       set owner_id = case
             when o.owner_id = v_trade.host_id then v_trade.guest_id
             else v_trade.host_id
           end,
           reserved_trade_id = null,
           updated_at = pg_catalog.now()
      from public.fibula_duo_trade_offers o
     where o.trade_id = p_trade_id
       and i.id = o.item_id
       and i.owner_id = o.owner_id
       and i.reserved_trade_id = p_trade_id;

    if exists (
      select 1 from public.fibula_duo_trade_offers o
      left join public.fibula_player_items i
        on i.id = o.item_id
       and i.reserved_trade_id is null
       and i.owner_id = case
         when o.owner_id = v_trade.host_id then v_trade.guest_id
         else v_trade.host_id
       end
      where o.trade_id = p_trade_id and i.id is null
    ) then
      raise exception 'Não foi possível validar todos os itens da troca.';
    end if;

    update public.fibula_duo_trade_sessions
       set status = 'completed', completed_at = pg_catalog.now(),
           updated_at = pg_catalog.now()
     where id = p_trade_id;
    return true;
  end if;

  return false;
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
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  perform 1
    from public.fibula_duo_trade_sessions
   where id = p_trade_id and status = 'open'
     and v_user_id in (host_id, guest_id)
   for update;
  if not found then
    return false;
  end if;

  update public.fibula_player_items
     set reserved_trade_id = null, updated_at = pg_catalog.now()
   where reserved_trade_id = p_trade_id;
  update public.fibula_duo_trade_sessions
     set status = 'cancelled', updated_at = pg_catalog.now()
   where id = p_trade_id;

  return true;
end;
$function$;

revoke all on function public.fibula_duo_trade_open(uuid) from public, anon;
revoke all on function public.fibula_duo_trade_set_offer(uuid, uuid[]) from public, anon;
revoke all on function public.fibula_duo_trade_confirm(uuid) from public, anon;
revoke all on function public.fibula_duo_trade_cancel(uuid) from public, anon;
grant execute on function public.fibula_duo_trade_open(uuid) to authenticated;
grant execute on function public.fibula_duo_trade_set_offer(uuid, uuid[]) to authenticated;
grant execute on function public.fibula_duo_trade_confirm(uuid) to authenticated;
grant execute on function public.fibula_duo_trade_cancel(uuid) to authenticated;
