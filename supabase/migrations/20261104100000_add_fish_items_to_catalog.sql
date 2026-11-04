-- Add the five distinct fish items to the canonical Fíbula inventory catalog.
-- The icon paths point to individually authored assets shipped with the web app.
insert into public.fibula_item_catalog
  (item_id, display_name, icon, rarity, item_type, stackable, metadata)
values
  ('fish_tilapia', 'Tilápia', '/assets/items/fish-tilapia.svg', 'normal', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_tambaqui', 'Tambaqui', '/assets/items/fish-tambaqui.svg', 'comum', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_pintado_surubim', 'Pintado / Surubim', '/assets/items/fish-pintado-surubim.svg', 'incomum', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_lambari', 'Lambari', '/assets/items/fish-lambari.svg', 'raro', 'resource', true,
    '{"category":"fish"}'::jsonb),
  ('fish_tucunare', 'Tucunaré', '/assets/items/fish-tucunare.svg', 'lendario', 'resource', true,
    '{"category":"fish"}'::jsonb)
on conflict (item_id) do update
set display_name = excluded.display_name,
    icon = excluded.icon,
    rarity = excluded.rarity,
    item_type = excluded.item_type,
    stackable = excluded.stackable,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = now();
