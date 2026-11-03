-- One-way lobby gift transfer using the existing house-storage source of truth.
-- This deliberately does not depend on the not-yet-integrated canonical inventory.

create or replace function public.fibula_duo_house_transfer(
  p_room_id uuid,
  p_item_id text,
  p_quantity bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_host_id uuid;
  v_guest_id uuid;
  v_receiver_id uuid;
  v_sender_inventory jsonb;
  v_receiver_inventory jsonb;
  v_sender_quantity bigint;
  v_receiver_quantity bigint;
  v_receiver_types integer;
  v_receiver_has_item boolean;
  v_sender_next jsonb;
  v_receiver_next jsonb;
begin
  if v_user_id is null
    or (select auth.jwt() ->> 'iss') is distinct from 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1' then
    raise exception 'Sessão não autorizada.';
  end if;

  if p_room_id is null or p_item_id is null
    or char_length(p_item_id) not between 1 and 100
    or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000 then
    raise exception 'Item ou quantidade inválida.';
  end if;

  -- Locking the room prevents a transfer from racing with the match start.
  select r.host_id, r.guest_id
    into v_host_id, v_guest_id
    from public.fibula_duo_rooms r
   where r.id = p_room_id and r.phase = 'lobby'
   for update;

  if not found or v_guest_id is null
    or v_user_id not in (v_host_id, v_guest_id)
    or (select count(*) from public.fibula_duo_room_participants p
         where p.room_id = p_room_id and p.left_at is null) <> 2
    or not exists (
      select 1 from public.fibula_duo_room_participants p
       where p.room_id = p_room_id and p.user_id = v_user_id and p.left_at is null
    ) then
    raise exception 'A transferência só pode ocorrer entre os dois participantes ativos no lobby.';
  end if;

  v_receiver_id := case when v_user_id = v_host_id then v_guest_id else v_host_id end;

  if not exists (
    select 1 from public.fibula_duo_room_participants p
     where p.room_id = p_room_id and p.user_id = v_receiver_id and p.left_at is null
  ) then
    raise exception 'O outro jogador não está mais ativo neste lobby.';
  end if;

  -- Ensure both rows exist, then lock them in a stable order.
  insert into public.fibula_house_storage (user_id, inventory)
  values (v_host_id, '[]'::jsonb), (v_guest_id, '[]'::jsonb)
  on conflict (user_id) do nothing;

  perform s.user_id
    from public.fibula_house_storage s
   where s.user_id in (v_user_id, v_receiver_id)
   order by s.user_id
   for update;

  select s.inventory into v_sender_inventory
    from public.fibula_house_storage s
   where s.user_id = v_user_id;

  select s.inventory into v_receiver_inventory
    from public.fibula_house_storage s
   where s.user_id = v_receiver_id;

  if jsonb_typeof(v_sender_inventory) is distinct from 'array'
    or jsonb_typeof(v_receiver_inventory) is distinct from 'array' then
    raise exception 'Um dos baús possui dados inválidos.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_sender_inventory) as entry(value)
     where entry.value ->> 'itemId' = p_item_id
       and coalesce(entry.value ->> 'quantity', '') !~ '^[1-9][0-9]*
    from jsonb_array_elements(v_sender_inventory) as entry(value)
   where entry.value ->> 'itemId' = p_item_id;

  if v_sender_quantity < p_quantity then
    raise exception 'Quantidade insuficiente no seu Baú. Atualize o Baú e tente novamente.';
  end if;

  select coalesce(sum((entry.value ->> 'quantity')::bigint), 0)
    into v_receiver_quantity
    from jsonb_array_elements(v_receiver_inventory) as entry(value)
   where entry.value ->> 'itemId' = p_item_id;

  if v_receiver_quantity + p_quantity > 1000000000 then
    raise exception 'A quantidade excede o limite permitido no Baú do outro jogador.';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_receiver_inventory) as entry(value)
     where entry.value ->> 'itemId' = p_item_id
  ) into v_receiver_has_item;

  if not v_receiver_has_item then
    select count(distinct entry.value ->> 'itemId')
      into v_receiver_types
      from jsonb_array_elements(v_receiver_inventory) as entry(value)
     where nullif(entry.value ->> 'itemId', '') is not null;
    if v_receiver_types >= 50 then
      raise exception 'O Baú do outro jogador está cheio.';
    end if;
  end if;

  -- Merge duplicate legacy stacks into one entry while preserving every other item.
  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
    into v_sender_next
    from jsonb_array_elements(v_sender_inventory) with ordinality as entry(value, ordinality)
   where entry.value ->> 'itemId' is distinct from p_item_id;

  if v_sender_quantity > p_quantity then
    v_sender_next := v_sender_next || jsonb_build_array(
      jsonb_build_object('itemId', p_item_id, 'quantity', v_sender_quantity - p_quantity)
    );
  end if;

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
    into v_receiver_next
    from jsonb_array_elements(v_receiver_inventory) with ordinality as entry(value, ordinality)
   where entry.value ->> 'itemId' is distinct from p_item_id;

  v_receiver_next := v_receiver_next || jsonb_build_array(
    jsonb_build_object('itemId', p_item_id, 'quantity', v_receiver_quantity + p_quantity)
  );

  update public.fibula_house_storage
     set inventory = v_sender_next, updated_at = pg_catalog.now()
   where user_id = v_user_id;

  update public.fibula_house_storage
     set inventory = v_receiver_next, updated_at = pg_catalog.now()
   where user_id = v_receiver_id;

  return true;
end;
$function$;

