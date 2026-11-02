-- Harden persistent Duo rooms with heartbeats, expiry, invite reads and room Broadcast authorization.
-- Named timeout constants (seconds): DUO_LOBBY_HEARTBEAT_TIMEOUT = 45,
-- DUO_EMPTY_INVITE_TIMEOUT = 120, DUO_MATCH_HEARTBEAT_TIMEOUT = 90.
-- Their interval variables below are the only values used by expiry checks.
-- This migration extends the objects created by 20261102000400; it does not
-- modify that migration and is safe to re-run after the base migration.

alter table public.fibula_duo_room_participants
  add column if not exists last_seen_at timestamptz not null default pg_catalog.now();

alter table public.fibula_duo_rooms
  add column if not exists match_seed bigint;

-- Backfill deterministic seeds for matches created before this migration.
update public.fibula_duo_rooms
   set match_seed = (('x' || pg_catalog.substr(pg_catalog.md5(match_id::text), 1, 16))::bit(64)::bigint)
 where phase in ('starting', 'playing', 'finished')
   and match_id is not null
   and match_seed is null;

alter table public.fibula_duo_rooms
  drop constraint if exists fibula_duo_rooms_match_phase;

alter table public.fibula_duo_rooms
  add constraint fibula_duo_rooms_match_phase
  check (
    (
      phase in ('starting', 'playing', 'finished')
      and match_id is not null
      and match_seed is not null
      and started_at is not null
    )
    or (
      phase in ('lobby', 'cancelled')
      and match_id is null
    )
  );

-- Internal maintenance routine. It is deliberately not executable by clients.
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

  -- A running match is finished if either active participant stops heartbeating.
  update public.fibula_duo_rooms r
     set phase = 'finished',
         finished_at = v_now,
         updated_at = v_now
   where r.phase in ('starting', 'playing')
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
     and p.last_seen_at < v_now - v_lobby_heartbeat_timeout
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

revoke all on function public.fibula_duo_expire_stale() from public, anon, authenticated;

