-- E1 — recupera o último loadout de equipamentos validado para o usuário autenticado.
create or replace function public.fibula_get_pd_loadout()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_primary_class text;
  v_secondary_class text;
  v_weapons jsonb;
  v_armors jsonb;
  v_accessories jsonb;
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  select primary_class, secondary_class, weapons, armors, accessories
    into v_primary_class, v_secondary_class, v_weapons, v_armors, v_accessories
    from private.fibula_pd_loadouts
   where user_id = v_user_id;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_object_agg(e.key, to_jsonb(w.id::text)), '{}'::jsonb)
    into v_weapons
    from jsonb_each_text(coalesce(v_weapons, '{}'::jsonb)) e
    join public.fibula_weapons w
      on w.id::text = e.value
     and w.user_id = v_user_id
     and w.model = case e.key
       when 'guerreiro' then 'espada'
       when 'mago' then 'cajado'
       when 'arqueiro' then 'arco'
       when 'druida' then 'bastao'
       else null
     end
   where e.key in ('guerreiro', 'mago', 'arqueiro', 'druida')
     and e.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  select coalesce(jsonb_object_agg(class_entry.key, class_entry.valid_pieces), '{}'::jsonb)
    into v_armors
    from (
      select e.key,
        coalesce((
          select jsonb_object_agg(piece_entry.key, to_jsonb(a.id::text))
            from jsonb_each_text(e.value) piece_entry
            join public.fibula_armors a
              on a.id::text = piece_entry.value
             and a.user_id = v_user_id
             and a.piece = piece_entry.key
           where piece_entry.key in ('capacete', 'peitoral', 'calca', 'bota', 'luva')
             and piece_entry.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ), '{}'::jsonb) as valid_pieces
        from jsonb_each(coalesce(v_armors, '{}'::jsonb)) e
       where e.key in ('guerreiro', 'mago', 'arqueiro', 'druida')
         and jsonb_typeof(e.value) = 'object'
    ) class_entry
   where class_entry.valid_pieces <> '{}'::jsonb;

  select coalesce(jsonb_object_agg(class_entry.key, class_entry.valid_slots), '{}'::jsonb)
    into v_accessories
    from (
      select e.key,
        coalesce((
          select jsonb_object_agg(slot_entry.key, to_jsonb(a.id::text))
            from jsonb_each_text(e.value) slot_entry
            join public.fibula_accessories a
              on a.id::text = slot_entry.value
             and a.user_id = v_user_id
             and a.type = slot_entry.key
           where slot_entry.key in ('colar', 'pulseira', 'cinto')
             and slot_entry.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        ), '{}'::jsonb) as valid_slots
        from jsonb_each(coalesce(v_accessories, '{}'::jsonb)) e
       where e.key in ('guerreiro', 'mago', 'arqueiro', 'druida')
         and jsonb_typeof(e.value) = 'object'
    ) class_entry
   where class_entry.valid_slots <> '{}'::jsonb;

  return jsonb_build_object(
    'primary_class', v_primary_class,
    'secondary_class', v_secondary_class,
    'weapons', coalesce(v_weapons, '{}'::jsonb),
    'armors', coalesce(v_armors, '{}'::jsonb),
    'accessories', coalesce(v_accessories, '{}'::jsonb)
  );
end;
$function$;

revoke all on function public.fibula_get_pd_loadout() from public, anon;
grant execute on function public.fibula_get_pd_loadout() to authenticated;
