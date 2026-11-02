-- Persistent two-player rooms for Fíbula Duo.
-- This migration only defines room persistence and guarded RPCs. It does not
-- connect the lobby UI or start a synchronized game simulation.

create table if not exists public.fibula_duo_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  guest_id uuid references public.fibula_profiles(user_id) on delete set null,
  phase text not null default 'lobby'
    check (phase in ('lobby', 'playing', 'finished', 'cancelled')),
  match_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint fibula_duo_rooms_distinct_players
    check (guest_id is null or guest_id <> host_id),
  constraint fibula_duo_rooms_match_phase
    check ((phase in ('playing', 'finished') and match_id is not null and started_at is not null)
      or (phase in ('lobby', 'cancelled') and match_id is null))
);

create index if not exists fibula_duo_rooms_host_phase_idx
  on public.fibula_duo_rooms (host_id, phase, created_at desc);
create index if not exists fibula_duo_rooms_guest_phase_idx
  on public.fibula_duo_rooms (guest_id, phase, created_at desc)
  where guest_id is not null;

create table if not exists public.fibula_duo_room_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.fibula_duo_rooms(id) on delete cascade,
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create unique index if not exists fibula_duo_room_participants_active_room_user_uidx
  on public.fibula_duo_room_participants (room_id, user_id)
  where left_at is null;
create unique index if not exists fibula_duo_room_participants_one_active_room_uidx
  on public.fibula_duo_room_participants (user_id)
  where left_at is null;
create index if not exists fibula_duo_room_participants_room_active_idx
  on public.fibula_duo_room_participants (room_id, joined_at)
  where left_at is null;

alter table public.fibula_duo_rooms enable row level security;
alter table public.fibula_duo_room_participants enable row level security;

revoke all privileges on table public.fibula_duo_rooms from anon, authenticated;
revoke all privileges on table public.fibula_duo_room_participants from anon, authenticated;
grant select on table public.fibula_duo_rooms to authenticated;
grant select on table public.fibula_duo_room_participants to authenticated;

-- This SECURITY DEFINER helper avoids recursive participant-table RLS while
-- allowing both members to read the room and each other's lobby-ready state.
create or replace function public.fibula_is_duo_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.fibula_duo_room_participants p
    where p.room_id = p_room_id
      and p.user_id = (select auth.uid())
      and (
        p.left_at is null
        or exists (
          select 1
          from public.fibula_duo_rooms r
          where r.id = p_room_id
            and r.phase in ('finished', 'cancelled')
        )
      )
  );
$function$;

revoke all on function public.fibula_is_duo_room_member(uuid) from public, anon;
grant execute on function public.fibula_is_duo_room_member(uuid) to authenticated;

drop policy if exists "Duo room members can read their rooms" on public.fibula_duo_rooms;
create policy "Duo room members can read their rooms"
  on public.fibula_duo_rooms for select to authenticated
  using (public.fibula_is_duo_room_member(id));

drop policy if exists "Duo room members can read participants" on public.fibula_duo_room_participants;
create policy "Duo room members can read participants"
  on public.fibula_duo_room_participants for select to authenticated
  using (public.fibula_is_duo_room_member(room_id));

drop policy if exists "Restrict Duo rooms to Arena identities" on public.fibula_duo_rooms;
create policy "Restrict Duo rooms to Arena identities"
  on public.fibula_duo_rooms as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1')
  with check ((select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1');

drop policy if exists "Restrict Duo participants to Arena identities" on public.fibula_duo_room_participants;
create policy "Restrict Duo participants to Arena identities"
  on public.fibula_duo_room_participants as restrictive for all to authenticated
  using ((select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1')
  with check ((select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.co/auth/v1');

-- Create a room as host. Only an accepted friend can be invited into it.
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

  insert into public.fibula_duo_rooms (host_id)
  values (v_user_id)
  returning id into v_room_id;

  insert into public.fibula_duo_room_participants (room_id, user_id, role)
  values (v_room_id, v_user_id, 'host');

  return v_room_id;
end;
$function$;

-- Join the host's room after the invitee has accepted the invitation.
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
  v_phase text;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select r.host_id, r.guest_id, r.phase
    into v_host_id, v_guest_id, v_phase
    from public.fibula_duo_rooms r
   where r.id = p_room_id
   for update;

  if not found or v_phase <> 'lobby' or v_guest_id is not null then
    raise exception 'Esta sala não está disponível para entrada.';
  end if;
  if v_user_id = v_host_id then
    raise exception 'O anfitrião já pertence a esta sala.';
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
     set guest_id = v_user_id, updated_at = now()
   where id = p_room_id;

  insert into public.fibula_duo_room_participants (room_id, user_id, role)
  values (p_room_id, v_user_id, 'guest');

  return p_room_id;
end;
$function$;

-- Ready state is written only through this membership-checked RPC.
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
     set ready = p_ready
   where p.room_id = p_room_id
     and p.user_id = v_user_id
     and p.left_at is null;

  if not found then
    raise exception 'Você não participa desta sala.';
  end if;
  update public.fibula_duo_rooms set updated_at = now() where id = p_room_id;
  return true;
end;
$function$;

-- Only the host can start, and both active participants must be ready.
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
  v_match_id uuid := gen_random_uuid();
begin
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
         started_at = now(),
         updated_at = now()
   where id = p_room_id;

  return v_match_id;
end;
$function$;

-- Leaving before start frees the guest slot; leaving during play ends the room.
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

  if v_phase = 'playing' then
    update public.fibula_duo_rooms
       set phase = 'finished', finished_at = now(), updated_at = now()
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set left_at = now(), ready = false
     where room_id = p_room_id and left_at is null;
  elsif v_role = 'host' then
    update public.fibula_duo_rooms
       set phase = 'cancelled', finished_at = now(), updated_at = now()
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set left_at = now(), ready = false
     where room_id = p_room_id and left_at is null;
  else
    update public.fibula_duo_room_participants
       set left_at = now(), ready = false
     where room_id = p_room_id and user_id = v_user_id;
    update public.fibula_duo_rooms
       set guest_id = null, updated_at = now()
     where id = p_room_id;
    update public.fibula_duo_room_participants
       set ready = false
     where room_id = p_room_id and user_id = v_host_id and left_at is null;
  end if;

  return true;
end;
$function$;

revoke all on function public.fibula_create_duo_room(uuid) from public, anon;
revoke all on function public.fibula_join_duo_room(uuid) from public, anon;
revoke all on function public.fibula_set_duo_ready(uuid, boolean) from public, anon;
revoke all on function public.fibula_start_duo_match(uuid) from public, anon;
revoke all on function public.fibula_leave_duo_room(uuid) from public, anon;

grant execute on function public.fibula_create_duo_room(uuid) to authenticated;
grant execute on function public.fibula_join_duo_room(uuid) to authenticated;
grant execute on function public.fibula_set_duo_ready(uuid, boolean) to authenticated;
grant execute on function public.fibula_start_duo_match(uuid) to authenticated;
grant execute on function public.fibula_leave_duo_room(uuid) to authenticated;
