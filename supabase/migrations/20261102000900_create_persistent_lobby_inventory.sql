-- Persistent lobby inventory foundation.
-- This migration only defines the canonical model and guarded operations.
-- It deliberately does not import localStorage or rewrite legacy house JSON.
-- Keep the legacy fibula_house_storage row intact until a separately reviewed,
-- lossless reconciliation flow is implemented.

create table if not exists public.fibula_item_catalog (
  item_id text primary key,
  display_name text not null check (char_length(display_name) between 1 and 80),
  icon text,
  rarity text not null default 'normal'
    check (rarity in ('normal', 'comum', 'incomum', 'raro', 'lendario')),
  item_type text not null
    check (item_type in ('material', 'equipment', 'consumable', 'resource', 'other')),
  stackable boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fibula_item_catalog_stack_type
    check (stackable or item_type = 'equipment')
);

-- Initial canonical material IDs already used by the game engine.
insert into public.fibula_item_catalog
  (item_id, display_name, icon, rarity, item_type, stackable, metadata)
values
  ('wood', 'Madeira', '🪵', 'normal', 'material', true, '{}'::jsonb),
  ('stone', 'Pedra', '🪨', 'normal', 'material', true, '{}'::jsonb),
  ('cotton', 'Algodão', '☁️', 'normal', 'material', true, '{}'::jsonb),
  ('bronze', 'Bronze', '🟤', 'normal', 'material', true, '{}'::jsonb),
  ('linen', 'Linho', '🧵', 'normal', 'material', true, '{}'::jsonb)
on conflict (item_id) do nothing;

create table if not exists public.fibula_player_item_stacks (
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  item_id text not null references public.fibula_item_catalog(item_id) on update cascade,
  location text not null default 'house' check (location in ('house')),
  quantity bigint not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id, location)
);

create table if not exists public.fibula_player_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  item_id text not null references public.fibula_item_catalog(item_id) on update cascade,
  arsenal_slot smallint check (arsenal_slot between 1 and 30),
  attributes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(attributes) = 'object'),
  durability numeric(8,2) check (durability is null or durability >= 0),
  max_durability numeric(8,2) check (max_durability is null or max_durability >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fibula_player_equipment_durability
    check (durability is null or max_durability is null or durability <= max_durability),
  unique (user_id, id)
);

create unique index if not exists fibula_player_equipment_arsenal_slot_uidx
  on public.fibula_player_equipment (user_id, arsenal_slot)
  where arsenal_slot is not null;

create index if not exists fibula_player_item_stacks_user_idx
  on public.fibula_player_item_stacks (user_id, location);

create table if not exists public.fibula_player_loadouts (
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  class_id text not null
    check (class_id in ('guerreiro', 'mago', 'arqueiro', 'druida')),
  slot_key text not null check (char_length(slot_key) between 1 and 40),
  equipment_instance_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, class_id, slot_key),
  constraint fibula_player_loadouts_owned_equipment_fk
    foreign key (user_id, equipment_instance_id)
    references public.fibula_player_equipment(user_id, id)
    on delete set null (equipment_instance_id)
);

alter table public.fibula_item_catalog enable row level security;
alter table public.fibula_player_item_stacks enable row level security;
alter table public.fibula_player_equipment enable row level security;
alter table public.fibula_player_loadouts enable row level security;

-- No direct client writes. Inventory reads and mutations use the guarded RPCs.
revoke all on public.fibula_item_catalog from anon, authenticated;
revoke all on public.fibula_player_item_stacks from anon, authenticated;
revoke all on public.fibula_player_equipment from anon, authenticated;
revoke all on public.fibula_player_loadouts from anon, authenticated;

create or replace function public.fibula_inventory_assert_session()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;
  return v_user_id;
end;
$function$;

create or replace function public.fibula_inventory_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_inventory_assert_session();
  v_result jsonb;
begin
  select jsonb_build_object(
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', c.item_id,
        'display_name', c.display_name,
        'icon', c.icon,
        'rarity', c.rarity,
        'item_type', c.item_type,
        'stackable', c.stackable,
        'metadata', c.metadata
      ) order by c.item_id)
      from public.fibula_item_catalog c
      where c.is_active
    ), '[]'::jsonb),
    'stacks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id', s.item_id,
        'location', s.location,
        'quantity', s.quantity
      ) order by s.item_id)
      from public.fibula_player_item_stacks s
      where s.user_id = v_user_id
    ), '[]'::jsonb),
    'equipment', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'item_id', e.item_id,
        'arsenal_slot', e.arsenal_slot,
        'attributes', e.attributes,
        'durability', e.durability,
        'max_durability', e.max_durability
      ) order by e.arsenal_slot nulls last, e.created_at)
      from public.fibula_player_equipment e
      where e.user_id = v_user_id
    ), '[]'::jsonb),
    'loadouts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'class_id', l.class_id,
        'slot_key', l.slot_key,
        'equipment_instance_id', l.equipment_instance_id
      ) order by l.class_id, l.slot_key)
      from public.fibula_player_loadouts l
      where l.user_id = v_user_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

