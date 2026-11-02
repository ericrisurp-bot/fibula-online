# Fíbula Online — protocolo cooperativo Duo

## Objetivo

O modo Duo será uma partida cooperativa real: duas contas entram no mesmo mundo, controlam personagens distintos e compartilham inimigos, recursos, progressão e ciclo dia/noite. O modo Solo continua independente.

## Modelo de autoridade da primeira versão

- O anfitrião executa a simulação do mundo e publica snapshots.
- O convidado envia somente intenção de controle (movimento e teclas permitidas); não envia posição, dano, vida ou resultado de coleta como verdade.
- O anfitrião valida remetente, sala, sequência e limites do input antes de aplicar comandos.
- Os snapshots carregam o estado compartilhado do mundo e os dois personagens.
- A interface não deve iniciar a partida até receber o estado de sala válido e confirmar que os dois participantes estão prontos.

Esse modelo é host-authoritative, não server-authoritative: o navegador do anfitrião continua sendo um cliente e não oferece proteção forte contra trapaça. Uma futura evolução para servidor autoritativo exigiria mover a simulação para infraestrutura confiável.

## Transporte e persistência

- Supabase Realtime Broadcast privado transporta inputs, snapshots e eventos efêmeros da sessão.
- O banco mantém a fonte persistente de verdade para sala, participantes, anfitrião, estado, prontidão e identificador da partida.
- O tópico deve ser restrito aos dois membros autorizados; nunca usar tópico público ou confiar apenas no ID informado pelo cliente.
- Presença/heartbeat serve para detectar conexão, não para declarar que um jogador está pronto ou que a partida começou.
- Mensagens carregam versão do protocolo, sala, partida, remetente, sequência e horário.
- Rejeitar mensagens fora da sala/partida, de remetentes não participantes, com sequência repetida/antiga ou payload fora dos limites.

## Sequência esperada

1. Convite aceito cria/associa uma sala persistente com anfitrião e convidado.
2. Os dois aparecem nos slots do lobby principal; cada participante altera sua prontidão.
3. O anfitrião inicia somente quando os dois estiverem prontos e conectados.
4. O anfitrião cria uma seed e um match ID; ambos carregam o mesmo mundo.
5. O convidado envia inputs; o anfitrião aplica os inputs no motor compartilhado e publica snapshots.
6. Saída, derrota, desconexão e reconexão atualizam o estado sem criar uma segunda partida independente.

## Limites desta etapa

Este documento e `src/game/coop/protocol.ts` definem o contrato inicial. Ainda não ativam multiplayer, não criam tabelas/policies, não alteram o Lobby principal nem mudam o motor Solo. Essas integrações devem entrar em etapas separadas e testáveis, começando pela persistência/controle de sala e depois pela simulação com dois jogadores.


## Persistência das salas — contrato endurecido (migration 00400 + 00500)

A migration-base `20261102000400_create_fibula_duo_rooms.sql` cria as tabelas e as cinco RPCs originais. A migration aditiva `20261102000500_harden_fibula_duo_rooms.sql` endurece o ciclo de vida sem editar a 00400 e pode ser reaplicada sem duplicar colunas, constraints ou policies.

### Estado persistido

- `fibula_duo_rooms`: anfitrião, convidado, usuário convidado, fase, `match_id`, `match_seed` e timestamps.
- `fibula_duo_room_participants`: papel, prontidão, entrada/saída e `last_seen_at`.
- Fases: `lobby`, `starting`, `playing`, `finished` e `cancelled`. Esta etapa mantém o início direto em `playing`; `starting` permanece reservado.
- Para `starting`, `playing` e `finished`, `match_id`, `match_seed` e `started_at` são obrigatórios. Registros antigos recebem uma seed determinística derivada do `match_id` antes da constraint ser reforçada.
- O acesso de leitura às tabelas continua limitado pelas policies existentes. O convidado ainda não membro descobre o convite somente pela RPC `fibula_list_duo_invites()`.

### RPCs e segurança

Todas as RPCs de cliente são `SECURITY DEFINER`, validam o issuer da Arena, usam `search_path = ''` e ficam com execução concedida a `authenticated` (não a `anon`):

