-- P10 — inclui acessórios no loadout usado pelo cálculo autoritativo do PD.

alter table private.fibula_pd_loadouts
  add column if not exists accessories jsonb not null default '{}'::jsonb
  check (jsonb_typeof(accessories) = 'object');

drop function if exists public.fibula_save_pd_loadout(text, text, jsonb, jsonb);

create function public.fibula_save_pd_loadout(
  p_primary_class text,
  p_secondary_class text,
  p_weapons jsonb,
  p_armors jsonb,
  p_accessories jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_entry record;
  v_class_entry record;
  v_armor_entry record;
  v_accessory_class_entry record;
  v_accessory_entry record;
  v_accessory_id uuid;
  v_accessory_type text;
  v_weapon_id uuid;
  v_armor_id uuid;
  v_weapon_model text;
  v_expected_model text;
  v_armor_piece text;
  v_used_armor_ids uuid[] := array[]::uuid[];
  v_used_accessory_ids uuid[] := array[]::uuid[];
begin
  if v_user_id is null
    or (auth.jwt()->>'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if (p_primary_class is not null and p_primary_class not in ('guerreiro', 'mago', 'arqueiro', 'druida'))
    or (p_secondary_class is not null and p_secondary_class not in ('guerreiro', 'mago', 'arqueiro', 'druida'))
    or (p_primary_class is null and p_secondary_class is null)
    or p_primary_class is not distinct from p_secondary_class then
    raise exception 'Seleção de classes inválida.';
  end if;

  if p_weapons is null or jsonb_typeof(p_weapons) is distinct from 'object'
    or p_armors is null or jsonb_typeof(p_armors) is distinct from 'object'
    or p_accessories is null or jsonb_typeof(p_accessories) is distinct from 'object' then
    raise exception 'Loadout inválido.';
  end if;

  perform 1
    from public.fibula_profiles
   where user_id = v_user_id
   for update;
  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  for v_entry in select key, value from jsonb_each(p_weapons)
  loop
    if v_entry.key not in ('guerreiro', 'mago', 'arqueiro', 'druida') then
      raise exception 'Classe de arma inválida.';
    end if;
    if jsonb_typeof(v_entry.value) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_entry.value) is distinct from 'string' then
      raise exception 'Identificador de arma inválido.';
    end if;

    v_weapon_id := (v_entry.value #>> '{}')::uuid;
    select model into v_weapon_model
      from public.fibula_weapons
     where id = v_weapon_id
       and user_id = v_user_id;
    if not found then
      raise exception 'A arma selecionada não pertence mais a você.';
    end if;

    v_expected_model := case v_entry.key
      when 'guerreiro' then 'espada'
      when 'mago' then 'cajado'
      when 'arqueiro' then 'arco'
      when 'druida' then 'bastao'
    end;
    if v_weapon_model is distinct from v_expected_model then
      raise exception 'A arma selecionada não é compatível com a classe.';
    end if;
  end loop;

  for v_class_entry in select key, value from jsonb_each(p_armors)
  loop
    if v_class_entry.key not in ('guerreiro', 'mago', 'arqueiro', 'druida')
      or jsonb_typeof(v_class_entry.value) is distinct from 'object' then
      raise exception 'Seleção de armaduras inválida.';
    end if;

    for v_armor_entry in select key, value from jsonb_each(v_class_entry.value)
    loop
      if v_armor_entry.key not in ('capacete', 'peitoral', 'calca', 'bota', 'luva')
        or jsonb_typeof(v_armor_entry.value) is distinct from 'string' then
        raise exception 'Peça de armadura inválida.';
      end if;

      v_armor_id := (v_armor_entry.value #>> '{}')::uuid;
      if v_armor_id = any(v_used_armor_ids) then
        raise exception 'A mesma armadura não pode estar equipada em duas classes.';
      end if;

      select piece into v_armor_piece
        from public.fibula_armors
       where id = v_armor_id
         and user_id = v_user_id;
      if not found then
        raise exception 'A armadura selecionada não pertence mais a você.';
      end if;
      if v_armor_piece is distinct from v_armor_entry.key then
        raise exception 'A armadura selecionada não corresponde ao espaço.';
      end if;

      v_used_armor_ids := array_append(v_used_armor_ids, v_armor_id);
    end loop;
  end loop;

  for v_accessory_class_entry in select key, value from jsonb_each(p_accessories)
  loop
    if v_accessory_class_entry.key not in ('guerreiro', 'mago', 'arqueiro', 'druida')
      or jsonb_typeof(v_accessory_class_entry.value) is distinct from 'object' then
      raise exception 'Seleção de acessórios inválida.';
    end if;

    for v_accessory_entry in select key, value from jsonb_each(v_accessory_class_entry.value)
    loop
      if v_accessory_entry.key not in ('colar', 'pulseira', 'cinto')
        or jsonb_typeof(v_accessory_entry.value) is distinct from 'string' then
        raise exception 'Espaço de acessório inválido.';
      end if;

      begin
        v_accessory_id := (v_accessory_entry.value #>> '{}')::uuid;
      exception when others then
        raise exception 'Identificador de acessório inválido.';
      end;

      if v_accessory_id = any(v_used_accessory_ids) then
        raise exception 'O mesmo acessório não pode estar equipado em duas classes.';
      end if;

      select type into v_accessory_type
        from public.fibula_accessories
       where id = v_accessory_id
         and user_id = v_user_id;
      if not found then
        raise exception 'O acessório selecionado não pertence mais a você.';
      end if;
      if v_accessory_type is distinct from v_accessory_entry.key then
        raise exception 'O acessório selecionado não corresponde ao espaço.';
      end if;

      v_used_accessory_ids := array_append(v_used_accessory_ids, v_accessory_id);
    end loop;
  end loop;

  update public.fibula_profiles
     set main_character = p_primary_class,
         updated_at = clock_timestamp()
   where user_id = v_user_id;

  insert into private.fibula_pd_loadouts (
    user_id, primary_class, secondary_class, weapons, armors, accessories, updated_at
  )
  values (
    v_user_id, p_primary_class, p_secondary_class, p_weapons, p_armors, p_accessories, clock_timestamp()
  )
  on conflict (user_id) do update
    set primary_class = excluded.primary_class,
        secondary_class = excluded.secondary_class,
        weapons = excluded.weapons,
        armors = excluded.armors,
        accessories = excluded.accessories,
        updated_at = excluded.updated_at;

  return true;
end;
$function$;

revoke all on function public.fibula_save_pd_loadout(text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.fibula_save_pd_loadout(text, text, jsonb, jsonb, jsonb) to authenticated;

drop function if exists private.fibula_pd_for_class(uuid, text, uuid, jsonb);

create function private.fibula_pd_for_class(
  p_user_id uuid,
  p_class text,
  p_weapon_id uuid,
  p_armor_ids jsonb,
  p_accessory_ids jsonb
)
returns integer
language plpgsql
set search_path to ''
as $function$
declare
  v_weapon_model text;
  v_weapon_damage numeric := 0;
  v_weapon_attributes jsonb := '[]'::jsonb;
  v_weapon_expected_model text;
  v_armor_entry record;
  v_accessory_entry record;
  v_accessory_id uuid;
  v_accessory_type text;
  v_accessory_stars integer;
  v_accessory_attributes jsonb;
  v_attribute_usage numeric;
  v_attribute jsonb;
  v_attribute_key text;
  v_attribute_value numeric;
  v_armor_id uuid;
  v_armor_piece text;
  v_armor_rarity text;
  v_armor_stars integer;
  v_armor_attributes jsonb;
  v_armor_lining text;
  v_armor_lining_value numeric;
  v_star_multiplier numeric;
  v_life_bonus numeric := 0;
  v_armor_bonus numeric := 0;
  v_mobility_bonus numeric := 0;
  v_dodge_bonus numeric := 0;
  v_life_usage numeric;
  v_armor_usage numeric;
  v_mobility_usage numeric;
  v_dodge_usage numeric;
  v_start_health numeric;
  v_base_dodge numeric;
  v_base_speed numeric;
  v_base_damage numeric;
  v_damage_multiplier numeric := 1;
  v_dodge numeric;
  v_total numeric;
begin
  if p_class not in ('guerreiro', 'mago', 'arqueiro', 'druida')
    or p_armor_ids is null
    or jsonb_typeof(p_armor_ids) is distinct from 'object'
    or p_accessory_ids is null
    or jsonb_typeof(p_accessory_ids) is distinct from 'object' then
    raise exception 'Loadout de classe inválido.';
  end if;

  v_start_health := case p_class
    when 'guerreiro' then 150
    when 'mago' then 90
    when 'arqueiro' then 100
    else 110
  end;
  v_base_dodge := case p_class
    when 'guerreiro' then 0.032
    when 'mago' then 0.04
    when 'arqueiro' then 0.048
    else 0.04
  end;
  v_base_speed := case p_class
    when 'guerreiro' then 145
    when 'mago' then 150
    when 'arqueiro' then 160
    else 150
  end;
  v_base_damage := case p_class
    when 'guerreiro' then 16
    when 'mago' then 17
    when 'arqueiro' then 13
    else 17
  end;

  v_life_usage := case p_class
    when 'guerreiro' then 1.2 when 'mago' then 0.9
    when 'arqueiro' then 0.8 else 1.0
  end;
  v_armor_usage := case p_class
    when 'guerreiro' then 1.3 when 'mago' then 0.8
    when 'arqueiro' then 0.7 else 0.9
  end;
  v_mobility_usage := case p_class
    when 'guerreiro' then 0.7 when 'mago' then 1.0
    when 'arqueiro' then 1.3 else 1.0
  end;
  v_dodge_usage := case p_class
    when 'guerreiro' then 0.8 when 'mago' then 1.0
    when 'arqueiro' then 1.2 else 1.0
  end;

  if p_weapon_id is not null then
    select model, damage, attributes
      into v_weapon_model, v_weapon_damage, v_weapon_attributes
      from public.fibula_weapons
     where id = p_weapon_id
       and user_id = p_user_id;
    if not found then
      raise exception 'A arma salva no loadout não pertence mais a você.';
    end if;

    v_weapon_expected_model := case p_class
      when 'guerreiro' then 'espada'
      when 'mago' then 'cajado'
      when 'arqueiro' then 'arco'
      else 'bastao'
    end;
    if v_weapon_model is distinct from v_weapon_expected_model then
      raise exception 'A arma salva no loadout não é compatível com a classe.';
    end if;

    for v_attribute in select value from jsonb_array_elements(v_weapon_attributes)
    loop
      v_attribute_key := v_attribute->>'key';
      v_attribute_value := coalesce((v_attribute->>'value')::numeric, 0);
      if p_class = 'guerreiro' and v_attribute_key = 'forca' then
        v_damage_multiplier := v_damage_multiplier + v_attribute_value * 0.30;
      elsif p_class in ('mago', 'druida') and v_attribute_key = 'inteligencia' then
        v_damage_multiplier := v_damage_multiplier + v_attribute_value * 0.30;
      elsif p_class = 'arqueiro' and v_attribute_key = 'forca' then
        v_damage_multiplier := v_damage_multiplier + v_attribute_value * 0.105;
      elsif p_class = 'arqueiro' and v_attribute_key = 'destreza' then
        v_damage_multiplier := v_damage_multiplier + v_attribute_value * 0.195;
      end if;
    end loop;
  end if;

  for v_armor_entry in select key, value from jsonb_each(p_armor_ids)
  loop
    if v_armor_entry.key not in ('capacete', 'peitoral', 'calca', 'bota', 'luva')
      or jsonb_typeof(v_armor_entry.value) is distinct from 'string' then
      raise exception 'Peça de armadura inválida no loadout salvo.';
    end if;
    v_armor_id := (v_armor_entry.value #>> '{}')::uuid;

    select piece, rarity, stars, attributes, lining, lining_value
      into v_armor_piece, v_armor_rarity, v_armor_stars,
           v_armor_attributes, v_armor_lining, v_armor_lining_value
      from public.fibula_armors
     where id = v_armor_id
       and user_id = p_user_id;
    if not found then
      raise exception 'A armadura salva no loadout não pertence mais a você.';
    end if;
    if v_armor_piece is distinct from v_armor_entry.key then
      raise exception 'A armadura salva não corresponde ao espaço.';
    end if;

    v_star_multiplier := 1 + 0.25 * (v_armor_stars - 1);
    for v_attribute in select value from jsonb_array_elements(v_armor_attributes)
    loop
      v_attribute_key := v_attribute->>'key';
      v_attribute_value := coalesce((v_attribute->>'value')::numeric, 0) * v_star_multiplier;
      if v_attribute_key = 'vida' then
        v_life_bonus := v_life_bonus + v_attribute_value * v_life_usage;
      elsif v_attribute_key = 'armadura' then
        v_armor_bonus := v_armor_bonus + v_attribute_value * v_armor_usage;
      elsif v_attribute_key = 'mobilidade' then
        v_mobility_bonus := v_mobility_bonus + v_attribute_value * v_mobility_usage;
      elsif v_attribute_key = 'esquiva' then
        v_dodge_bonus := v_dodge_bonus + v_attribute_value * v_dodge_usage;
      else
        raise exception 'A armadura contém um atributo inválido para o PD.';
      end if;
    end loop;

    if v_armor_lining = 'algodao' then
      v_life_bonus := v_life_bonus + v_armor_lining_value * v_star_multiplier * v_life_usage;
    elsif v_armor_lining = 'linho' then
      v_mobility_bonus := v_mobility_bonus + v_armor_lining_value * v_star_multiplier * v_mobility_usage;
    end if;
    -- Couro refinado aumenta XP da partida e não entra no PD.
  end loop;

  for v_accessory_entry in select key, value from jsonb_each(p_accessory_ids)
  loop
    if v_accessory_entry.key not in ('colar', 'pulseira', 'cinto')
      or jsonb_typeof(v_accessory_entry.value) is distinct from 'string' then
      raise exception 'Espaço de acessório inválido no loadout salvo.';
    end if;

    begin
      v_accessory_id := (v_accessory_entry.value #>> '{}')::uuid;
    exception when others then
      raise exception 'Identificador de acessório inválido no loadout salvo.';
    end;

    select type, stars, attributes
      into v_accessory_type, v_accessory_stars, v_accessory_attributes
      from public.fibula_accessories
     where id = v_accessory_id
       and user_id = p_user_id;
    if not found then
      raise exception 'O acessório salvo no loadout não pertence mais a você.';
    end if;
    if v_accessory_type is distinct from v_accessory_entry.key then
      raise exception 'O acessório salvo não corresponde ao espaço.';
    end if;
    if jsonb_typeof(v_accessory_attributes) is distinct from 'array' then
      raise exception 'O acessório contém atributos inválidos para o PD.';
    end if;

    v_star_multiplier := 1 + 0.25 * (v_accessory_stars - 1);
    for v_attribute in select value from jsonb_array_elements(v_accessory_attributes)
    loop
      v_attribute_key := v_attribute->>'key';
      v_attribute_value := coalesce((v_attribute->>'value')::numeric, 0) * v_star_multiplier;

      if v_attribute_key = 'vida' then
        v_life_bonus := v_life_bonus + v_attribute_value;
      elsif v_attribute_key = 'armadura' then
        v_armor_bonus := v_armor_bonus + v_attribute_value * 0.4;
      elsif v_attribute_key = 'esquiva' then
        v_dodge_bonus := v_dodge_bonus + v_attribute_value * 0.008;
      elsif v_attribute_key = 'mobilidade' then
        v_mobility_bonus := v_mobility_bonus + v_attribute_value * 1.5;
      elsif v_attribute_key in ('forca', 'inteligencia', 'destreza') then
        v_attribute_usage := case v_attribute_key
          when 'forca' then case p_class
            when 'guerreiro' then 1
            when 'arqueiro' then 0.35
            else 0
          end
          when 'inteligencia' then case p_class
            when 'mago' then 1
            when 'druida' then 1
            else 0
          end
          when 'destreza' then case p_class
            when 'arqueiro' then 0.65
            else 0
          end
          else 0
        end;
        v_damage_multiplier := v_damage_multiplier + v_attribute_usage * v_attribute_value / 100;
      else
        raise exception 'O acessório contém um atributo inválido para o PD.';
      end if;
    end loop;
  end loop;

  v_dodge := least(0.35, v_base_dodge + v_dodge_bonus);
  v_total :=
      100 * (v_start_health + v_life_bonus) / 125
    + 100 * v_armor_bonus / 12
    + 100 * (1 / (1 - v_dodge)) / 1.04
    + 100 * (v_base_speed + v_mobility_bonus) / 145
    + 100 * ((v_base_damage + v_weapon_damage) * v_damage_multiplier) / 16;

  return round(v_total)::integer;
end;
$function$;

revoke all on function private.fibula_pd_for_class(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.fibula_report_pd()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_current integer;
  v_max_pd constant integer := 3000;
  v_primary_class text;
  v_secondary_class text;
  v_weapons jsonb;
  v_armors jsonb;
  v_accessories jsonb;
  v_class text;
  v_weapon_id uuid;
  v_class_pd integer;
  v_total_pd integer := 0;
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

  select primary_class, secondary_class, weapons, armors, accessories
    into v_primary_class, v_secondary_class, v_weapons, v_armors, v_accessories
    from private.fibula_pd_loadouts
   where user_id = v_user_id;
  if not found then
    return v_current;
  end if;

  foreach v_class in array array[v_primary_class, v_secondary_class]
  loop
    if v_class is null then
      continue;
    end if;
    if v_weapons->>v_class is null then
      v_weapon_id := null;
    else
      v_weapon_id := (v_weapons->>v_class)::uuid;
    end if;

    v_class_pd := private.fibula_pd_for_class(
      v_user_id,
      v_class,
      v_weapon_id,
      coalesce(v_armors->v_class, '{}'::jsonb),
      coalesce(v_accessories->v_class, '{}'::jsonb)
    );
    v_total_pd := v_total_pd + v_class_pd;
  end loop;

  if v_total_pd > v_current and v_total_pd <= v_max_pd then
    update public.fibula_profiles
       set highest_pd = greatest(highest_pd, v_total_pd),
           updated_at = clock_timestamp()
     where user_id = v_user_id
     returning highest_pd into v_current;
    return v_current;
  end if;

  return v_current;
end;
$function$;

revoke all on function public.fibula_report_pd() from public, anon;
grant execute on function public.fibula_report_pd() to authenticated;
