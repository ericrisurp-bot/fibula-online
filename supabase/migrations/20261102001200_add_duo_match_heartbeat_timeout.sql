-- Server-authoritative Duo heartbeat and 15-second disconnect handling.
-- The live player sends one authenticated heartbeat every five seconds.
-- A heartbeat detects a stale peer using the database clock; no client clock
-- or background scheduler is trusted for the timeout decision.

alter table public.fibula_duo_match_players
  drop constraint if exists fibula_duo_match_players_player_status_check;

alter table public.fibula_duo_match_players
  add constraint fibula_duo_match_players_player_status_check
  check (player_status in ('alive', 'dead', 'disconnected'));

alter table public.fibula_duo_match_players
  add column if not exists last_seen_at timestamptz not null default pg_catalog.clock_timestamp();

-- A match session is created before both clients necessarily finish loading.
-- Distinguish a player who has never sent a heartbeat from one who went stale.
alter table public.fibula_duo_match_players
  add column if not exists heartbeat_started_at timestamptz;

-- Existing live sessions receive a fresh startup baseline when this migration
-- is applied, avoiding an immediate timeout caused by their old last_seen_at.
update public.fibula_duo_match_players
   set heartbeat_started_at = pg_catalog.clock_timestamp()
 where player_status = 'alive'
   and heartbeat_started_at is null;

create index if not exists fibula_duo_match_players_heartbeat_idx
  on public.fibula_duo_match_players (match_id, last_seen_at)
  where player_status = 'alive';

-- Refreshing a heartbeat also evaluates the partner's timeout. The 15-second
-- comparison is performed exclusively with clock_timestamp() in PostgreSQL.
create or replace function public.fibula_duo_match_heartbeat(p_match_id uuid)
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
  v_alive_count integer;
  v_finished_count integer;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão Arena não autorizada.';
  end if;

  select s.room_id into v_room_id
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id;
  if not found then raise exception 'Partida Duo não encontrada.'; end if;

  perform 1 from public.fibula_duo_rooms r where r.id = v_room_id for update;

  select s.* into v_session
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id
   for update;
  if not found or v_session.status <> 'playing' then
    raise exception 'A partida Duo não está ativa.';
  end if;

  select p.* into v_player
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id and p.user_id = v_user_id
   for update;
  if not found then raise exception 'Você não participa desta partida Duo.'; end if;

  if v_player.player_status = 'alive' then
    update public.fibula_duo_match_players
       set last_seen_at = pg_catalog.clock_timestamp(),
           heartbeat_started_at = coalesce(heartbeat_started_at, pg_catalog.clock_timestamp())
     where match_id = p_match_id and user_id = v_user_id;

    update public.fibula_duo_match_players
       set player_status = 'disconnected',
           ended_at = pg_catalog.clock_timestamp()
     where match_id = p_match_id
       and user_id <> v_user_id
       and player_status = 'alive'
       and (
         (heartbeat_started_at is not null
           and last_seen_at < pg_catalog.clock_timestamp() - interval '15 seconds')
         or (heartbeat_started_at is null
           and v_session.created_at < pg_catalog.clock_timestamp() - interval '30 seconds')
       );
  end if;

  select p.* into v_player
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id and p.user_id = v_user_id;

  select count(*)::integer into v_alive_count
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id and p.player_status = 'alive';

  -- If the survivor had already completed this night before the peer timed
  -- out, release it now. Otherwise their ordinary night report releases it.
  if v_alive_count = 1 and v_player.player_status = 'alive'
    and exists (
      select 1 from public.fibula_duo_night_reports r
       where r.match_id = p_match_id
         and r.night_number = v_session.current_night
         and r.user_id = v_user_id
         and r.report_status = 'finished'
    ) then
    update public.fibula_duo_match_sessions
       set current_night = current_night + 1,
           updated_at = pg_catalog.clock_timestamp()
     where match_id = p_match_id;
  end if;

  select s.* into v_session
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id;

  return pg_catalog.jsonb_build_object(
    'match_id', v_session.match_id,
    'status', v_session.status,
    'current_night', v_session.current_night,
    'cooperative_nights', v_session.cooperative_nights,
    'player_status', v_player.player_status,
    'horde_target', case when v_player.player_status = 'alive'
      then public.fibula_duo_player_horde_target(
        p_match_id, v_user_id, v_session.current_night
      ) else 0 end
  );
end;
$function$;

revoke all on function public.fibula_duo_match_heartbeat(uuid) from public, anon;
grant execute on function public.fibula_duo_match_heartbeat(uuid) to authenticated;

-- A player who timed out cannot revive the old match by reopening the lobby.
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
  if not found then raise exception 'Partida Duo não encontrada.'; end if;

  select p.* into v_player
    from public.fibula_duo_match_players p
   where p.match_id = p_match_id and p.user_id = v_user_id;
  if not found then raise exception 'Você não participa desta partida Duo.'; end if;

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
      ) else 0 end
  );
end;
$function$;

revoke all on function public.fibula_duo_get_session_state(uuid) from public, anon;
grant execute on function public.fibula_duo_get_session_state(uuid) to authenticated;