-- The original five RPC signatures and return types are preserved.
create or replace function public.fibula_create_duo_room(p_friend_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room_id uuid;
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;
  if p_friend_id is null or p_friend_id = v_user_id then
    raise exception 'Amigo inválido.';
  end if;
  if exists (
    select 1 from public.fibula_duo_room_participants p
    where p.user_id = v_user_id and p.left_at is null
  ) then
    raise exception 'Você já está em uma sala Duo ativa.';
  end if;
  if not exists (
    select 1 from public.fibula_friend_requests f
    where f.status = 'accepted'
      and (
        (f.sender_id = v_user_id and f.receiver_id = p_friend_id)
        or (f.receiver_id = v_user_id and f.sender_id = p_friend_id)
      )
  ) then
    raise exception 'A sala Duo só pode ser criada com um amigo aceito.';
  end if;

  insert into public.fibula_duo_rooms (host_id, invited_user_id)
  values (v_user_id, p_friend_id)
  returning id into v_room_id;

  insert into public.fibula_duo_room_participants (room_id, user_id, role, last_seen_at)
  values (v_room_id, v_user_id, 'host', pg_catalog.now());

  return v_room_id;
end;
$function$;

create or replace function public.fibula_join_duo_room(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_host_id uuid;
  v_guest_id uuid;
  v_invited_user_id uuid;
  v_phase text;
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select r.host_id, r.guest_id, r.invited_user_id, r.phase
    into v_host_id, v_guest_id, v_invited_user_id, v_phase
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;

  if not found or v_phase <> 'lobby' or v_guest_id is not null then
    raise exception 'Esta sala não está disponível para entrada.';
  end if;
  if v_user_id = v_host_id then
    raise exception 'O anfitrião já pertence a esta sala.';
  end if;
  if v_user_id <> v_invited_user_id then
    raise exception 'Esta sala foi criada para outro jogador.';
  end if;
  if exists (
    select 1 from public.fibula_duo_room_participants p
    where p.user_id = v_user_id and p.left_at is null
  ) then
    raise exception 'Você já está em uma sala Duo ativa.';
  end if;
  if not exists (
    select 1 from public.fibula_friend_requests f
    where f.status = 'accepted'
      and (
        (f.sender_id = v_host_id and f.receiver_id = v_user_id)
        or (f.receiver_id = v_host_id and f.sender_id = v_user_id)
      )
  ) then
    raise exception 'Você não é amigo aceito do anfitrião desta sala.';
  end if;

  update public.fibula_duo_rooms
     set guest_id = v_user_id, updated_at = pg_catalog.now()
   where id = p_room_id;

  insert into public.fibula_duo_room_participants (room_id, user_id, role, last_seen_at)
  values (p_room_id, v_user_id, 'guest', pg_catalog.now());

  return p_room_id;
end;
$function$;

create or replace function public.fibula_set_duo_ready(p_room_id uuid, p_ready boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_phase text;
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select r.phase into v_phase
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;
  if not found or v_phase <> 'lobby' then
    raise exception 'A sala não está aguardando jogadores.';
  end if;

  update public.fibula_duo_room_participants p
     set ready = p_ready,
         last_seen_at = pg_catalog.now()
   where p.room_id = p_room_id
     and p.user_id = v_user_id
     and p.left_at is null;

  if not found then
    raise exception 'Você não participa desta sala.';
  end if;
  update public.fibula_duo_rooms set updated_at = pg_catalog.now() where id = p_room_id;
  return true;
end;
$function$;

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
  v_ready_count integer;
  v_participant_count integer;
  v_match_id uuid := pg_catalog.gen_random_uuid();
  v_match_seed bigint := pg_catalog.floor(pg_catalog.random() * 4294967295)::bigint + 1;
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

  select count(*), count(*) filter (where p.ready)
    into v_participant_count, v_ready_count
    from public.fibula_duo_room_participants p
   where p.room_id = p_room_id and p.left_at is null;

  if v_participant_count <> 2 or v_ready_count <> 2 then
    raise exception 'Os dois jogadores precisam estar prontos para iniciar.';
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

create or replace function public.fibula_leave_duo_room(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_host_id uuid;
  v_phase text;
  v_role text;
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
  if not found then
    raise exception 'Sala Duo não encontrada.';
  end if;

  select p.role into v_role
    from public.fibula_duo_room_participants p
   where p.room_id = p_room_id
     and p.user_id = v_user_id
     and p.left_at is null
   for update;
  if not found then
    raise exception 'Você não participa desta sala.';
  end if;

  if v_phase in ('starting', 'playing') then
    update public.fibula_duo_rooms
       set phase = 'finished', finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set left_at = pg_catalog.now(), ready = false
     where room_id = p_room_id and left_at is null;
  elsif v_role = 'host' then
    update public.fibula_duo_rooms
       set phase = 'cancelled', finished_at = pg_catalog.now(), updated_at = pg_catalog.now()
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set left_at = pg_catalog.now(), ready = false
     where room_id = p_room_id and left_at is null;
  else
    update public.fibula_duo_room_participants
       set left_at = pg_catalog.now(), ready = false
     where room_id = p_room_id and user_id = v_user_id;
    update public.fibula_duo_rooms
       set guest_id = null, updated_at = pg_catalog.now()
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set ready = false
     where room_id = p_room_id and user_id = v_host_id and left_at is null;
  end if;

  return true;
end;
$function$;

-- Heartbeat for the caller's own active participation.
create or replace function public.fibula_duo_heartbeat(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  update public.fibula_duo_room_participants p
     set last_seen_at = pg_catalog.now()
   where p.room_id = p_room_id
     and p.user_id = v_user_id
     and p.left_at is null;

  if not found then
    raise exception 'Você não participa desta sala.';
  end if;
  return true;
end;
$function$;

-- Invitees can discover a pending invite without receiving table SELECT access.
create or replace function public.fibula_list_duo_invites()
returns table(room_id uuid, host_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_lobby_heartbeat_timeout constant interval := interval '45 seconds';
  v_empty_invite_timeout constant interval := interval '120 seconds';
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  return query
  select r.id, r.host_id, r.created_at
    from public.fibula_duo_rooms r
   where r.phase = 'lobby'
     and r.guest_id is null
     and r.invited_user_id = v_user_id
     and r.created_at >= pg_catalog.now() - v_empty_invite_timeout
     and exists (
       select 1
         from public.fibula_duo_room_participants p
        where p.room_id = r.id
          and p.user_id = r.host_id
          and p.role = 'host'
          and p.left_at is null
          and p.last_seen_at >= pg_catalog.now() - v_lobby_heartbeat_timeout
     )
     and exists (
       select 1
         from public.fibula_friend_requests f
        where f.status = 'accepted'
          and (
            (f.sender_id = r.host_id and f.receiver_id = v_user_id)
            or (f.receiver_id = r.host_id and f.sender_id = v_user_id)
          )
     )
   order by r.created_at desc;
end;
$function$;

-- Return the caller's active room and only participants who have not left.
create or replace function public.fibula_get_my_duo_room()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room jsonb;
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select pg_catalog.jsonb_build_object(
           'id', r.id,
           'host_id', r.host_id,
           'guest_id', r.guest_id,
           'phase', r.phase,
           'match_id', r.match_id,
           'match_seed', r.match_seed,
           'participants', (
             select coalesce(
               pg_catalog.jsonb_agg(
                 pg_catalog.jsonb_build_object(
                   'user_id', p.user_id,
                   'role', p.role,
                   'ready', p.ready
                 )
                 order by p.role
               ),
               '[]'::jsonb
             )
               from public.fibula_duo_room_participants p
              where p.room_id = r.id
                and p.left_at is null
           )
         )
    into v_room
    from public.fibula_duo_rooms r
   where r.phase in ('lobby', 'starting', 'playing')
     and exists (
       select 1
         from public.fibula_duo_room_participants mine
        where mine.room_id = r.id
          and mine.user_id = v_user_id
          and mine.left_at is null
     )
   order by r.created_at desc
   limit 1;

  return v_room;
end;
$function$;

-- Only private Broadcast messages on the exact room UUID topic are authorized.
drop policy if exists "Duo room members can read room broadcasts" on realtime.messages;
create policy "Duo room members can read room broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:duo-room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.fibula_is_duo_room_member(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);

drop policy if exists "Duo room members can send room broadcasts" on realtime.messages;
create policy "Duo room members can send room broadcasts"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:duo-room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.fibula_is_duo_room_member(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);

-- Preserve the established RPC ACLs while explicitly exposing the new RPCs.
revoke all on function public.fibula_create_duo_room(uuid) from public, anon;
revoke all on function public.fibula_join_duo_room(uuid) from public, anon;
revoke all on function public.fibula_set_duo_ready(uuid, boolean) from public, anon;
revoke all on function public.fibula_start_duo_match(uuid) from public, anon;
revoke all on function public.fibula_leave_duo_room(uuid) from public, anon;
revoke all on function public.fibula_duo_heartbeat(uuid) from public, anon;
revoke all on function public.fibula_list_duo_invites() from public, anon;
revoke all on function public.fibula_get_my_duo_room() from public, anon;

grant execute on function public.fibula_create_duo_room(uuid) to authenticated;
grant execute on function public.fibula_join_duo_room(uuid) to authenticated;
grant execute on function public.fibula_set_duo_ready(uuid, boolean) to authenticated;
grant execute on function public.fibula_start_duo_match(uuid) to authenticated;
grant execute on function public.fibula_leave_duo_room(uuid) to authenticated;
grant execute on function public.fibula_duo_heartbeat(uuid) to authenticated;
grant execute on function public.fibula_list_duo_invites() to authenticated;
grant execute on function public.fibula_get_my_duo_room() to authenticated;
