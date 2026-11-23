-- Expande o Baú de 50 para 120 espaços sem alterar ou regravar os itens existentes.
-- Atualiza os limites de capacidade das três funções de armazenamento e troca
-- atualmente instaladas. A antiga fibula_inventory_adjust_stack(text,bigint) foi
-- removida da lista porque pertencia à migration 20261102000900, nunca aplicada,
-- e foi substituída por fibula_house_apply_delta(uuid,jsonb).

alter table public.fibula_house_storage
  drop constraint if exists fibula_house_storage_inventory_array;

alter table public.fibula_house_storage
  add constraint fibula_house_storage_inventory_array
  check (
    case
      when jsonb_typeof(inventory) = 'array'
        then jsonb_array_length(inventory) <= 120
      else false
    end
  );

-- As três funções abaixo já existem nas instalações atuais. Atualizamos apenas
-- os limites explícitos de capacidade nos corpos instalados, sem executar esta
-- migration nem modificar o banco durante a criação desta PR.
do $$
declare
  v_signature text;
  v_function regprocedure;
  v_definition text;
  v_updated text;
  v_signatures text[] := array[
    'public.fibula_house_apply_delta(uuid,jsonb)',
    'public.fibula_duo_house_transfer(uuid,text,bigint)',
    'public.fibula_duo_trade_confirm(uuid)'
  ];
begin
  foreach v_signature in array v_signatures loop
    v_function := pg_catalog.to_regprocedure(v_signature);
    if v_function is null then
      raise exception 'Função necessária para expandir o Baú não encontrada: %', v_signature;
    end if;

    v_definition := pg_catalog.pg_get_functiondef(v_function);
    v_updated := replace(v_definition, '>= 50', '>= 120');
    v_updated := replace(v_updated, '> 50 then', '> 120 then');
    v_updated := replace(v_updated, '50 espaços', '120 espaços');

    if v_updated = v_definition then
      raise exception 'Nenhum limite de 50 espaços foi encontrado em %; revisão manual necessária.', v_signature;
    end if;

    execute v_updated;

    v_definition := pg_catalog.pg_get_functiondef(v_function);
    if position('>= 120' in v_definition) = 0
      or position('>= 50' in v_definition) > 0 then
      raise exception 'A definição instalada de % não confirmou o limite >= 120 sem >= 50.', v_signature;
    end if;
  end loop;
end;
$$;