revoke all on function public.fibula_duo_house_transfer(uuid, text, bigint) from public, anon;
grant execute on function public.fibula_duo_house_transfer(uuid, text, bigint) to authenticated;

  ) then
    raise exception 'A quantidade deste item no seu Baú está inválida.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_receiver_inventory) as entry(value)
     where entry.value ->> 'itemId' = p_item_id
       and coalesce(entry.value ->> 'quantity', '') !~ '^[1-9][0-9]*
    from jsonb_array_elements(v_sender_inventory) as entry(value)
   where entry.value ->> 'itemId' = p_item_id;

  if v_sender_quantity < p_quantity then
    raise exception 'Quantidade insuficiente no seu Baú. Atualize o Baú e tente novamente.';
  end if;

  select coalesce(sum((entry.value ->> 'quantity')::bigint), 0)
    into v_receiver_quantity
    from jsonb_array_elements(v_receiver_inventory) as entry(value)
   where entry.value ->> 'itemId' = p_item_id;

  if v_receiver_quantity + p_quantity > 1000000000 then
    raise exception 'A quantidade excede o limite permitido no Baú do outro jogador.';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_receiver_inventory) as entry(value)
     where entry.value ->> 'itemId' = p_item_id
  ) into v_receiver_has_item;

  if not v_receiver_has_item then
    select count(distinct entry.value ->> 'itemId')
      into v_receiver_types
      from jsonb_array_elements(v_receiver_inventory) as entry(value)
     where nullif(entry.value ->> 'itemId', '') is not null;
    if v_receiver_types >= 50 then
      raise exception 'O Baú do outro jogador está cheio.';
    end if;
  end if;

  -- Merge duplicate legacy stacks into one entry while preserving every other item.
  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
    into v_sender_next
    from jsonb_array_elements(v_sender_inventory) with ordinality as entry(value, ordinality)
   where entry.value ->> 'itemId' is distinct from p_item_id;

  if v_sender_quantity > p_quantity then
    v_sender_next := v_sender_next || jsonb_build_array(
      jsonb_build_object('itemId', p_item_id, 'quantity', v_sender_quantity - p_quantity)
    );
  end if;

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
    into v_receiver_next
    from jsonb_array_elements(v_receiver_inventory) with ordinality as entry(value, ordinality)
   where entry.value ->> 'itemId' is distinct from p_item_id;

  v_receiver_next := v_receiver_next || jsonb_build_array(
    jsonb_build_object('itemId', p_item_id, 'quantity', v_receiver_quantity + p_quantity)
  );

  update public.fibula_house_storage
     set inventory = v_sender_next, updated_at = pg_catalog.now()
   where user_id = v_user_id;

  update public.fibula_house_storage
     set inventory = v_receiver_next, updated_at = pg_catalog.now()
   where user_id = v_receiver_id;

  return true;
end;
$function$;

revoke all on function public.fibula_duo_house_transfer(uuid, text, bigint) from public, anon;
grant execute on function public.fibula_duo_house_transfer(uuid, text, bigint) to authenticated;

  ) then
    raise exception 'A quantidade deste item no Baú do outro jogador está inválida.';
  end if;

  select coalesce(sum((entry.value ->> 'quantity')::bigint), 0)
    into v_sender_quantity
    from jsonb_array_elements(v_sender_inventory) as entry(value)
   where entry.value ->> 'itemId' = p_item_id;

  if v_sender_quantity < p_quantity then
    raise exception 'Quantidade insuficiente no seu Baú. Atualize o Baú e tente novamente.';
  end if;

  select coalesce(sum((entry.value ->> 'quantity')::bigint), 0)
    into v_receiver_quantity
    from jsonb_array_elements(v_receiver_inventory) as entry(value)
   where entry.value ->> 'itemId' = p_item_id;

  if v_receiver_quantity + p_quantity > 1000000000 then
    raise exception 'A quantidade excede o limite permitido no Baú do outro jogador.';
  end if;

  select exists (
    select 1 from jsonb_array_elements(v_receiver_inventory) as entry(value)
     where entry.value ->> 'itemId' = p_item_id
  ) into v_receiver_has_item;

  if not v_receiver_has_item then
    select count(distinct entry.value ->> 'itemId')
      into v_receiver_types
      from jsonb_array_elements(v_receiver_inventory) as entry(value)
     where nullif(entry.value ->> 'itemId', '') is not null;
    if v_receiver_types >= 50 then
      raise exception 'O Baú do outro jogador está cheio.';
    end if;
  end if;

  -- Merge duplicate legacy stacks into one entry while preserving every other item.
  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
    into v_sender_next
    from jsonb_array_elements(v_sender_inventory) with ordinality as entry(value, ordinality)
   where entry.value ->> 'itemId' is distinct from p_item_id;

  if v_sender_quantity > p_quantity then
    v_sender_next := v_sender_next || jsonb_build_array(
      jsonb_build_object('itemId', p_item_id, 'quantity', v_sender_quantity - p_quantity)
    );
  end if;

  select coalesce(jsonb_agg(entry.value order by entry.ordinality), '[]'::jsonb)
    into v_receiver_next
    from jsonb_array_elements(v_receiver_inventory) with ordinality as entry(value, ordinality)
   where entry.value ->> 'itemId' is distinct from p_item_id;

  v_receiver_next := v_receiver_next || jsonb_build_array(
    jsonb_build_object('itemId', p_item_id, 'quantity', v_receiver_quantity + p_quantity)
  );

  update public.fibula_house_storage
     set inventory = v_sender_next, updated_at = pg_catalog.now()
   where user_id = v_user_id;

  update public.fibula_house_storage
     set inventory = v_receiver_next, updated_at = pg_catalog.now()
   where user_id = v_receiver_id;

  return true;
end;
$function$;

revoke all on function public.fibula_duo_house_transfer(uuid, text, bigint) from public, anon;
grant execute on function public.fibula_duo_house_transfer(uuid, text, bigint) to authenticated;
