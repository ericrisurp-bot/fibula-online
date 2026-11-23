-- Allow the host to remove only the guest while the Duo room is still in its lobby phase.
-- The host remains an active participant; the invited player can be invited again later.

alter table public.fibula_duo_rooms
  add column if not exists kicked_guest_id uuid references public.fibula_profiles(user_id) on delete set null;

create or replace function public.fibula_kick_duo_guest(p_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_room public.fibula_duo_rooms%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select r.* into v_room
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;

  if not found then
    raise exception 'Sala Duo não encontrada.';
  end if;

  if v_room.host_id <> v_user_id then
    raise exception 'Somente o anfitrião pode expulsar o convidado.';
  end if;

  if v_room.phase <> 'lobby' or v_room.guest_id is null then
    raise exception 'Só é possível expulsar um parceiro conectado no lobby.';
  end if;

  update public.fibula_duo_room_participants
     set left_at = v_now,
         ready = false
   where room_id = p_room_id
     and user_id = v_room.guest_id
     and role = 'guest'
     and left_at is null;

  if not found then
    raise exception 'O convidado não está mais ativo nesta sala.';
  end if;

  update public.fibula_duo_rooms
     set guest_id = null,
         kicked_guest_id = v_room.guest_id,
         updated_at = v_now
   where id = p_room_id
     and phase = 'lobby'
     and host_id = v_user_id;

  if not found then
    raise exception 'Não foi possível atualizar a sala Duo.';
  end if;

  return true;
end;
$function$;

revoke all on function public.fibula_kick_duo_guest(uuid) from public, anon;
grant execute on function public.fibula_kick_duo_guest(uuid) to authenticated;

-- A kicked invitee must not receive the same pending invitation again or rejoin
-- by replaying an old invite payload.
create or replace function public.fibula_list_duo_invites()
returns table(room_id uuid, host_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_duo_lobby_heartbeat_timeout constant interval := interval '45 seconds';
  v_duo_empty_invite_timeout constant interval := interval '120 seconds';
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
     and r.kicked_guest_id is distinct from v_user_id
     and r.invited_user_id = v_user_id
     and r.created_at >= pg_catalog.now() - v_duo_empty_invite_timeout
     and exists (
       select 1
         from public.fibula_duo_room_participants p
        where p.room_id = r.id
          and p.user_id = r.host_id
          and p.role = 'host'
          and p.left_at is null
          and p.last_seen_at >= pg_catalog.now() - v_duo_lobby_heartbeat_timeout
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
  v_kicked_guest_id uuid;
  v_phase text;
begin
  perform public.fibula_duo_expire_stale();

  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select r.host_id, r.guest_id, r.invited_user_id, r.kicked_guest_id, r.phase
    into v_host_id, v_guest_id, v_invited_user_id, v_kicked_guest_id, v_phase
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
  if v_user_id = v_kicked_guest_id then
    raise exception 'Você foi removido desta sala Duo.';
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
