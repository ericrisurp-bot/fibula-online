-- Progresso permanente do Guia do Aventureiro e estruturas individuais do acampamento.
-- Cada jogador mantém seu próprio mundo, inclusive no modo Duo.

create table if not exists public.fibula_adventurer_progress (
  user_id uuid primary key references public.fibula_profiles(user_id) on delete cascade,
  completed_missions smallint[] not null default '{}',
  objectives jsonb not null default '{}'::jsonb,
  chest_position jsonb,
  refinery_position jsonb,
  tecelaria_position jsonb,
  updated_at timestamptz not null default now(),
  constraint fibula_adventurer_progress_completed_missions
    check (completed_missions <@ array[4,5,6,7,8,9]::smallint[]),
  constraint fibula_adventurer_progress_objectives_object
    check (jsonb_typeof(objectives) = 'object'),
  constraint fibula_adventurer_progress_chest_position
    check (chest_position is null or (jsonb_typeof(chest_position) = 'object' and chest_position ? 'x' and chest_position ? 'y')),
  constraint fibula_adventurer_progress_refinery_position
    check (refinery_position is null or (jsonb_typeof(refinery_position) = 'object' and refinery_position ? 'x' and refinery_position ? 'y')),
  constraint fibula_adventurer_progress_tecelaria_position
    check (tecelaria_position is null or (jsonb_typeof(tecelaria_position) = 'object' and tecelaria_position ? 'x' and tecelaria_position ? 'y'))
);

alter table public.fibula_adventurer_progress enable row level security;
revoke all privileges on table public.fibula_adventurer_progress from anon, authenticated;
grant select, insert, update on table public.fibula_adventurer_progress to authenticated;

drop policy if exists "Players can read their own adventurer progress" on public.fibula_adventurer_progress;
create policy "Players can read their own adventurer progress"
  on public.fibula_adventurer_progress for select to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

drop policy if exists "Players can insert their own adventurer progress" on public.fibula_adventurer_progress;
create policy "Players can insert their own adventurer progress"
  on public.fibula_adventurer_progress for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

drop policy if exists "Players can update their own adventurer progress" on public.fibula_adventurer_progress;
create policy "Players can update their own adventurer progress"
  on public.fibula_adventurer_progress for update to authenticated
  using (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  )
  with check (
    (select auth.uid()) = user_id
    and (select auth.jwt()->>'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );
