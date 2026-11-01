-- Registro de início e validação final de partidas solo usando relógio do PostgreSQL.
-- A simulação continua local; o servidor valida apenas limites derivados das regras publicadas.

create table if not exists public.fibula_solo_match_sessions (
  id uuid primary key,
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  ruleset_version text not null,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  status text not null default 'started'
    check (status in ('started', 'accepted', 'rejected')),
  kills integer,
  survival_nights integer
);

create index if not exists fibula_solo_match_sessions_user_started_idx
  on public.fibula_solo_match_sessions (user_id, started_at desc);

alter table public.fibula_solo_match_sessions enable row level security;
revoke all privileges on table public.fibula_solo_match_sessions from anon, authenticated;

create table if not exists public.fibula_solo_match_alerts (
  id bigint generated always as identity primary key,
  user_id uuid references public.fibula_profiles(user_id) on delete set null,
  session_id uuid,
  alert_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz
);

create index if not exists fibula_solo_match_alerts_created_idx
  on public.fibula_solo_match_alerts (created_at desc);

alter table public.fibula_solo_match_alerts enable row level security;
revoke all privileges on table public.fibula_solo_match_alerts from anon, authenticated;

drop function if exists public.fibula_sync_solo_match(uuid, integer, integer);

create or replace function public.fibula_start_solo_match()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid := gen_random_uuid();
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  insert into public.fibula_profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  insert into public.fibula_solo_match_sessions (id, user_id, ruleset_version)
  values (v_session_id, v_user_id, 'solo-v1');

  return v_session_id;
end;
$function$;

