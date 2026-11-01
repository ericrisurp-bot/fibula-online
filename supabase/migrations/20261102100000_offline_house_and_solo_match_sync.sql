-- Persistência pontual do modo solo: casa e resumo final da partida.
-- Nenhum estado de simulação ou movimento é enviado ao servidor.

create table if not exists public.fibula_house_storage (
  user_id uuid primary key references public.fibula_profiles(user_id) on delete cascade,
  inventory jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint fibula_house_storage_inventory_array
    check (jsonb_typeof(inventory) = 'array' and jsonb_array_length(inventory) <= 50)
);

alter table public.fibula_house_storage enable row level security;
revoke all privileges on table public.fibula_house_storage from anon, authenticated;
grant select, insert, update on table public.fibula_house_storage to authenticated;

drop policy if exists "Players can read their own house storage" on public.fibula_house_storage;
create policy "Players can read their own house storage"
  on public.fibula_house_storage for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

drop policy if exists "Players can insert their own house storage" on public.fibula_house_storage;
create policy "Players can insert their own house storage"
  on public.fibula_house_storage for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

drop policy if exists "Players can update their own house storage" on public.fibula_house_storage;
create policy "Players can update their own house storage"
  on public.fibula_house_storage for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

create table if not exists public.fibula_solo_match_results (
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  match_id uuid not null,
  kills integer not null check (kills between 0 and 1000000),
  survival_nights integer not null check (survival_nights between 0 and 10000),
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

alter table public.fibula_solo_match_results enable row level security;
revoke all privileges on table public.fibula_solo_match_results from anon, authenticated;

create or replace function public.fibula_sync_solo_match(
  p_match_id uuid,
  p_kills integer,
  p_survival_nights integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_inserted integer;
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if p_match_id is null
    or p_kills is null or p_kills < 0 or p_kills > 1000000
    or p_survival_nights is null or p_survival_nights < 0 or p_survival_nights > 10000 then
    raise exception 'Resumo de partida inválido.';
  end if;

  insert into public.fibula_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  insert into public.fibula_solo_match_results (user_id, match_id, kills, survival_nights)
  values (v_user_id, p_match_id, p_kills, p_survival_nights)
  on conflict (user_id, match_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return false;
  end if;

  update public.fibula_profiles
  set kills = kills + p_kills,
      highest_survival_level = greatest(highest_survival_level, p_survival_nights),
      updated_at = now()
  where user_id = v_user_id;

  return true;
end;
$function$;

revoke all on function public.fibula_sync_solo_match(uuid, integer, integer) from public, anon;
grant execute on function public.fibula_sync_solo_match(uuid, integer, integer) to authenticated;
