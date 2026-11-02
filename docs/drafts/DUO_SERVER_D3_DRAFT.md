# D3 — rascunho do servidor cooperativo Duo

> **DOCUMENTO DE PROJETO — NÃO É UMA MIGRATION.**
>
> Este arquivo não deve ser executado no Supabase, copiado para `supabase/migrations` ou aplicado por CLI/MCP. É uma proposta para revisão de arquitetura. Nenhuma tabela, função, policy, trigger ou dado é criado por esta etapa.

## 1. Objetivo e limites

O servidor coordena duas partidas locais independentes. Cada participante continua executando seu próprio `GameEngine`, mapa, inimigos, recursos, casa, carrinho e inventário.

O servidor persiste somente o estado mínimo de coordenação e os resultados cooperativos validados. Não recebe snapshots, posições, inputs, combate, drops ou inventários.

A implementação futura deverá:
- reutilizar `fibula_duo_rooms`, `fibula_duo_room_participants` e `match_id` já existentes;
- manter `fibula_start_solo_match` / `fibula_finish_solo_match` como referência de autorização, relógio do banco e plausibilidade;
- derivar alvo de horda da função Solo: `soloHordeTarget(n)`; Duo usa `floor((soloTarget * 17 + 5) / 10)`;
- usar sementes distintas por participante, derivadas de uma seed da sessão;
- tratar relatos como idempotentes e serializar transições com lock de linha;
- não criar presença ou heartbeat durante a partida.

## 2. Modelo de dados proposto

Os nomes e tipos abaixo são uma proposta, não um contrato final.

### 2.1 Sessão cooperativa

```sql
create table public.fibula_duo_match_sessions (
  match_id uuid primary key,
  room_id uuid not null unique references public.fibula_duo_rooms(id) on delete cascade,
  ruleset_version text not null,
  status text not null check (status in ('playing', 'finished', 'aborted')),
  current_night integer not null default 0 check (current_night >= 0),
  session_seed bigint not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  cooperative_nights integer not null default 0 check (cooperative_nights >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);
```

- `match_id` reutiliza o UUID que a sala já recebe ao iniciar.
- `room_id` impede duas sessões para a mesma sala.
- `session_seed` fica somente no servidor; nunca é enviado como seed comum aos dois clientes.
- `cooperative_nights` conta apenas noites concluídas por ambos enquanto ambos estavam vivos.

### 2.2 Participantes e sementes individuais

```sql
create table public.fibula_duo_match_players (
  match_id uuid not null references public.fibula_duo_match_sessions(match_id) on delete cascade,
  user_id uuid not null references public.fibula_profiles(user_id) on delete cascade,
  role text not null check (role in ('host', 'guest')),
  player_status text not null check (player_status in ('alive', 'dead', 'disconnected')),
  player_seed bigint not null,
  survival_nights integer not null default 0 check (survival_nights >= 0),
  kills integer not null default 0 check (kills >= 0),
  started_at timestamptz not null,
  ended_at timestamptz,
  primary key (match_id, user_id),
  unique (match_id, role)
);
```

A associação de usuário e papel deve ser copiada da participação ativa da sala no momento da criação da sessão. RPCs nunca aceitam um `user_id` arbitrário como autor do relato: o autor é sempre `auth.uid()`.

### 2.3 Relato por jogador e noite

```sql
create table public.fibula_duo_night_reports (
  match_id uuid not null,
  night_number integer not null check (night_number > 0),
  user_id uuid not null,
  report_status text not null check (report_status in ('finished', 'dead', 'disconnected')),
  solo_horde_target integer not null check (solo_horde_target >= 0),
  duo_horde_target integer not null check (duo_horde_target >= 0),
  individual_horde_target integer not null check (individual_horde_target >= 0),
  reported_at timestamptz not null,
  accepted_at timestamptz,
  primary key (match_id, night_number, user_id),
  foreign key (match_id, user_id)
    references public.fibula_duo_match_players(match_id, user_id)
    on delete cascade
);
```

A chave primária garante um único relato aceito por jogador/noite. Um reenvio retorna o resultado já gravado; não cria outro relato nem avança a noite novamente. Se for necessário registrar tentativas inválidas, usar uma tabela interna de alertas separada, sem substituir o relato canônico.

