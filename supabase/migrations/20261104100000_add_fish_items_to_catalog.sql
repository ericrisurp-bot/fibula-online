-- Add the five distinct fish items to the canonical Fíbula inventory catalog.
-- Artwork is resolved by the client from each stable item_id; Supabase stores no image paths.
insert into public.fibula_item_catalog
  (item_id, display_name, rarity, item_type, stackable, metadata)
values
  ('fish_tilapia', 'Tilápia', 'normal', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_tambaqui', 'Tambaqui', 'comum', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_pintado_surubim', 'Pintado / Surubim', 'incomum', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_lambari', 'Lambari', 'raro', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_tucunare', 'Tucunaré', 'lendario', 'resource', true,
    '{"category":"fish"}'::jsonb)
on conflict (item_id) do update
set display_name = excluded.display_name,
    rarity = excluded.rarity,
    item_type = excluded.item_type,
    stackable = excluded.stackable,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = now();
