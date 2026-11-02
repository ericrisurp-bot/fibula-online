-- Enforce the Free-plan limit of four concurrent Duo matches.
-- This migration is additive and safe to re-run after 20261102000500.

create table if not exists public.fibula_duo_settings (
  id boolean primary key default true check (id),
  max_active_matches integer not null default 5
    check (max_active_matches between 0 and 50),
  updated_at timestamptz not null default pg_catalog.now()
);

-- Four is the approved operational limit. The column default remains 5 for
-- compatibility with the requested schema; this singleton row is authoritative.
insert into public.fibula_duo_settings (id, max_active_matches)
values (true, 4)
on conflict (id) do nothing;

alter table public.fibula_duo_settings enable row level security;

revoke all privileges on table public.fibula_duo_settings from anon, authenticated;
grant select on table public.fibula_duo_settings to authenticated;

drop policy if exists "Authenticated users can read Duo settings"
  on public.fibula_duo_settings;
create policy "Authenticated users can read Duo settings"
  on public.fibula_duo_settings for select to authenticated
  using (id = true);

drop policy if exists "Restrict Duo settings to Arena identities"
  on public.fibula_duo_settings;
create policy "Restrict Duo settings to Arena identities"
  on public.fibula_duo_settings as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1')
  with check ((select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1');

-- To raise or lower the cap later, a database administrator can manually run:
-- update public.fibula_duo_settings
--    set max_active_matches = 6, updated_at = pg_catalog.now()
--  where id = true;

create or replace function public.fibula_duo_capacity()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_max integer;
  v_in_use integer;
begin
  perform public.fibula_duo_expire_stale();

  select s.max_active_matches
    into v_max
    from public.fibula_duo_settings s
   where s.id = true;

  select count(*)::integer
    into v_in_use
    from public.fibula_duo_rooms r
   where r.phase in ('starting', 'playing');

  return pg_catalog.jsonb_build_object(
    'max', v_max,
    'in_use', v_in_use,
    'free', pg_catalog.greatest(v_max - v_in_use, 0)
  );
end;
$function$;

revoke all on function public.fibula_duo_capacity() from public, anon;
grant execute on function public.fibula_duo_capacity() to authenticated;

-- Preserve the current 00500 start behavior and add an atomic capacity check.
create or replace function public.fibula_start_duo_match(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_host_id uuid;
  v_phase text;
  v_guest_ready boolean;
  v_participant_count integer;
  v_match_id uuid := pg_catalog.gen_random_uuid();
  v_match_seed bigint := pg_catalog.floor(pg_catalog.random() * 4294967295)::bigint + 1;
  v_max integer;
  v_in_use integer;
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select r.host_id, r.phase into v_host_id, v_phase
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;
  if not found or v_phase <> 'lobby' then
    raise exception 'A sala não está disponível para iniciar.';
  end if;
  if v_host_id <> v_user_id then
    raise exception 'Somente o anfitrião pode iniciar a partida.';
  end if;

  select count(*), coalesce(bool_or(p.role = 'guest' and p.ready), false)
    into v_participant_count, v_guest_ready
    from public.fibula_duo_room_participants p
   where p.room_id = p_room_id and p.left_at is null;

  if v_participant_count <> 2 then
    raise exception 'A sala precisa ter exatamente dois participantes ativos.';
  end if;
  if not v_guest_ready then
    raise exception 'O convidado precisa estar pronto para iniciar.';
  end if;

  -- Serialize starts so concurrent transactions cannot overbook the cap.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('fibula_duo_start'));
  perform public.fibula_duo_expire_stale();

  select s.max_active_matches
    into v_max
    from public.fibula_duo_settings s
   where s.id = true;

  select count(*)::integer
    into v_in_use
    from public.fibula_duo_rooms r
   where r.phase in ('starting', 'playing');

  if v_in_use >= v_max then
    raise exception 'Todas as % salas Duo estão ocupadas. Tente novamente em alguns minutos.', v_max;
  end if;

  update public.fibula_duo_rooms
     set phase = 'playing',
         match_id = v_match_id,
         match_seed = v_match_seed,
         started_at = pg_catalog.now(),
         updated_at = pg_catalog.now()
   where id = p_room_id;

  return v_match_id;
end;
$function$;

revoke all on function public.fibula_start_duo_match(uuid) from public, anon;
grant execute on function public.fibula_start_duo_match(uuid) to authenticated;