create or replace function public.fibula_finish_solo_match(
  p_session_id uuid,
  p_kills integer,
  p_survival_nights integer,
  p_ruleset_version text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.fibula_solo_match_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_elapsed_seconds numeric;
  v_max_started_nights integer;
  v_max_survival_nights integer;
  v_max_kills integer := 0;
  v_night_index integer;
  v_night_target integer;
  v_night_elapsed numeric;
  v_progress numeric;
  v_stage_progress numeric;
  v_completed_stages integer;
  v_scheduled_fraction numeric;
  v_distribution numeric[] := array[0.30, 0.20, 0.25, 0.15, 0.10];
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select *
    into v_session
    from public.fibula_solo_match_sessions
   where id = p_session_id
     and user_id = v_user_id
   for update;

  if not found then
    insert into public.fibula_solo_match_alerts (user_id, session_id, alert_type, details)
    values (v_user_id, p_session_id, 'unknown_session', jsonb_build_object(
      'kills', p_kills, 'survival_nights', p_survival_nights
    ));
    return 'rejected';
  end if;

  if v_session.status <> 'started' then
    insert into public.fibula_solo_match_alerts (user_id, session_id, alert_type, details)
    values (v_user_id, p_session_id, 'duplicate_submission', jsonb_build_object(
      'status', v_session.status, 'kills', p_kills, 'survival_nights', p_survival_nights
    ));
    return 'duplicate';
  end if;

  v_elapsed_seconds := greatest(0, extract(epoch from (v_now - v_session.started_at)));

  if p_kills is null or p_kills < 0
    or p_survival_nights is null or p_survival_nights < 0
    or p_ruleset_version is distinct from v_session.ruleset_version
    or p_ruleset_version is distinct from 'solo-v1' then
    update public.fibula_solo_match_sessions
       set status = 'rejected', completed_at = v_now,
           kills = p_kills, survival_nights = p_survival_nights
     where id = p_session_id;

    insert into public.fibula_solo_match_alerts (user_id, session_id, alert_type, details)
    values (v_user_id, p_session_id, 'invalid_summary_or_ruleset', jsonb_build_object(
      'kills', p_kills, 'survival_nights', p_survival_nights,
      'submitted_ruleset', p_ruleset_version,
      'session_ruleset', v_session.ruleset_version,
      'elapsed_seconds', v_elapsed_seconds
    ));
    return 'rejected';
  end if;

  -- CONFIG.dayNight: ciclo nominal 90s, mas uma noite concluída pode encerrar
  -- após 30s de spawns + 5s de transição + 60s de dia. Para o limite máximo,
  -- considera início já durante a noite e encerramento imediato após a última leva.
  v_max_started_nights := floor(v_elapsed_seconds / 95)::integer + 1;
  v_max_survival_nights := floor((v_elapsed_seconds + 60) / 95)::integer;

  -- CONFIG.dayNight.firstNightSpawnCount=5, addedPerNight=5,
  -- nightSpawnDuration=30 e distribuição [0.30,0.20,0.25,0.15,0.10].
  -- Reproduz o teto de inimigos que poderiam ter sido agendados até o tempo do servidor.
  for v_night_index in 1..v_max_started_nights loop
    v_night_elapsed := v_elapsed_seconds - ((v_night_index - 1) * 95);
    if v_night_elapsed < 0 then
      exit;
    end if;

    v_progress := least(1, greatest(0, v_night_elapsed / 30));
    v_stage_progress := v_progress * 5;
    v_completed_stages := least(5, floor(v_stage_progress)::integer);
    v_scheduled_fraction := 0;

    if v_completed_stages > 0 then
      for stage_index in 1..v_completed_stages loop
        v_scheduled_fraction := v_scheduled_fraction + v_distribution[stage_index];
      end loop;
    end if;

    if v_completed_stages < 5 then
      v_scheduled_fraction := v_scheduled_fraction
        + v_distribution[v_completed_stages + 1] * (v_stage_progress - v_completed_stages);
    end if;

    v_night_target := 5 + ((v_night_index - 1) * 5);
    v_max_kills := v_max_kills + least(
      v_night_target,
      ceil(v_night_target * v_scheduled_fraction)::integer
    );
  end loop;

  if p_survival_nights > v_max_survival_nights or p_kills > v_max_kills then
    update public.fibula_solo_match_sessions
       set status = 'rejected', completed_at = v_now,
           kills = p_kills, survival_nights = p_survival_nights
     where id = p_session_id;

    insert into public.fibula_solo_match_alerts (user_id, session_id, alert_type, details)
    values (v_user_id, p_session_id, 'impossible_match_result', jsonb_build_object(
      'reported_kills', p_kills,
      'maximum_possible_kills', v_max_kills,
      'reported_survival_nights', p_survival_nights,
      'maximum_possible_survival_nights', v_max_survival_nights,
      'elapsed_seconds', v_elapsed_seconds,
      'ruleset_version', p_ruleset_version
    ));
    return 'rejected';
  end if;

  update public.fibula_solo_match_sessions
     set status = 'accepted', completed_at = v_now,
         kills = p_kills, survival_nights = p_survival_nights
   where id = p_session_id;

  insert into public.fibula_solo_match_results (user_id, match_id, kills, survival_nights)
  values (v_user_id, p_session_id, p_kills, p_survival_nights)
  on conflict (user_id, match_id) do nothing;

  if found then
    update public.fibula_profiles
       set kills = kills + p_kills,
           highest_survival_level = greatest(highest_survival_level, p_survival_nights),
           updated_at = v_now
     where user_id = v_user_id;
    return 'accepted';
  end if;

  insert into public.fibula_solo_match_alerts (user_id, session_id, alert_type, details)
  values (v_user_id, p_session_id, 'duplicate_result_record', jsonb_build_object(
    'kills', p_kills, 'survival_nights', p_survival_nights
  ));
  return 'duplicate';
end;
$function$;

revoke all on function public.fibula_start_solo_match() from public, anon;
grant execute on function public.fibula_start_solo_match() to authenticated;

revoke all on function public.fibula_finish_solo_match(uuid, integer, integer, text) from public, anon;
grant execute on function public.fibula_finish_solo_match(uuid, integer, integer, text) to authenticated;
