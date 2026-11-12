create or replace function public.fibula_cooking_discard(p_meal_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_row public.fibula_cooking_state; v_found boolean;
begin
  if p_meal_id is null or length(p_meal_id) = 0 then raise exception 'Refeição inválida.'; end if;
  v_row := public.fibula_cooking_lock_row();
  select exists(select 1 from jsonb_array_elements(v_row.ready) e where e->>'id' = p_meal_id) into v_found;
  if not v_found then raise exception 'Refeição não encontrada no Baú.'; end if;
  update public.fibula_cooking_state
     set ready = (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(ready) e where e->>'id' <> p_meal_id),
         updated_at = now()
   where user_id = v_row.user_id
   returning * into v_row;
  return public.fibula_cooking_snapshot(v_row);
end;
$function$;

revoke all on function public.fibula_cooking_discard(text) from public, anon;
grant execute on function public.fibula_cooking_discard(text) to authenticated;
