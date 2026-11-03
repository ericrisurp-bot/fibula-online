-- Keep the legacy room/lobby expiry from overriding the match-level heartbeat.
-- Depends on fibula_duo_match_sessions and fibula_duo_match_players (migrations 011/012).
-- Active coordinated matches are timed out only by fibula_duo_match_heartbeat,
-- which marks the stale player disconnected and lets the survivor continue.

create or replace function public.fibula_duo_expire_stale()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_duo_lobby_heartbeat_timeout constant interval := interval '45 seconds';
  v_duo_empty_invite_timeout constant interval := interval '120 seconds';
  v_duo_match_heartbeat_timeout constant interval := interval '90 seconds';
  v_now timestamptz := pg_catalog.now();
begin
  if (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  -- Before a coordinated session exists, retain the legacy startup cleanup.
  -- Once it exists, the match heartbeat is the sole authority for disconnects.
  update public.fibula_duo_rooms r
     set phase = 'finished',
         finished_at = v_now,
         updated_at = v_now
   where r.phase in ('starting', 'playing')
     and not exists (
       select 1
         from public.fibula_duo_match_sessions s
        where s.room_id = r.id
          and s.status = 'playing'
     )
     and exists (
       select 1
         from public.fibula_duo_room_participants p
        where p.room_id = r.id
          and p.left_at is null
          and p.last_seen_at < v_now - v_duo_match_heartbeat_timeout
     );

  update public.fibula_duo_room_participants p
     set left_at = v_now,
         ready = false
   where p.left_at is null
     and exists (
       select 1
         from public.fibula_duo_rooms r
        where r.id = p.room_id
          and r.phase = 'finished'
          and r.finished_at = v_now
     );

  -- A lobby is cancelled when its host has gone stale.
  update public.fibula_duo_rooms r
     set phase = 'cancelled',
         finished_at = v_now,
         updated_at = v_now
   where r.phase = 'lobby'
     and exists (
       select 1
         from public.fibula_duo_room_participants p
        where p.room_id = r.id
          and p.user_id = r.host_id
          and p.role = 'host'
          and p.left_at is null
          and p.last_seen_at < v_now - v_duo_lobby_heartbeat_timeout
     );

  -- Invites that never received a guest are also bounded by creation time.
  update public.fibula_duo_rooms r
     set phase = 'cancelled',
         finished_at = v_now,
         updated_at = v_now
   where r.phase = 'lobby'
     and r.guest_id is null
     and r.created_at < v_now - v_duo_empty_invite_timeout;

  -- Close participants in lobbies cancelled by either rule above.
  update public.fibula_duo_room_participants p
     set left_at = v_now,
         ready = false
   where p.left_at is null
     and exists (
       select 1
         from public.fibula_duo_rooms r
        where r.id = p.room_id
          and r.phase = 'cancelled'
          and r.finished_at = v_now
     );

  -- A stale guest leaves the lobby; the host can invite someone else.
  update public.fibula_duo_room_participants p
     set left_at = v_now,
         ready = false
   where p.left_at is null
     and p.role = 'guest'
     and p.last_seen_at < v_now - v_duo_lobby_heartbeat_timeout
     and exists (
       select 1
         from public.fibula_duo_rooms r
        where r.id = p.room_id
          and r.phase = 'lobby'
          and r.guest_id = p.user_id
     );

  update public.fibula_duo_room_participants host
     set ready = false
   where host.left_at is null
     and host.role = 'host'
     and exists (
       select 1
         from public.fibula_duo_rooms r
         join public.fibula_duo_room_participants guest
           on guest.room_id = r.id
          and guest.user_id = r.guest_id
          and guest.role = 'guest'
          and guest.left_at = v_now
        where r.id = host.room_id
          and r.phase = 'lobby'
     );

  update public.fibula_duo_rooms r
     set guest_id = null,
         updated_at = v_now
   where r.phase = 'lobby'
     and r.guest_id is not null
     and not exists (
       select 1
         from public.fibula_duo_room_participants p
        where p.room_id = r.id
          and p.user_id = r.guest_id
          and p.role = 'guest'
          and p.left_at is null
     );
end;
$function$;
