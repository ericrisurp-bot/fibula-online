-- Keep the room lifecycle and coordinated Duo session in sync.
-- A player leaving an active match is disconnected individually; the survivor
-- keeps the same independent local world and receives the full Duo horde.

create or replace function public.fibula_leave_duo_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.fibula_duo_rooms%rowtype;
  v_session public.fibula_duo_match_sessions%rowtype;
  v_has_session boolean := false;
  v_role text;
  v_player_status text;
  v_alive_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  -- Keep the shared lock order used by match heartbeat/report: room, session,
  -- then match player. This makes disconnect and night reports serialize.
  select r.* into v_room
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;
  if not found then
    raise exception 'Sala Duo não encontrada.';
  end if;

  select s.* into v_session
    from public.fibula_duo_match_sessions s
   where s.room_id = p_room_id
   for update;
  v_has_session := found;

  select p.role into v_role
    from public.fibula_duo_room_participants p
   where p.room_id = p_room_id
     and p.user_id = v_user_id
     and p.left_at is null
   for update;
  if not found then
    raise exception 'Você não participa desta sala.';
  end if;

  if v_has_session and v_session.status = 'playing' then
    select p.player_status into v_player_status
      from public.fibula_duo_match_players p
     where p.match_id = v_session.match_id
       and p.user_id = v_user_id
     for update;
    if not found then
      raise exception 'Você não participa desta partida Duo.';
    end if;

    if v_player_status = 'alive' then
      update public.fibula_duo_match_players
         set player_status = 'disconnected',
             ended_at = v_now
       where match_id = v_session.match_id
         and user_id = v_user_id
         and player_status = 'alive';
    end if;

    update public.fibula_duo_room_participants
       set left_at = v_now, ready = false
     where room_id = p_room_id
       and user_id = v_user_id
       and left_at is null;

    select count(*)::integer into v_alive_count
      from public.fibula_duo_match_players p
     where p.match_id = v_session.match_id
       and p.player_status = 'alive';

    if v_alive_count = 0 then
      -- Only finish the shared session when nobody remains alive.
      update public.fibula_duo_match_sessions
         set status = 'finished',
             finished_at = v_now,
             updated_at = v_now
       where match_id = v_session.match_id
         and status = 'playing';

      update public.fibula_duo_rooms
         set phase = 'finished',
             finished_at = v_now,
             updated_at = v_now
       where id = p_room_id;

      update public.fibula_duo_room_participants
         set left_at = coalesce(left_at, v_now), ready = false
       where room_id = p_room_id;
    end if;

    -- With one or more survivors, leave room.phase and session.status playing.
    return true;
  end if;

  if v_has_session then
    -- A terminal coordinated session must never be changed back to cancelled.
    update public.fibula_duo_rooms
       set phase = 'finished',
           finished_at = coalesce(finished_at, v_now),
           updated_at = v_now
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set left_at = coalesce(left_at, v_now), ready = false
     where room_id = p_room_id;
  elsif v_room.phase in ('starting', 'playing') then
    -- Legacy startup window: the coordinated session has not been created yet.
    update public.fibula_duo_rooms
       set phase = 'finished', finished_at = v_now, updated_at = v_now
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set left_at = v_now, ready = false
     where room_id = p_room_id and left_at is null;
  elsif v_role = 'host' then
    update public.fibula_duo_rooms
       set phase = 'cancelled', finished_at = v_now, updated_at = v_now
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set left_at = v_now, ready = false
     where room_id = p_room_id and left_at is null;
  else
    update public.fibula_duo_room_participants
       set left_at = v_now, ready = false
     where room_id = p_room_id and user_id = v_user_id;
    update public.fibula_duo_rooms
       set guest_id = null, updated_at = v_now
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set ready = false
     where room_id = p_room_id
       and user_id = v_room.host_id
       and left_at is null;
  end if;

  return true;
end;
$function$;

-- Reject new night reports after either side of the coordinated lifecycle
-- has closed. Exact duplicate retries remain idempotent after completion.
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
  v_room_phase text;
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

  select s.room_id into v_room_id
    from public.fibula_duo_match_sessions s
   where s.match_id = p_match_id;
  if not found then
    raise exception 'Partida Duo não encontrada.';
  end if;

  -- Lock order: room, session, participant/report rows.
  select r.phase into v_room_phase
    from public.fibula_duo_rooms r
   where r.id = v_room_id
   for update;
  if not found then
    raise exception 'Sala Duo não encontrada.';
  end if;

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
  -- the session or room has finished. A conflicting second result is rejected.
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
    or v_room_phase <> 'playing'
    or p_night_number <> v_session.current_night
    or v_player.player_status <> 'alive' then
    raise exception 'Relato fora de uma partida ativa ou participante já eliminado.';
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