create or replace function public.fibula_inventory_adjust_stack(
  p_item_id text,
  p_delta bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_inventory_assert_session();
  v_stackable boolean;
  v_current bigint;
  v_next bigint;
begin
  if p_item_id is null or char_length(p_item_id) not between 1 and 100
    or p_delta is null or p_delta = 0
    or abs(p_delta::numeric) > 1000000000 then
    raise exception 'Movimentação de item inválida.';
  end if;

  select c.stackable into v_stackable
    from public.fibula_item_catalog c
   where c.item_id = p_item_id and c.is_active
   for share;

  if not found or not v_stackable then
    raise exception 'Item acumulável não encontrado no catálogo.';
  end if;

  select s.quantity into v_current
    from public.fibula_player_item_stacks s
   where s.user_id = v_user_id
     and s.item_id = p_item_id
     and s.location = 'house'
   for update;

  if not found then
    v_current := 0;
  end if;

  v_next := v_current + p_delta;
  if v_next < 0 then
    raise exception 'Quantidade insuficiente no armazenamento.';
  end if;

  if v_current = 0 and v_next > 0
    and (select count(*) from public.fibula_player_item_stacks s
          where s.user_id = v_user_id and s.location = 'house') >= 50 then
    raise exception 'O armazenamento da casa atingiu 50 espaços.';
  end if;

  if v_next = 0 then
    delete from public.fibula_player_item_stacks
     where user_id = v_user_id and item_id = p_item_id and location = 'house';
  else
    insert into public.fibula_player_item_stacks
      (user_id, item_id, location, quantity, updated_at)
    values (v_user_id, p_item_id, 'house', v_next, now())
    on conflict (user_id, item_id, location)
    do update set quantity = excluded.quantity, updated_at = now();
  end if;

  return v_next;
end;
$function$;

create or replace function public.fibula_inventory_add_equipment(
  p_item_id text,
  p_attributes jsonb default '{}'::jsonb,
  p_durability numeric default null,
  p_max_durability numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_inventory_assert_session();
  v_instance_id uuid;
  v_equipment boolean;
  v_slot smallint;
begin
  if p_attributes is null or jsonb_typeof(p_attributes) <> 'object'
    or (p_durability is not null and p_durability < 0)
    or (p_max_durability is not null and p_max_durability < 0)
    or (p_durability is not null and p_max_durability is not null
        and p_durability > p_max_durability) then
    raise exception 'Atributos ou durabilidade inválidos.';
  end if;

  select (c.item_type = 'equipment' and not c.stackable)
    into v_equipment
    from public.fibula_item_catalog c
   where c.item_id = p_item_id and c.is_active
   for share;

  if not found or not v_equipment then
    raise exception 'Equipamento não encontrado no catálogo.';
  end if;

  select candidate.slot
    into v_slot
    from generate_series(1, 30) as candidate(slot)
   where not exists (
     select 1 from public.fibula_player_equipment e
      where e.user_id = v_user_id and e.arsenal_slot = candidate.slot
   )
   order by candidate.slot
   limit 1;

  insert into public.fibula_player_equipment
    (user_id, item_id, arsenal_slot, attributes, durability, max_durability)
  values
    (v_user_id, p_item_id, v_slot, p_attributes, p_durability, p_max_durability)
  returning id into v_instance_id;

  return v_instance_id;
end;
$function$;

create or replace function public.fibula_inventory_set_loadout(
  p_class_id text,
  p_slot_key text,
  p_equipment_instance_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_inventory_assert_session();
begin
  if p_class_id not in ('guerreiro', 'mago', 'arqueiro', 'druida')
    or p_slot_key is null or char_length(p_slot_key) not between 1 and 40 then
    raise exception 'Loadout inválido.';
  end if;

  if p_equipment_instance_id is not null and not exists (
    select 1 from public.fibula_player_equipment e
     where e.id = p_equipment_instance_id and e.user_id = v_user_id
  ) then
    raise exception 'O equipamento não pertence a esta conta.';
  end if;

  if p_equipment_instance_id is null then
    delete from public.fibula_player_loadouts
     where user_id = v_user_id and class_id = p_class_id and slot_key = p_slot_key;
  else
    insert into public.fibula_player_loadouts
      (user_id, class_id, slot_key, equipment_instance_id, updated_at)
    values
      (v_user_id, p_class_id, p_slot_key, p_equipment_instance_id, now())
    on conflict (user_id, class_id, slot_key)
    do update set equipment_instance_id = excluded.equipment_instance_id,
                  updated_at = now();
  end if;
end;
$function$;

create or replace function public.fibula_inventory_remove_equipment(
  p_equipment_instance_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := public.fibula_inventory_assert_session();
  v_deleted integer;
begin
  delete from public.fibula_player_equipment
   where id = p_equipment_instance_id and user_id = v_user_id;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$function$;

-- SECURITY DEFINER RPCs are callable only by authenticated users; every
-- operation independently verifies the Arena issuer and auth.uid().
revoke all on function public.fibula_inventory_assert_session() from public, anon, authenticated;
revoke all on function public.fibula_inventory_snapshot() from public, anon;
revoke all on function public.fibula_inventory_adjust_stack(text, bigint) from public, anon;
revoke all on function public.fibula_inventory_add_equipment(text, jsonb, numeric, numeric) from public, anon;
revoke all on function public.fibula_inventory_set_loadout(text, text, uuid) from public, anon;
revoke all on function public.fibula_inventory_remove_equipment(uuid) from public, anon;

grant execute on function public.fibula_inventory_snapshot() to authenticated;
grant execute on function public.fibula_inventory_adjust_stack(text, bigint) to authenticated;
grant execute on function public.fibula_inventory_add_equipment(text, jsonb, numeric, numeric) to authenticated;
grant execute on function public.fibula_inventory_set_loadout(text, text, uuid) to authenticated;
grant execute on function public.fibula_inventory_remove_equipment(uuid) to authenticated;