## 3. RPCs propostas

As assinaturas são indicativas. A implementação deverá definir tipos de retorno estáveis e ACLs explícitas antes de qualquer migration.

### `fibula_start_duo_session(p_room_id uuid)`

- Exige JWT Arena e `auth.uid()`.
- Bloqueia a sala `FOR UPDATE`; exige `phase = 'playing'`, `match_id` presente e exatamente os dois participantes originais ainda vinculados.
- É chamada como parte da futura integração de início; não deve iniciar uma segunda partida nem sobrescrever uma sessão existente.
- Cria a sessão e duas linhas de participantes em transação única.
- Gera seed individual diferente para cada usuário a partir da seed da sessão; nunca entrega a seed comum.
- Retorna somente os dados de inicialização pertencentes ao chamador: `match_id`, `night_number`, `player_seed`, `ruleset_version`.
- Repetição para a mesma sala retorna a inicialização já criada para o próprio usuário.

### `fibula_duo_report_night(p_match_id uuid, p_night_number integer, p_report text, p_kills integer)`

- Aceita somente `finished` ou `dead`; queda é detectada por regra técnica do servidor, não por declaração confiável do cliente.
- Resolve o usuário exclusivamente por `auth.uid()`; exige sessão Arena, participante ativo e sessão em andamento.
- Bloqueia a linha da sessão `FOR UPDATE` e valida que `p_night_number` é exatamente a noite corrente.
- Calcula no servidor o alvo Solo e o alvo Duo usando a regra inteira já centralizada; não aceita alvo informado pelo cliente.
- `finished` só é aceito quando o relato é plausível pelo relógio do banco e a validação da noite permite conclusão. `dead` marca o participante como morto.
- Insere o relato com chave idempotente. Repetições retornam o estado já persistido.
- Quando os dois participantes têm `finished` na noite atual e ambos permanecem vivos, incrementa `cooperative_nights` uma única vez e libera o avanço do ciclo.
- Quando o outro participante já está morto/desconectado, libera o ciclo do sobrevivente sem contabilizar a noite como cooperativa.
- Respostas atrasadas de noites anteriores retornam o resultado persistido daquela noite; nunca alteram a noite atual.
- Retorna o alvo individual, o estado do ciclo e se o cliente pode liberar o amanhecer. Não retorna dados privados do outro mundo.

### `fibula_duo_get_session_state(p_match_id uuid)`

- Exige que o chamador seja participante da sessão.
- Retorna apenas o estado de coordenação necessário: noite atual, status do próprio participante, estado geral da sessão, autorização de amanhecer e alvo individual do chamador.
- Não retorna seed do parceiro, kills privados, inventário, posição, estado do mundo ou conteúdo dos relatos privados do parceiro.

### `fibula_duo_mark_disconnected(p_match_id uuid, p_user_id uuid)` — alternativa interna

Preferir uma função interna acionada por timeout/expiração confiável do servidor, não uma RPC pública que permita um cliente marcar o parceiro como desconectado. Se o produto não tiver scheduler/worker confiável disponível, o timeout de 15 segundos precisa ser redesenhado antes da implementação; não simular desconexão usando o heartbeat de lobby.

## 4. Regras transacionais e concorrência

1. Toda transição de sessão/noite bloqueia primeiro a sessão com `FOR UPDATE`.
2. Ordem de lock única: sessão → participante(s) em ordem determinística de `user_id` → relato.
3. Relatos são únicos por `(match_id, night_number, user_id)`.
4. O avanço de `current_night` acontece na mesma transação que confirma os dois relatos.
5. A transição é compare-and-set: só avança se `current_night = p_night_number` e a sessão ainda estiver `playing`.
6. Repetições, concorrência e respostas atrasadas não podem duplicar contagem nem pular noites.
7. O servidor determina os alvos individuais. Para dois vivos, dividir o total Duo igualmente, dando o excedente ao papel/ordem estável definido no início da sessão. Com um vivo, atribuir 100% do alvo Duo na próxima noite.
8. Morte/queda encerra a elegibilidade de ranking cooperativo no primeiro evento válido. O sobrevivente mantém o fator 1,7× nas noites seguintes.

