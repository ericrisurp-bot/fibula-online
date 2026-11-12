create or replace function public.fibula_pd_ranks(p_user_ids uuid[])
returns table(user_id uuid, pd_rank integer)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;
  if p_user_ids is null or coalesce(array_length(p_user_ids,1),0) = 0 then return; end if;
  if array_length(p_user_ids,1) > 200 then raise exception 'Lista grande demais.'; end if;
  return query
    select p.user_id,
           case when coalesce(p.highest_pd,0) > 0
                then 1 + (select count(*)::integer from public.fibula_profiles o where o.highest_pd > p.highest_pd)
                else null end
      from public.fibula_profiles p
     where p.user_id = any(p_user_ids);
end;
$function$;

revoke all on function public.fibula_pd_ranks(uuid[]) from public, anon;
grant execute on function public.fibula_pd_ranks(uuid[]) to authenticated;
