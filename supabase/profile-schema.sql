-- Esquema independente de perfil do Fíbula Online.
-- Executar somente no projeto Supabase do Fíbula (jkbplwnklzhayzghizwh).
-- A identidade vem do sub UUID do OAuth da Arena; nenhum dado de perfil da Arena é copiado.

create table if not exists public.fibula_profiles (
  user_id uuid primary key,
  display_name text,
  age smallint,
  sex text check (sex in ('masculino', 'feminino', 'outro')),
  main_character text check (main_character in ('guerreiro', 'mago', 'arqueiro', 'druida')),
  level integer not null default 0 check (level >= 0),
  kills integer not null default 0 check (kills >= 0),
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fibula_profiles_display_name_length
    check (display_name is null or char_length(display_name) between 3 and 20),
  constraint fibula_profiles_age_range
    check (age is null or age between 1 and 120)
);

create unique index if not exists fibula_profiles_display_name_lower_uidx
  on public.fibula_profiles (lower(display_name))
  where display_name is not null;

alter table public.fibula_profiles enable row level security;

revoke all on public.fibula_profiles from anon;
revoke insert, update, delete, truncate, references, trigger on public.fibula_profiles from authenticated;
grant select on public.fibula_profiles to authenticated;
grant insert (user_id, main_character, level, kills, attributes) on public.fibula_profiles to authenticated;
grant update (display_name, age, sex, main_character, level, kills, attributes, updated_at)
  on public.fibula_profiles to authenticated;

drop policy if exists "Authenticated players can read profiles" on public.fibula_profiles;
create policy "Authenticated players can read profiles"
  on public.fibula_profiles for select to authenticated
  using (true);

drop policy if exists "Players can create their own profile" on public.fibula_profiles;
create policy "Players can create their own profile"
  on public.fibula_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Players can update their own profile" on public.fibula_profiles;
create policy "Players can update their own profile"
  on public.fibula_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Estrutura reservada para conquistas futuras; nesta etapa não há escrita pelo cliente.
create table if not exists public.fibula_profile_badges (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  badge_code text not null,
  earned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, badge_code)
);

alter table public.fibula_profile_badges enable row level security;
revoke all on public.fibula_profile_badges from anon;
grant select on public.fibula_profile_badges to authenticated;

drop policy if exists "Authenticated players can read profile badges" on public.fibula_profile_badges;
create policy "Authenticated players can read profile badges"
  on public.fibula_profile_badges for select to authenticated
  using (true);