- `fibula_create_duo_room(p_friend_id uuid) returns uuid`: cria sala para amigo aceito e registra o heartbeat inicial do anfitrião.
- `fibula_list_duo_invites() returns table(room_id uuid, host_id uuid, created_at timestamptz)`: lista convites pendentes endereçados ao usuário, somente se o anfitrião ainda estiver ativo e a amizade continuar aceita.
- `fibula_join_duo_room(p_room_id uuid) returns uuid`: permite ao convidado designado ocupar a vaga e inicia seu heartbeat.
- `fibula_set_duo_ready(p_room_id uuid, p_ready boolean) returns boolean`: altera a prontidão do próprio participante e atualiza seu heartbeat.
- `fibula_start_duo_match(p_room_id uuid) returns uuid`: somente o anfitrião inicia com exatamente dois participantes ativos e ambos prontos; grava `match_id` e `match_seed`, mantendo a fase `playing`.
- `fibula_leave_duo_room(p_room_id uuid) returns boolean`: mantém as regras de saída da sala/lobby e encerra a partida em andamento.
- `fibula_duo_heartbeat(p_room_id uuid) returns boolean`: atualiza somente o heartbeat da participação ativa do chamador; falha se ele não participa.
- `fibula_get_my_duo_room() returns jsonb`: retorna a sala ativa do chamador, incluindo `id`, `host_id`, `guest_id`, `phase`, `match_id`, `match_seed` e participantes ativos (`user_id`, `role`, `ready`), ou `null`.

A rotina interna `fibula_duo_expire_stale()` é chamada no início das RPCs de sala e não tem execução concedida aos clientes. As janelas são:

- Lobby: heartbeat sugerido a cada **15 segundos**; anfitrião sem heartbeat por mais de **45 segundos** cancela a sala e encerra todas as participações.
- Convite sem convidado: sala em lobby sem `guest_id` por mais de **120 segundos** é cancelada.
- Convidado em lobby: sem heartbeat por mais de **45 segundos**, sua participação é encerrada, a vaga é liberada e a prontidão do anfitrião volta a `false`.
- Partida: qualquer participante ativo sem heartbeat por mais de **90 segundos** encerra a sala como `finished` e encerra todas as participações ativas.

### Realtime da sala

Inputs, snapshots e eventos efêmeros usam **Broadcast privado**, no tópico exato `fibula:duo-room:<room_uuid>`. Policies de `SELECT` e `INSERT` em `realtime.messages` exigem extensão `broadcast`, issuer da Arena, UUID válido no tópico e `fibula_is_duo_room_member(room_id)`. Este canal **não usa Presence**. As policies existentes de inbox e presença dos amigos permanecem independentes e não são substituídas.

### Roteiro manual de teste — duas contas Arena

1. Entre com a Conta A e a Conta B, confirme que são amigos aceitos e mantenha ambas conectadas.
2. Na Conta A, crie uma sala para a Conta B usando `fibula_create_duo_room(friend_id)`; anote o UUID retornado.
3. Na Conta B, chame `fibula_list_duo_invites()`; confirme que o convite aparece com o mesmo `room_id` e o `host_id` da Conta A. Recarregue a página e repita a leitura para confirmar que o convite continua persistente.
4. Na Conta B, execute `fibula_join_duo_room(room_id)`; em ambas as contas, consulte `fibula_get_my_duo_room()` e confirme os dois participantes ativos.
5. Em cada conta, execute `fibula_set_duo_ready(room_id, true)`. Confirme que ambos aparecem como `ready: true`.
6. Na Conta A, execute `fibula_start_duo_match(room_id)`. Confirme que o retorno é o `match_id` e que `fibula_get_my_duo_room()` mostra fase `playing`, o mesmo `match_id` e uma `match_seed` não nula para ambas as contas.
7. Em uma sala de teste, pare de enviar `fibula_duo_heartbeat(room_id)` para um participante durante uma partida. Após mais de 90 segundos, faça uma chamada de leitura/RPC de sala para disparar a rotina de expiração e confirme fase `finished` e `left_at` preenchido para ambos.
8. Repita em lobby: pare o heartbeat do anfitrião por mais de 45 segundos e confirme cancelamento; depois teste um convidado sem heartbeat por mais de 45 segundos e confirme liberação da vaga e reset da prontidão do anfitrião. Para o convite sem convidado, aguarde mais de 120 segundos e confirme cancelamento.

Este roteiro é manual e deve ser executado em ambiente de teste com duas contas. **A migration 00500 está apenas proposta nesta PR: não foi aplicada nem testada em banco.** Nenhuma alteração de banco, policy ou configuração foi executada nesta etapa. A integração com o lobby principal e com o motor de simulação cooperativa continua sendo trabalho posterior.