## 5. Segurança, RLS e permissões a definir na implementação

- Habilitar RLS nas três tabelas; revogar acesso direto de escrita de `anon` e `authenticated`.
- Preferir leitura via RPC com checagem de associação, ou políticas de leitura estritamente limitadas ao próprio usuário.
- RPCs privilegiadas, se realmente necessárias, devem ficar fora do schema exposto, validar `auth.uid()` e o issuer Arena no corpo, usar `search_path = ''`, e ter `EXECUTE` revogado de `PUBLIC` e `anon` com concessão explícita a `authenticated`.
- Não usar `user_metadata` para autorização.
- Não aceitar do cliente `user_id`, status do parceiro, alvo de horda, timestamp, seed do parceiro ou resultado final como autoridade.
- Revisar RLS, ACLs, exposição da Data API e advisors antes de propor uma migration executável.

## 6. Validação de plausibilidade

A função Solo atual valida resumo final com o relógio do PostgreSQL e limites derivados do cronograma de spawn. O Duo deverá reutilizar a mesma fonte de constantes e uma regra específica para o protocolo cooperativo:

- duração mínima plausível de cada noite/ciclo, respeitando o primeiro início possivelmente noturno;
- máximo de abates possível a partir do alvo individual e da janela de spawn;
- rejeição de noite futura, pulada, duplicada fora da idempotência, ou de participante já eliminado;
- alertas internos para sessão desconhecida, submissão inválida, tempo impossível e duplicidade conflitante.

**Não copiar cegamente** os números de `fibula_finish_solo_match`: o cálculo atual de Solo usa constantes espelhadas em SQL e precisa ser estendido conscientemente para a divisão de horda Duo. Clientes adulterados em conluio ainda podem explorar o limite honesto descrito no protocolo D0.

## 7. Heartbeat e queda

O heartbeat atual é do lobby. Não o tratar como prova de atividade de partida. A expiração atual de sala deve ser revisada antes de conectar a sessão de jogo, para que um jogador não seja marcado como caído por ausência de heartbeat de lobby durante uma partida.

A política de timeout de 15 segundos descrita no protocolo precisa de uma fonte confiável para detectar ausência de resposta. Sem scheduler/worker confiável, não criar uma RPC pública que permita ao parceiro declarar unilateralmente que o outro caiu. A implementação deverá escolher e documentar um mecanismo de timeout antes de criar a migration.

## 8. Integração futura com o início existente

A sala já possui `match_id`, `match_seed`, `started_at` e os participantes do lobby. A integração futura deve:
- criar a sessão cooperativa na mesma transação do início, ou usar uma RPC única que faça ambos;
- não criar duas sessões para a mesma sala;
- não quebrar o limite de quatro partidas ativas já existente;
- não alterar as regras de sala/convite/pronto fora do escopo aprovado;
- manter o fluxo Solo independente.

## 9. Questões que exigem decisão antes da migration

1. **Timeout:** qual mecanismo confiável marcará uma queda após 15 segundos sem introduzir polling agressivo?
2. **Relato de morte:** a morte será enviada imediatamente por RPC; o servidor aceita o evento uma vez e encerra a elegibilidade cooperativa?
3. **Abates:** o ranking Duo precisa dos abates por noite ou apenas noites cooperativas? Se abates forem enviados, definir teto plausível por alvo e relógio.
4. **Seed:** confirmar algoritmo determinístico para derivar seeds individuais sem revelar seed do parceiro.
5. **Retenção:** definir por quanto tempo sessões e relatos finalizados serão mantidos.

Nenhuma dessas decisões deve ser resolvida implicitamente durante a escrita da migration.

## 10. Não faz parte da D3

- Não criar arquivo em `supabase/migrations`.
- Não executar SQL, query, migration, seed, policy ou função.
- Não alterar banco, Supabase, Auth, Realtime, RLS, dados ou configurações.
- Não conectar RPCs ao cliente, UI ou motor.
- Não implementar heartbeat de partida, scheduler ou worker.
- Não alterar `src/game/engine.ts`, Solo, Duo lobby ou troca.
- Não executar build ou testes nesta etapa.
