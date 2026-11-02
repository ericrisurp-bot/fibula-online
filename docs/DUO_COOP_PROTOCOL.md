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
