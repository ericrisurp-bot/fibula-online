create or replace function public.fibula_delete_weapon(p_weapon_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if p_weapon_id is null then
    return false;
  end if;

  -- Só apaga arma do próprio jogador. Arma inexistente ou de outro jogador: false, sem erro.
  delete from public.fibula_weapons
   where id = p_weapon_id
     and user_id = v_user_id;

  return found;
end;
$function$;

revoke all on function public.fibula_delete_weapon(uuid) from public, anon;
grant execute on function public.fibula_delete_weapon(uuid) to authenticated;
