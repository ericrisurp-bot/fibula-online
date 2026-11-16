-- Explicitly abandon a live Solo session without creating a ranking result.
-- The session is terminal on the server even when the player is still alive.

alter table public.fibula_solo_match_sessions
  drop constraint if exists fibula_solo_match_sessions_status_check;

alter table public.fibula_solo_match_sessions
  add constraint fibula_solo_match_sessions_status_check
  check (status = any (array['started'::text, 'accepted'::text, 'rejected'::text, 'abandoned'::text]));

create or replace function public.fibula_abandon_solo_match(p_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.fibula_solo_match_sessions%rowtype;
  v_now timestamptz := (select pg_catalog.clock_timestamp());
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select s.* into v_session
    from public.fibula_solo_match_sessions s
   where s.id = p_session_id
     and s.user_id = v_user_id
   for update;

  if not found then
    return 'rejected';
  end if;

  if v_session.status = 'abandoned' then
    return 'duplicate';
  end if;

  if v_session.status <> 'started' then
    return 'rejected';
  end if;

  update public.fibula_solo_match_sessions
     set status = 'abandoned',
         completed_at = v_now,
         kills = null,
         survival_nights = null
   where id = p_session_id
     and user_id = v_user_id
     and status = 'started';

  if not found then
    return 'rejected';
  end if;

  return 'accepted';
end;
$function$;

revoke all on function public.fibula_abandon_solo_match(uuid) from public;
revoke all on function public.fibula_abandon_solo_match(uuid) from anon;
grant execute on function public.fibula_abandon_solo_match(uuid) to authenticated;
