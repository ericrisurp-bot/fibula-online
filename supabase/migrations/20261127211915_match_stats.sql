create table if not exists public.fibula_match_stats (
  session_id uuid primary key references public.fibula_solo_match_sessions(id) on delete cascade,
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  balance_version text not null,
  game_version text,
  platform text not null default 'other',
  class_played text not null,
  ended_by text not null default 'death',
  primary_class text,
  secondary_class text,
  survival_nights integer not null,
  kills integer not null,
  duration_seconds integer not null,
  pd integer,
  profile_level integer,
  loadout jsonb not null default '{}'::jsonb,
  profile_attributes jsonb not null default '{}'::jsonb,
  reported jsonb not null default '{}'::jsonb,
  chest_items bigint,
  chest_distinct integer,
  constraint fibula_match_stats_class_check check (class_played in ('guerreiro','mago','arqueiro','druida')),
  constraint fibula_match_stats_ended_by_check check (ended_by in ('death','exit')),
  constraint fibula_match_stats_platform_check check (platform in ('android','web','other')),
  constraint fibula_match_stats_version_check check (balance_version ~ '^[a-z0-9._-]{1,40}$'),
  constraint fibula_match_stats_game_version_check check (game_version is null or game_version ~ '^[A-Za-z0-9._+-]{1,40}$'),
  constraint fibula_match_stats_reported_size_check check (pg_column_size(reported) <= 2048),
  constraint fibula_match_stats_loadout_size_check check (pg_column_size(loadout) <= 4096)
);
create index if not exists fibula_match_stats_created_idx on public.fibula_match_stats (created_at);
create index if not exists fibula_match_stats_class_idx on public.fibula_match_stats (balance_version, class_played);
alter table public.fibula_match_stats enable row level security;
revoke all on public.fibula_match_stats from anon, authenticated;

create or replace function public.fibula_record_match_stats(p_session_id uuid, p_stats jsonb)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_session public.fibula_solo_match_sessions%rowtype;
  v_class text;
  v_balance text;
  v_game text;
  v_platform text;
  v_lock private.fibula_class_locks%rowtype;
  v_loadout private.fibula_pd_loadouts%rowtype;
  v_profile public.fibula_profiles%rowtype;
  v_weapon_id uuid;
  v_weapon jsonb := '{}'::jsonb;
  v_armors jsonb := '{}'::jsonb;
  v_accessories jsonb := '{}'::jsonb;
  v_pd integer;
  v_chest jsonb;
  v_chest_items bigint := 0;
  v_chest_distinct integer := 0;
  v_reported jsonb := '{}'::jsonb;
  v_inserted integer;
  v_ended text;
  v_nights integer;
  v_kills integer;
  v_dur integer;
