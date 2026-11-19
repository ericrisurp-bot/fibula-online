drop index if exists public.fibula_proficiencies_user_idx;
create index if not exists fibula_proficiencies_key_idx
  on public.fibula_proficiencies (proficiency_key);

drop policy if exists "Arena players can read proficiency catalog"
  on public.fibula_proficiency_catalog;
create policy "Arena players can read proficiency catalog"
  on public.fibula_proficiency_catalog
  for select
  to authenticated
  using (
    ((select auth.jwt()) ->> 'iss')
      = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );

drop policy if exists "Players can read their own proficiencies"
  on public.fibula_proficiencies;
create policy "Players can read their own proficiencies"
  on public.fibula_proficiencies
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and ((select auth.jwt()) ->> 'iss')
      = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  );