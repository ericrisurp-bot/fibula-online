# Fíbula Online — protocolo cooperativo Duo (mundos independentes)

## Decisão oficial

Este documento substitui o protocolo anterior de mundo compartilhado/host-authoritative.

A modalidade cooperativa terá dois mapas independentes. Cada cliente executa sua própria partida local, com seu próprio personagem, casa, carrinho, inventário, recursos, inimigos, XP, drops e construção.

O multiplayer compartilha somente o estado mínimo necessário para coordenar a dupla, a pressão das hordas, o encerramento das noites e o resultado cooperativo.

## O que NÃO será sincronizado

Durante a partida, não transmitir:

- posição, movimento, direção ou câmera;
- vida, nível, XP ou atributos em tempo real;
- inimigos, alvos, ataques, projéteis ou dano;
- árvores, pedras, algodão, drops ou orbes;
- casa, carrinho, inventário, construções ou recursos;
- snapshots do mundo ou inputs do jogador.

Cada mapa continua sendo simulado e salvo individualmente.

## O que será compartilhado

Somente eventos pequenos e pontuais:

- início da sessão e identificação dos dois participantes;
- morte/abandono de um participante (evento único);
- conclusão da horda local e estado vivo do participante, ao terminar a noite;
- número da noite e pressão calculada para a próxima horda;
- encerramento do resultado cooperativo.

As mensagens carregam versão do protocolo, sala, partida, remetente, sequência e horário. Mensagens duplicadas, antigas, de outra sala/partida ou de remetentes que não pertencem à dupla devem ser rejeitadas.

## Ciclo de noite

1. Os dois clientes iniciam a mesma noite e seus relógios de ciclo ficam alinhados.
2. Cada cliente gera e combate seus próprios inimigos.
3. Quando um jogador elimina o último inimigo do próprio mapa, envia um único evento `night_complete`.
4. Esse jogador continua livre no próprio mapa: pode andar, minerar, coletar, construir e organizar seus itens.
5. O ciclo desse mapa não avança para o amanhecer e não cria outra horda enquanto aguarda o parceiro.
6. O outro jogador continua combatendo no próprio mapa.
7. Quando os dois participantes estiverem resolvidos — cada jogador vivo concluiu sua horda, ou o outro morreu — acontece a sincronização.
8. Se houver pelo menos um sobrevivente, os clientes avançam juntos para o próximo dia/noite. Se os dois morrerem, a sessão termina.

O primeiro jogador não fica parado nem tem o mundo congelado. Somente a transição do ciclo fica aguardando. A simulação local de movimento, coleta e construção continua ativa.

## Dificuldade cooperativa

A pressão total de cada noite é sempre derivada da configuração atual do Solo:

`pressaoTotal = round(alvoSoloAtual × 1.7)`

Não manter uma tabela de inimigos separada para o modo Duo. Qualquer alteração futura no cálculo do Solo deve refletir automaticamente no Duo.

Exemplos:

| Alvo atual do Solo | Pressão total Duo |
|---:|---:|
| 10 | 17 |
| 20 | 34 |
| 30 | 51 |
| 50 | 85 |

Com dois jogadores vivos, dividir a pressão total de forma equilibrada. O primeiro participante na ordem estável da sala recebe o excedente quando o total for ímpar: 17 vira 9 e 8.

Quando um jogador morrer, a noite atual não muda. A partir da próxima noite, o sobrevivente recebe 100% da pressão total de 1,7×. A dificuldade nunca retorna a 1,0× durante aquela sessão.

A função pura que implementa essa regra fica em `src/game/coop/rules.ts`.

## Morte e continuidade

- Morte encerra a participação daquele jogador na sessão.
- O jogador retorna ao próprio lobby; não existe espectador.
- O progresso individual permanece no salvamento próprio.
- O sobrevivente continua no próprio mapa.
- A nova distribuição da horda só muda na próxima noite.
- O ranking cooperativo deixa de acumular quando o primeiro jogador morre.
- O sobrevivente pode continuar sua partida, mas esse trecho posterior não aumenta o resultado cooperativo.
- Se os dois morrerem, a sessão termina; não existe próxima noite.

## Recursos, XP e itens

Nada é compartilhado automaticamente durante a partida.

XP, abates, drops, materiais, equipamentos, inventário, casa, carrinho e evolução são individuais. A troca de itens acontece somente no lobby, quando os jogadores decidirem enviar algo um ao outro.

## Desconexão e reconexão

Não haverá reconexão à partida.

Não haverá heartbeat de presença, polling ou sinal contínuo de "estou vivo" durante o jogo. A intenção é detectar disponibilidade nos pontos de sincronização e por eventos pontuais, sem tráfego repetitivo.

Um jogador que morrer pode emitir um único evento `player_died`. Se a conexão cair abruptamente e esse evento não chegar, o outro cliente só poderá concluir que o participante está indisponível quando a sincronização de fim de noite não receber a resposta esperada.

**Pendente antes da integração no motor:** definir um prazo máximo para essa resposta de fim de noite. Não reutilizar automaticamente o prazo de reconexão anterior: reconexão foi removida. O prazo de sincronização precisa ser uma regra explícita e separada.

## Transporte e persistência

- Reutilizar a sala persistente existente para convite, participantes, prontidão e início.
- Durante a partida, usar somente o canal privado da sala para os eventos pequenos descritos acima.
- Não persistir no banco estado de mapa, posição, inventário, inimigos ou simulação.
- Não gravar a cada frame, segundo ou movimento.
- Não usar Presence/heartbeat como transporte do estado da partida.
- O armazenamento persistente de sala não deve ser confundido com sincronização do mundo.
- O ranking final precisa ter validação apropriada; não aceitar pontuação enviada livremente pelo cliente como fonte confiável.

A manutenção da sala no lobby pode continuar usando o mecanismo existente. Ao iniciar a partida, o cliente não deve continuar o polling periódico de lobby nem o heartbeat de sala como se ainda estivesse aguardando convite. O comportamento exato será alterado na etapa de integração do cliente.

## Segurança e limites

Os mapas são locais e independentes; portanto, não há autoridade de servidor sobre cada combate nesta primeira arquitetura. Eventos de sessão precisam ser validados quanto a sala, partida, participante, sequência e noite. Ranking competitivo exige validação adicional no servidor antes de ser considerado confiável.

## Fora do escopo desta etapa

- Não alterar migrations, tabelas, policies ou dados do Supabase.
- Não alterar o lobby, FriendsModal ou App nesta etapa.
- Não alterar o motor Solo, CONFIG ou balanceamento atual.
- Não implementar envio de itens nesta etapa.
- Não transmitir snapshots ou inputs.
