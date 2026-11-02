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


## Persistência das salas — migration proposta

A migration `20261102000400_create_fibula_duo_rooms.sql` adiciona:

- `fibula_duo_rooms`: anfitrião, convidado, fase, match ID e timestamps.
- `fibula_duo_room_participants`: papel, prontidão e histórico de entrada/saída.
- RLS de leitura limitada aos participantes; escrita direta nas tabelas fica revogada.
- RPCs autenticadas e restritas ao issuer da Arena:
  - `fibula_create_duo_room(friend_id)`: cria a sala para um amigo aceito.
  - `fibula_join_duo_room(room_id)`: ocupa a vaga de convidado.
  - `fibula_set_duo_ready(room_id, ready)`: altera somente a própria prontidão.
  - `fibula_start_duo_match(room_id)`: somente o anfitrião inicia, com exatamente dois participantes prontos.
  - `fibula_leave_duo_room(room_id)`: libera a vaga do convidado no lobby ou encerra a sala quando alguém sai durante a partida.

A migration está proposta em uma PR e **não foi aplicada ao Supabase**. O próximo passo após revisão e aprovação é aplicá-la e testar as RPCs com duas contas reais. A integração com o lobby principal e com o motor de jogo continua sendo uma etapa posterior; esta migration, sozinha, ainda não cria uma partida cooperativa sincronizada.
