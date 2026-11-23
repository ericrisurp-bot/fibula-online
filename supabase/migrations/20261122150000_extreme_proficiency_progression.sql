-- Preserve each account's earned proficiency level while moving to the extreme curve.
-- The baseline is immutable during normal event sync: only events after baseline_counter
-- advance the new progression curve. Existing counters are never deleted or reduced.

alter table public.fibula_proficiencies
  add column progression_preserved_level integer not null default 0
    check (progression_preserved_level >= 0),
  add column progression_baseline_counter bigint not null default 0
    check (progression_baseline_counter >= 0);

with proficiency_config (
  proficiency_key,
  legacy_base,
  legacy_growth,
  max_level
) as (
  values
    ('espada', 14.65::double precision, 1.10::double precision, 150),
    ('arco', 14.65::double precision, 1.10::double precision, 150),
    ('cajado', 14.65::double precision, 1.10::double precision, 150),
    ('bastao_natureza', 14.65::double precision, 1.10::double precision, 150),
    ('golpes_recebidos', 3.66::double precision, 1.10::double precision, 150),
    ('machado_madeira', 10.96::double precision, 1.08::double precision, 100),
    ('picareta', 10.96::double precision, 1.08::double precision, 100),
    ('foice_mao', 10.96::double precision, 1.08::double precision, 100),
    ('vara_pesca', 5.48::double precision, 1.08::double precision, 100),
    ('faca_esfolar', 1.37::double precision, 1.08::double precision, 100),
    ('carroca_distancia', 13.57::double precision, 1.07::double precision, 100)
),
legacy_milestones as (
  select
    config.proficiency_key,
    levels.level,
    floor(
      config.legacy_base
      * (power(config.legacy_growth, levels.level) - 1.0)
      / (config.legacy_growth - 1.0)
      + 0.5
    )::bigint as total_required
  from proficiency_config config
  cross join lateral generate_series(1, config.max_level) as levels(level)
),
preserved_levels as (
  select
    proficiency.user_id,
    proficiency.proficiency_key,
    proficiency.counter,
    coalesce(
      max(milestone.level) filter (
        where milestone.total_required <= proficiency.counter
      ),
      0
    ) as preserved_level
  from public.fibula_proficiencies proficiency
  left join legacy_milestones milestone
    on milestone.proficiency_key = proficiency.proficiency_key
  group by
    proficiency.user_id,
    proficiency.proficiency_key,
    proficiency.counter
)
update public.fibula_proficiencies proficiency
set
  progression_preserved_level = preserved.preserved_level,
  progression_baseline_counter = preserved.counter
from preserved_levels preserved
where proficiency.user_id = preserved.user_id
  and proficiency.proficiency_key = preserved.proficiency_key;

comment on column public.fibula_proficiencies.progression_preserved_level is
  'Nível alcançado na curva anterior, preservado durante a migração para a progressão extrema.';
comment on column public.fibula_proficiencies.progression_baseline_counter is
  'Contador bruto no momento da migração; somente eventos acima desse valor avançam na curva nova.';
