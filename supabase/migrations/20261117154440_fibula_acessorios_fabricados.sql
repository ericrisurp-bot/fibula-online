-- J3 — acessórios fabricados: tabela, leitura protegida e RPCs.
-- Esta migration já consta no histórico do projeto fibula-online (20261117154440).
-- O arquivo foi reconstruído a partir do schema e das funções existentes no banco;
-- não aplicar novamente no projeto que já registra esta versão.

create table if not exists public.fibula_accessories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  type text not null check (type in ('colar', 'pulseira', 'cinto')),
  rarity text not null check (rarity in ('normal', 'common', 'uncommon', 'rare', 'legendary')),
  metal text not null default 'bronze' check (metal in ('bronze', 'ferro')),
  stars smallint not null default 1 check (stars between 1 and 4),
  surp boolean not null default false,
  attributes jsonb not null
    check (jsonb_typeof(attributes) = 'array' and jsonb_array_length(attributes) between 2 and 4),
  lining text not null check (lining in ('linho', 'couro_refinado')),
  created_at timestamptz not null default now(),
  crafted_by text
    check (crafted_by is null or char_length(crafted_by) between 1 and 60),
  constraint fibula_accessories_stars_by_metal
    check (stars <= case metal when 'bronze' then 2 else 4 end)
);

create index if not exists fibula_accessories_user_idx
  on public.fibula_accessories (user_id, created_at desc);

alter table public.fibula_accessories enable row level security;

revoke all on table public.fibula_accessories from anon, authenticated;
grant select on table public.fibula_accessories to authenticated;

drop policy if exists "Players can read their own accessories" on public.fibula_accessories;
create policy "Players can read their own accessories"
  on public.fibula_accessories
  for select
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