begin
  if v_uid is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if p_stats is null or jsonb_typeof(p_stats) <> 'object' or length(p_stats::text) > 2000 then
    return 'rejected';
  end if;

  select * into v_session
    from public.fibula_solo_match_sessions
   where id = p_session_id and user_id = v_uid;
  if not found or v_session.status not in ('accepted','abandoned') then
    return 'rejected';
  end if;

  v_class := p_stats->>'class';
  v_balance := p_stats->>'balanceVersion';
  v_game := nullif(p_stats->>'gameVersion', '');
  v_platform := coalesce(nullif(p_stats->>'platform', ''), 'other');
  if v_class is null or v_class not in ('guerreiro','mago','arqueiro','druida')
    or v_balance is null or v_balance !~ '^[a-z0-9._-]{1,40}$'
    or (v_game is not null and v_game !~ '^[A-Za-z0-9._+-]{1,40}$')
    or v_platform not in ('android','web','other') then
    return 'rejected';
  end if;

  v_reported := jsonb_strip_nulls(jsonb_build_object(
    'match_level', case when (p_stats->>'matchLevel') ~ '^[0-9]{1,3}$' then least((p_stats->>'matchLevel')::integer, 500) end,
    'armor',       case when (p_stats->>'armor')      ~ '^[0-9]{1,4}$' then least((p_stats->>'armor')::integer, 5000) end,
    'max_hp',      case when (p_stats->>'maxHp')      ~ '^[0-9]{1,6}$' then least((p_stats->>'maxHp')::integer, 200000) end
  ));

  -- death: valores aceitos pelo servidor. exit: valores do app, limitados pelo tempo da partida.
  v_ended := case when v_session.status = 'accepted' then 'death' else 'exit' end;
  v_dur := greatest(0, extract(epoch from (coalesce(v_session.completed_at, clock_timestamp()) - v_session.started_at))::integer);
  if v_ended = 'death' then
    v_nights := coalesce(v_session.survival_nights, 0);
    v_kills := coalesce(v_session.kills, 0);
  else
    v_nights := least(
      case when (p_stats->>'nights') ~ '^[0-9]{1,4}$' then (p_stats->>'nights')::integer else 0 end,
      floor((v_dur + 60) / 95.0)::integer);
    v_kills := case when (p_stats->>'kills') ~ '^[0-9]{1,7}$' then least((p_stats->>'kills')::integer, 1000000) else 0 end;
  end if;

  select * into v_lock from private.fibula_class_locks where user_id = v_uid;
  select * into v_profile from public.fibula_profiles where user_id = v_uid;
  select * into v_loadout from private.fibula_pd_loadouts where user_id = v_uid;

  if found then
    if (v_loadout.weapons->>v_class) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_weapon_id := (v_loadout.weapons->>v_class)::uuid;
    end if;

    v_pd := private.fibula_pd_for_class(
      v_uid, v_class, v_weapon_id,
      coalesce(v_loadout.armors->v_class, '{}'::jsonb),
      coalesce(v_loadout.accessories->v_class, '{}'::jsonb)
    );

    if v_weapon_id is not null then
      select jsonb_build_object('model', w.model, 'rarity', w.rarity, 'tier', w.tier, 'damage', w.damage)
        into v_weapon
        from public.fibula_weapons w
       where w.id = v_weapon_id and w.user_id = v_uid;
    end if;

    select coalesce(jsonb_object_agg(a.piece, jsonb_build_object('type', a.type, 'rarity', a.rarity, 'stars', a.stars)), '{}'::jsonb)
      into v_armors
      from jsonb_each_text(coalesce(v_loadout.armors->v_class, '{}'::jsonb)) e
      join public.fibula_armors a
        on a.id::text = e.value and a.user_id = v_uid and a.piece = e.key
     where e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    select coalesce(jsonb_object_agg(a.type, jsonb_build_object('rarity', a.rarity, 'metal', a.metal, 'stars', a.stars)), '{}'::jsonb)
      into v_accessories
      from jsonb_each_text(coalesce(v_loadout.accessories->v_class, '{}'::jsonb)) e
      join public.fibula_accessories a
        on a.id::text = e.value and a.user_id = v_uid and a.type = e.key
     where e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  end if;

  select inventory into v_chest from public.fibula_house_storage where user_id = v_uid;
  if v_chest is not null and jsonb_typeof(v_chest) = 'array' then
    v_chest_distinct := jsonb_array_length(v_chest);
    select coalesce(sum((x->>'quantity')::bigint), 0) into v_chest_items
      from jsonb_array_elements(v_chest) x
     where coalesce(x->>'quantity', '') ~ '^[0-9]{1,9}$';
  end if;

  insert into public.fibula_match_stats (
    session_id, user_id, balance_version, game_version, platform, class_played, ended_by,
    primary_class, secondary_class, survival_nights, kills, duration_seconds,
    pd, profile_level, loadout, profile_attributes, reported, chest_items, chest_distinct
  ) values (
    p_session_id, v_uid, v_balance, v_game, v_platform, v_class, v_ended,
    v_lock.primary_class, v_lock.secondary_class,
    v_nights, v_kills, v_dur,
    v_pd, v_profile.level,
    jsonb_build_object('weapon', coalesce(v_weapon, '{}'::jsonb), 'armors', v_armors, 'accessories', v_accessories),
    case when jsonb_typeof(v_profile.attributes) = 'object' then v_profile.attributes else '{}'::jsonb end,
    v_reported, v_chest_items, v_chest_distinct
  )
  on conflict (session_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return 'duplicate';
  end if;

  delete from public.fibula_match_stats
   where session_id in (
     select session_id from public.fibula_match_stats
      where created_at < clock_timestamp() - interval '60 days'
      order by created_at
      limit 200
   );

  return 'recorded';
end;
$function$;

revoke all on function public.fibula_record_match_stats(uuid, jsonb) from public, anon;
grant execute on function public.fibula_record_match_stats(uuid, jsonb) to authenticated;

create or replace view private.fibula_class_balance_summary as
select
  balance_version,
  class_played,
  (coalesce(pd, 0) / 100) * 100 as pd_band,
  count(*) as matches,
  count(*) filter (where ended_by = 'exit') as exits,
  percentile_cont(0.25) within group (order by survival_nights) as nights_p25,
  percentile_cont(0.5)  within group (order by survival_nights) as nights_median,
  percentile_cont(0.75) within group (order by survival_nights) as nights_p75,
  max(survival_nights) as nights_max,
  round(avg(kills)) as kills_avg,
  round(avg(duration_seconds)) as seconds_avg,
  round(avg(pd)) as pd_avg
from public.fibula_match_stats
group by 1, 2, 3;
