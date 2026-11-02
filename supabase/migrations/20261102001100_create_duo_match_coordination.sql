-- Server-side coordination for two independent local Duo worlds.
-- Depends on the persistent rooms and match_seed introduced by 20261102000500.
-- This migration does not introduce a shared world, snapshots, movement, combat,
-- inventory sync, or a match heartbeat. Disconnection timeout is intentionally
-- deferred until a trustworthy server-side timeout source is selected.

create table if not exists public.fibula_duo_match_sessions (
  match_id uuid primary key,
  room_id uuid not null unique
    references public.fibula_duo_rooms(id) on delete cascade,
  ruleset_version text not null default 'duo-v1'
    check (ruleset_version = 'duo-v1'),
  status text not null default 'playing'
    check (status in ('playing', 'finished', 'aborted')),
  current_night integer not null default 1
    check (current_night >= 1),
  session_seed bigint not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  cooperative_nights integer not null default 0
    check (cooperative_nights >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.fibula_duo_match_players (
  match_id uuid not null
    references public.fibula_duo_match_sessions(match_id) on delete cascade,
  user_id uuid not null
    references public.fibula_profiles(user_id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  player_status text not null default 'alive'
    check (player_status in ('alive', 'dead')),
  player_seed bigint not null,
  ended_at timestamptz,
  primary key (match_id, user_id),
  unique (match_id, role)
);

create index if not exists fibula_duo_match_players_user_status_idx
  on public.fibula_duo_match_players (user_id, player_status, match_id);

create table if not exists public.fibula_duo_night_reports (
  match_id uuid not null,
  night_number integer not null check (night_number >= 1),
  user_id uuid not null,
  report_status text not null check (report_status in ('finished', 'dead')),
  reported_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (match_id, night_number, user_id),
  foreign key (match_id, user_id)
    references public.fibula_duo_match_players(match_id, user_id)
    on delete cascade
);

alter table public.fibula_duo_match_sessions enable row level security;
alter table public.fibula_duo_match_players enable row level security;
alter table public.fibula_duo_night_reports enable row level security;

revoke all privileges on table public.fibula_duo_match_sessions from anon, authenticated;
revoke all privileges on table public.fibula_duo_match_players from anon, authenticated;
revoke all privileges on table public.fibula_duo_night_reports from anon, authenticated;

-- Solo source mirrored from src/game/horde.ts:
-- firstNightSpawnCount = 5; addedPerNight = 5.
-- Duo total is rounded to nearest integer using the established integer rule.
create or replace function public.fibula_duo_player_horde_target(
  p_match_id uuid,
  p_user_id uuid,
  p_night_number integer
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_solo_target integer;
  v_duo_total integer;
  v_alive_count integer;
  v_role text;
begin
  if p_night_number is null or p_night_number < 1 then
    raise exception 'Noite inválida.';
  end if;

  v_solo_target := 5 + ((p_night_number - 1) * 5);
  v_duo_total := ((v_solo_target * 17) + 5) / 10;

  select count(*)::integer
    into v_alive_count
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id
     and p.player_status = 'alive';

  select p.role into v_role
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id
     and p.user_id = p_user_id
     and p.player_status = 'alive';

  if not found or v_alive_count = 0 then
    return 0;
  end if;

  if v_alive_count = 1 then
    return v_duo_total;
  end if;

  -- Stable split: host receives the remainder (ceil), guest the floor.
  if v_role = 'host' then
    return (v_duo_total + 1) / 2;
  end if;
  return v_duo_total / 2;
end;
$function$;

revoke all on function public.fibula_duo_player_horde_target(uuid, uuid, integer)
  from public, anon, authenticated;

-- Start (or idempotently resume) the caller's own initialization data.
-- The common session seed and the partner's seed are never returned.
create or replace function public.fibula_start_duo_session(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.fibula_duo_rooms%rowtype;
  v_session public.fibula_duo_match_sessions%rowtype;
  v_host_id uuid;
  v_guest_id uuid;
  v_alive_count integer;
  v_host_seed bigint;
  v_guest_seed bigint;
  v_session_seed bigint;
  v_own_seed bigint;
  v_own_role text;
  v_ruleset text := 'duo-v1';
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão Arena não autorizada.';
  end if;

  select r.* into v_room
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;

  if not found or v_room.phase <> 'playing'
    or v_room.match_id is null or v_room.match_seed is null then
    raise exception 'A sala Duo não possui uma partida ativa.';
  end if;

  if not exists (
    select 1
      from public.fibula_duo_room_participants p
     where p.room_id = p_room_id
       and p.user_id = v_user_id
       and p.left_at is null
  ) then
    raise exception 'Você não participa desta partida Duo.';
  end if;

  select s.* into v_session
    from public.fibula_duo_match_sessions s
   where s.match_id = v_room.match_id
   for update;

  if not found then
    select count(*) filter (where p.left_at is null)::integer
      into v_alive_count
      from public.fibula_duo_room_participants p
     where p.room_id = p_room_id;

    select p.user_id into v_host_id
      from public.fibula_duo_room_participants p
     where p.room_id = p_room_id
       and p.role = 'host' and p.left_at is null
     limit 1;

    select p.user_id into v_guest_id
      from public.fibula_duo_room_participants p
     where p.room_id = p_room_id
       and p.role = 'guest' and p.left_at is null
     limit 1;

    if v_alive_count <> 2
      or v_host_id is distinct from v_room.host_id
      or v_guest_id is distinct from v_room.guest_id
      or v_guest_id is null then
      raise exception 'A partida precisa manter os dois participantes originais ativos.';
    end if;

    insert into public.fibula_duo_match_sessions (
      match_id, room_id, ruleset_version, session_seed, started_at
    ) values (
      v_room.match_id, p_room_id, v_ruleset,
      (('x' || pg_catalog.substr(pg_catalog.md5(pg_catalog.gen_random_uuid()::text), 1, 16))::bit(64)::bigint),
      v_room.started_at
    );

    -- Derive from a private random session seed (not the room seed, which is
    -- visible to lobby clients). Return only the caller's individual seed.
    select s.session_seed into v_session_seed
      from public.fibula_duo_match_sessions s
     where s.match_id = v_room.match_id;

    v_host_seed := (
      ('x' || pg_catalog.substr(
        pg_catalog.md5(v_session_seed::text || ':' || v_host_id::text), 1, 7
      ))::bit(28)::bigint
    ) + 1;
    v_guest_seed := (
      ('x' || pg_catalog.substr(
        pg_catalog.md5(v_session_seed::text || ':' || v_guest_id::text), 1, 7
      ))::bit(28)::bigint
    ) + 1;
    if v_guest_seed = v_host_seed then
      v_guest_seed := (v_guest_seed % 268435456) + 1;
    end if;

    insert into public.fibula_duo_match_players
      (match_id, user_id, role, player_seed)
    values
      (v_room.match_id, v_host_id, 'host', v_host_seed),
      (v_room.match_id, v_guest_id, 'guest', v_guest_seed);

    select s.* into v_session
      from public.fibula_duo_match_sessions s
     where s.match_id = v_room.match_id;
  end if;

  select p.player_seed, p.role
    into v_own_seed, v_own_role
    from public.fibula_duo_match_players p
   where p.match_id = v_session.match_id
     and p.user_id = v_user_id;

  if not found then
    raise exception 'Você não participa desta partida Duo.';
  end if;
  if v_session.status <> 'playing' then
    raise exception 'Esta partida Duo já foi encerrada.';
  end if;

  return pg_catalog.jsonb_build_object(
    'match_id', v_session.match_id,
    'night_number', v_session.current_night,
    'player_seed', v_own_seed,
    'player_role', v_own_role,
    'ruleset_version', v_session.ruleset_version,
    'horde_target', public.fibula_duo_player_horde_target(
      v_session.match_id, v_user_id, v_session.current_night
    )
  );
end;
$function$;

-- Submit one idempotent end-of-night fact. The database serializes the
-- transition; it never accepts a client-supplied user id or horde target.
create or replace function public.fibula_duo_report_night(
  p_match_id uuid,
  p_night_number integer,
  p_report_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room_id uuid;
  v_session public.fibula_duo_match_sessions%rowtype;
  v_player public.fibula_duo_match_players%rowtype;
  v_existing_status text;
  v_has_existing boolean := false;
  v_alive_count integer;
  v_finished_count integer;
  v_both_alive boolean;
  v_released boolean := false;
  v_session_finished boolean := false;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão Arena não autorizada.';
  end if;
  if p_report_status is null or p_report_status not in ('finished', 'dead')
    or p_night_number is null or p_night_number < 1 then
    raise exception 'Relato de noite inválido.';
  end if;

  -- Match all writers on the same lock order: room, then session,
  -- then participant/report rows. This avoids a start/report deadlock.
  select s.room_id into v_room_id
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id;
  if not found then
    raise exception 'Partida Duo não encontrada.';
  end if;

  perform 1
    from public.fibula_duo_rooms r
   where r.id = v_room_id
   for update;

  select s.* into v_session
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id
   for update;

  if not found then
    raise exception 'Partida Duo não encontrada.';
  end if;

  select p.* into v_player
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id
     and p.user_id = v_user_id
   for update;

  if not found then
    raise exception 'Você não participa desta partida Duo.';
  end if;

  -- A retry of an already stored report is idempotent, including after
  -- the session has finished. A conflicting second result is rejected.
  select r.report_status into v_existing_status
    from public.fibula_duo_night_reports r
   where r.match_id = p_match_id
     and r.night_number = p_night_number
     and r.user_id = v_user_id;
  v_has_existing := found;

  if v_has_existing then
    if v_existing_status is distinct from p_report_status then
      raise exception 'Este relato já foi registrado com outro resultado.';
    end if;
    return pg_catalog.jsonb_build_object(
      'accepted', true, 'duplicate', true,
      'current_night', v_session.current_night,
      'night_released', p_night_number < v_session.current_night,
      'session_finished', v_session.status = 'finished'
    );
  end if;

  if p_night_number < v_session.current_night then
    raise exception 'Relato atrasado sem registro idempotente.';
  end if;

  if v_session.status <> 'playing'
    or p_night_number <> v_session.current_night
    or v_player.player_status <> 'alive' then
    raise exception 'Relato fora do ciclo atual ou participante já eliminado.';
  end if;

  insert into public.fibula_duo_night_reports
    (match_id, night_number, user_id, report_status)
  values
    (p_match_id, p_night_number, v_user_id, p_report_status)
  on conflict (match_id, night_number, user_id) do nothing;

  if not found then
    select r.report_status into v_existing_status
      from public.fibula_duo_night_reports r
     where r.match_id = p_match_id
       and r.night_number = p_night_number
       and r.user_id = v_user_id;
    if v_existing_status is distinct from p_report_status then
      raise exception 'Este relato já foi registrado com outro resultado.';
    end if;
    return pg_catalog.jsonb_build_object(
      'accepted', true, 'duplicate', true,
      'current_night', v_session.current_night,
      'night_released', false,
      'session_finished', false
    );
  end if;

  if p_report_status = 'dead' then
    update public.fibula_duo_match_players
       set player_status = 'dead', ended_at = pg_catalog.clock_timestamp()
     where match_id = p_match_id and user_id = v_user_id;
  end if;

  select count(*)::integer into v_alive_count
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id and p.player_status = 'alive';

  if v_alive_count = 0 then
    update public.fibula_duo_match_sessions
       set status = 'finished',
           finished_at = pg_catalog.clock_timestamp(),
           updated_at = pg_catalog.clock_timestamp()
     where match_id = p_match_id;
    update public.fibula_duo_rooms
       set phase = 'finished',
           finished_at = pg_catalog.clock_timestamp(),
           updated_at = pg_catalog.clock_timestamp()
     where id = v_session.room_id and phase = 'playing';
    update public.fibula_duo_room_participants
       set left_at = pg_catalog.clock_timestamp(), ready = false
     where room_id = v_session.room_id and left_at is null;
    v_session_finished := true;
  else
    select count(*)::integer into v_finished_count
      from public.fibula_duo_match_players p
      join public.fibula_duo_night_reports r
        on r.match_id = p.match_id
       and r.user_id = p.user_id
       and r.night_number = p_night_number
       and r.report_status = 'finished'
     where p.match_id = p_match_id
       and p.player_status = 'alive';

    if v_finished_count = v_alive_count then
      select count(*) = 2 into v_both_alive
        from public.fibula_duo_match_players p
       where p.match_id = p_match_id and p.player_status = 'alive';

      update public.fibula_duo_match_sessions
         set current_night = current_night + 1,
             cooperative_nights = cooperative_nights
               + case when v_both_alive then 1 else 0 end,
             updated_at = pg_catalog.clock_timestamp()
       where match_id = p_match_id;
      v_released := true;
    end if;
  end if;

  select s.* into v_session
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id;

  return pg_catalog.jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'current_night', v_session.current_night,
    'night_released', v_released,
    'session_finished', v_session.status = 'finished',
    'horde_target', case when v_session.status = 'playing'
      then public.fibula_duo_player_horde_target(
        p_match_id, v_user_id, v_session.current_night
      )
      else 0 end
  );
end;
$function$;

-- The caller can inspect only their own initialization and the public cycle
-- barrier; no peer seed, kills, inventory, map state, or private world data.
create or replace function public.fibula_duo_get_session_state(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.fibula_duo_match_sessions%rowtype;
  v_player public.fibula_duo_match_players%rowtype;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão Arena não autorizada.';
  end if;

  select s.* into v_session
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id;
  if not found then
    raise exception 'Partida Duo não encontrada.';
  end if;

  select p.* into v_player
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id and p.user_id = v_user_id;
  if not found then
    raise exception 'Você não participa desta partida Duo.';
  end if;

  return pg_catalog.jsonb_build_object(
    'match_id', v_session.match_id,
    'status', v_session.status,
    'current_night', v_session.current_night,
    'cooperative_nights', v_session.cooperative_nights,
    'player_status', v_player.player_status,
    'player_seed', v_player.player_seed,
    'player_role', v_player.role,
    'horde_target', case when v_session.status = 'playing'
      and v_player.player_status = 'alive'
      then public.fibula_duo_player_horde_target(
        p_match_id, v_user_id, v_session.current_night
      )
      else 0 end
  );
end;
$function$;

revoke all on function public.fibula_start_duo_session(uuid) from public, anon;
revoke all on function public.fibula_duo_report_night(uuid, integer, text) from public, anon;
revoke all on function public.fibula_duo_get_session_state(uuid) from public, anon;

grant execute on function public.fibula_start_duo_session(uuid) to authenticated;
grant execute on function public.fibula_duo_report_night(uuid, integer, text) to authenticated;
grant execute on function public.fibula_duo_get_session_state(uuid) to authenticated;