create or replace function public.fibula_craft_accessory(
  p_lining text,
  p_core_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_rarity text;
  v_core jsonb;
  v_attrs jsonb;
  v_attr jsonb;
  v_etype text;
  v_i int;
  v_n int;
  v_ref numeric;
  v_surp boolean;
  v_all_max boolean := true;
  v_roll numeric;
  v_akey text;
  v_base numeric;
  v_val numeric;
  v_out jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_step int;
  v_suffix text;
  v_needs jsonb;
  v_need record;
  v_el jsonb;
  v_new jsonb;
  v_inv jsonb;
  v_left int;
  v_have int;
  v_q int;
  v_take int;
  v_qty_base int;
  v_qty_lining int;
  v_base_item text;
  v_lining_item text;
  v_acc public.fibula_accessories;
begin
  if v_uid is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if p_lining is null or p_lining not in ('linho', 'couro_refinado') then
    raise exception 'Alça inválida.';
  end if;
  if p_core_item_id is null
    or char_length(p_core_item_id) > 1000
    or p_core_item_id !~ '^rcore:(normal|common|uncommon|rare|legendary):' then
    raise exception 'Núcleo inválido.';
  end if;

  v_rarity := split_part(p_core_item_id, ':', 2);
  begin
    v_core := public.fibula_url_decode(
      substr(p_core_item_id, char_length('rcore:' || v_rarity || ':') + 1)
    )::jsonb;
  exception when others then
    raise exception 'Núcleo inválido.';
  end;

  if jsonb_typeof(v_core) <> 'object'
    or v_core->>'category' is distinct from 'accessory'
    or v_core->>'rarity' is distinct from v_rarity
    or coalesce(jsonb_typeof(v_core->'surp'), '') <> 'boolean'
    or coalesce(jsonb_typeof(v_core->'attributes'), '') <> 'array'
    or coalesce(jsonb_typeof(v_core->'equipmentType'), '') <> 'string'
    or jsonb_exists(v_core, 'weaponModel')
    or jsonb_exists(v_core, 'affinity') then
    raise exception 'Núcleo inválido.';
  end if;

  v_etype := v_core->>'equipmentType';
  if v_etype not in ('colar', 'pulseira', 'cinto') then
    raise exception 'Núcleo inválido.';
  end if;

  v_attrs := v_core->'attributes';
  v_n := jsonb_array_length(v_attrs);
  v_surp := (v_core->>'surp')::boolean;
  if v_n <> (case when v_surp then 4 else 2 end) then
    raise exception 'Núcleo inválido.';
  end if;

  v_ref := case v_rarity
    when 'normal' then 0.2
    when 'common' then 0.4
    when 'uncommon' then 0.6
    when 'rare' then 0.8
    else 1
  end;

  for v_i in 0..v_n - 1 loop
    v_attr := v_attrs->v_i;
    if jsonb_typeof(v_attr) <> 'object'
      or jsonb_typeof(v_attr->'key') <> 'string'
      or jsonb_typeof(v_attr->'value') <> 'number'
      or (v_attr->>'key') not in (
        'forca', 'inteligencia', 'destreza', 'vida',
        'armadura', 'velocidadeMovimento', 'esquiva'
      )
      or (v_attr->>'key') = any(v_seen)
      or (v_attr->>'value')::numeric < v_ref * 0.5 - 0.005
      or (v_attr->>'value')::numeric > v_ref + 0.005 then
      raise exception 'Núcleo inválido.';
    end if;

    v_seen := v_seen || (v_attr->>'key');
    if (v_attr->>'value')::numeric < v_ref - 0.000001 then
      v_all_max := false;
    end if;
  end loop;

  if v_surp and not v_all_max then
    raise exception 'Núcleo inválido.';
  end if;

  for v_i in 0..v_n - 1 loop
    v_attr := v_attrs->v_i;
    v_akey := case v_attr->>'key'
      when 'velocidadeMovimento' then 'mobilidade'
      else v_attr->>'key'
    end;
    v_base := case v_akey
      when 'forca' then 10
      when 'inteligencia' then 10
      when 'destreza' then 10
      when 'vida' then 12
      when 'armadura' then 0.8
      when 'mobilidade' then 2
      else 0.008
    end;
    v_roll := case
      when v_surp then 1
      else least(1, greatest(0.5, (v_attr->>'value')::numeric / v_ref))
    end;
    v_val := round(v_base * v_ref * v_roll, 6);
    v_out := v_out || jsonb_build_array(jsonb_build_object('key', v_akey, 'value', v_val));
  end loop;

  v_step := case v_rarity
    when 'normal' then 0
    when 'common' then 1
    when 'uncommon' then 2
    when 'rare' then 3
    else 4
  end;
  v_qty_base := 3 + v_step;
  v_qty_lining := 8 + v_step;
  v_suffix := case when v_rarity = 'normal' then '' else ':' || v_rarity end;
  v_base_item := 'bronze' || v_suffix;
  v_lining_item := (case p_lining when 'linho' then 'linen' else 'refined_leather' end) || v_suffix;
  v_needs := jsonb_build_array(
    jsonb_build_object('item', p_core_item_id, 'qty', 1),
    jsonb_build_object('item', v_base_item, 'qty', v_qty_base),
    jsonb_build_object('item', v_lining_item, 'qty', v_qty_lining)
  );

  select inventory into v_inv
    from public.fibula_house_storage
   where user_id = v_uid
   for update;
  if v_inv is null then
    raise exception 'Baú não encontrado.';
  end if;

  for v_need in
    select * from jsonb_to_recordset(v_needs) as x(item text, qty int)
  loop
    select coalesce(sum((e->>'quantity')::int), 0)
      into v_have
      from jsonb_array_elements(v_inv) e
     where e->>'itemId' = v_need.item;
    if v_have < v_need.qty then
      raise exception 'Material insuficiente ou de raridade diferente: %.', v_need.item;
    end if;

    v_left := v_need.qty;
    v_new := '[]'::jsonb;
    for v_el in select * from jsonb_array_elements(v_inv) loop
      if v_el->>'itemId' = v_need.item and v_left > 0 then
        v_q := (v_el->>'quantity')::int;
        v_take := least(v_q, v_left);
        v_left := v_left - v_take;
        if v_q - v_take > 0 then
          v_new := v_new || jsonb_build_array(
            jsonb_set(v_el, '{quantity}', to_jsonb(v_q - v_take))
          );
        end if;
      else
        v_new := v_new || jsonb_build_array(v_el);
      end if;
    end loop;
    v_inv := v_new;
  end loop;

  update public.fibula_house_storage
     set inventory = v_inv
   where user_id = v_uid;

  insert into public.fibula_accessories (
    user_id, type, rarity, metal, stars, surp, attributes, lining, crafted_by
  )
  values (
    v_uid,
    v_etype,
    v_rarity,
    'bronze',
    1,
    v_surp,
    v_out,
    p_lining,
    (select p.display_name from public.fibula_profiles p where p.user_id = v_uid)
  )
  returning * into v_acc;

  return jsonb_build_object('accessory', to_jsonb(v_acc), 'inventory', v_inv);
end;
$function$;

create or replace function public.fibula_delete_accessory(p_accessory_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if p_accessory_id is null then
    return false;
  end if;

  delete from public.fibula_accessories
   where id = p_accessory_id
     and user_id = v_user_id;

  return found;
end;
$function$;

revoke all on function public.fibula_craft_accessory(text, text) from public, anon;
grant execute on function public.fibula_craft_accessory(text, text) to authenticated;

revoke all on function public.fibula_delete_accessory(uuid) from public, anon;
grant execute on function public.fibula_delete_accessory(uuid) to authenticated;
