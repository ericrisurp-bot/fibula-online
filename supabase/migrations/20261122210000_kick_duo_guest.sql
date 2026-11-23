-- Allow the host to remove only the guest while the Duo room is still in its lobby phase.
-- The host remains an active participant; the invited player can be invited again later.

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
