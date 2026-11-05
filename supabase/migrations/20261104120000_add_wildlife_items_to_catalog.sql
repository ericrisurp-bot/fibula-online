-- Register wildlife loot variants used by the local engine and canonical Duo inventory.
-- Review-only: this migration is not applied by this PR.
insert into public.fibula_item_catalog
  (item_id, display_name, rarity, item_type, stackable, metadata)
values
  ('wolf_meat', 'Carne de lobo', 'normal', 'resource', true, '{"category":"wildlife","kind":"wolf_meat"}'::jsonb),
  ('wolf_meat:common', 'Carne de lobo · Comum', 'comum', 'resource', true, '{"category":"wildlife","kind":"wolf_meat"}'::jsonb),
  ('wolf_meat:uncommon', 'Carne de lobo · Incomum', 'incomum', 'resource', true, '{"category":"wildlife","kind":"wolf_meat"}'::jsonb),
  ('wolf_meat:rare', 'Carne de lobo · Raro', 'raro', 'resource', true, '{"category":"wildlife","kind":"wolf_meat"}'::jsonb),
  ('wolf_meat:legendary', 'Carne de lobo · Lendário', 'lendario', 'resource', true, '{"category":"wildlife","kind":"wolf_meat"}'::jsonb),
  ('wolf_hide', 'Couro de lobo', 'normal', 'resource', true, '{"category":"wildlife","kind":"wolf_hide"}'::jsonb),
  ('wolf_hide:common', 'Couro de lobo · Comum', 'comum', 'resource', true, '{"category":"wildlife","kind":"wolf_hide"}'::jsonb),
  ('wolf_hide:uncommon', 'Couro de lobo · Incomum', 'incomum', 'resource', true, '{"category":"wildlife","kind":"wolf_hide"}'::jsonb),
  ('wolf_hide:rare', 'Couro de lobo · Raro', 'raro', 'resource', true, '{"category":"wildlife","kind":"wolf_hide"}'::jsonb),
  ('wolf_hide:legendary', 'Couro de lobo · Lendário', 'lendario', 'resource', true, '{"category":"wildlife","kind":"wolf_hide"}'::jsonb),
  ('chicken_meat', 'Frango', 'normal', 'resource', true, '{"category":"wildlife","kind":"chicken_meat"}'::jsonb),
  ('chicken_meat:common', 'Frango · Comum', 'comum', 'resource', true, '{"category":"wildlife","kind":"chicken_meat"}'::jsonb),
  ('chicken_meat:uncommon', 'Frango · Incomum', 'incomum', 'resource', true, '{"category":"wildlife","kind":"chicken_meat"}'::jsonb),
  ('chicken_meat:rare', 'Frango · Raro', 'raro', 'resource', true, '{"category":"wildlife","kind":"chicken_meat"}'::jsonb),
  ('chicken_meat:legendary', 'Frango · Lendário', 'lendario', 'resource', true, '{"category":"wildlife","kind":"chicken_meat"}'::jsonb),
  ('feather', 'Pena', 'normal', 'resource', true, '{"category":"wildlife","kind":"feather"}'::jsonb),
  ('feather:common', 'Pena · Comum', 'comum', 'resource', true, '{"category":"wildlife","kind":"feather"}'::jsonb),
  ('feather:uncommon', 'Pena · Incomum', 'incomum', 'resource', true, '{"category":"wildlife","kind":"feather"}'::jsonb),
  ('feather:rare', 'Pena · Raro', 'raro', 'resource', true, '{"category":"wildlife","kind":"feather"}'::jsonb),
  ('feather:legendary', 'Pena · Lendário', 'lendario', 'resource', true, '{"category":"wildlife","kind":"feather"}'::jsonb)
on conflict (item_id) do update
set display_name = excluded.display_name,
    rarity = excluded.rarity,
    item_type = excluded.item_type,
    stackable = excluded.stackable,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = now();
