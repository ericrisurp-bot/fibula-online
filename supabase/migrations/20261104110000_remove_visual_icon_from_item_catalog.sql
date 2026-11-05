-- Keep the canonical catalog independent from client-side artwork.
-- Stable item IDs are resolved to GitHub-managed assets by the game client.

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

alter table public.fibula_item_catalog
  drop column if exists icon;
