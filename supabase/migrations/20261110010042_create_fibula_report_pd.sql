create or replace function public.fibula_report_pd(p_pd integer)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_max_pd constant integer := 3000;
  v_current integer;
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select highest_pd into v_current
    from public.fibula_profiles
   where user_id = v_user_id;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  -- Valor ausente, negativo ou acima do teto: ignora e devolve o recorde atual.
  if p_pd is null or p_pd <= 0 or p_pd > v_max_pd then
    return v_current;
  end if;

  if p_pd > v_current then
    update public.fibula_profiles
       set highest_pd = p_pd,
           updated_at = clock_timestamp()
     where user_id = v_user_id;
    return p_pd;
  end if;

  return v_current;
end;
$function$;

revoke all on function public.fibula_report_pd(integer) from public, anon;
grant execute on function public.fibula_report_pd(integer) to authenticated;
