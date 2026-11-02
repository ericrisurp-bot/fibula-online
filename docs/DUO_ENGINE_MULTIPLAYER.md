# Duo — arquitetura de mundos independentes

## Decisão oficial

Este documento substitui o plano anterior de converter o motor em um mundo compartilhado com dois personagens.

O Duo será composto por **duas partidas locais independentes**, ligadas por uma sessão cooperativa mínima. Cada jogador executa um GameEngine próprio no seu dispositivo/navegador.

## Base reaproveitada

- `PlayerEntity` e `PrimaryPlayerView` continuam representando o jogador local de cada GameEngine.
- `PlayerRuntime` continua agrupando os temporizadores e entradas locais.
- Cada cliente mantém seu próprio `GameSnapshot`, mapa, seed, recursos, casa, carrinho, inventário, inimigos, XP, drops e kills.
- A fachada não deve ser usada para transformar os dois mapas em um único mundo.

Cada jogador recebe uma seed individual derivada da seed comum da sessão e do seu ID. Assim, os dois mundos são reproduzíveis, mas não geram o mesmo mapa e não compartilham a sequência pseudoaleatória.

## Responsabilidades

### GameEngine local

Responsável exclusivamente pela simulação do próprio jogador:

- movimento, combate, inimigos e horda local;
- coleta, construção, casa e carrinho;
- inventário, XP, drops e progressão;
- morte e salvamento individual;
- execução local enquanto aguarda o parceiro.

O motor Solo deve manter o comportamento atual quando não recebe configuração cooperativa.

### DuoSession

Mantém apenas a identidade da dupla e o estado mínimo da sessão:

- roomId e matchId;
- IDs dos dois participantes em ordem estável;
- noite atual;
- estado vivo/morto;
- estado de conclusão da horda de cada participante;
- pressão total e alocação da próxima noite;
- estado do resultado cooperativo.

Não guardar snapshots, coordenadas, inventários, inimigos ou estado completo dos mapas.

### DuoCycleSync

Coordena a barreira de fim de noite:

- recebe uma conclusão local por jogador;
- registra evento único de morte;
- permite que quem terminou primeiro continue jogando localmente;
- impede apenas a transição para o próximo amanhecer;
- libera o ciclo quando todos os participantes vivos concluírem a própria horda;
- encerra a sessão quando os dois jogadores morrerem;
- calcula a pressão da próxima noite com base no Solo atual × 1,7.

## Regra de horda

A cada noite, consultar o alvo que o Solo atual produziria para aquela noite e aplicar o multiplicador 1,7.

`totalDuo = round(totalSoloAtual × 1.7)`

Com dois vivos, dividir o total igualmente; quando ímpar, o primeiro ID na ordem estável recebe um inimigo a mais.

Com um sobrevivente, ele recebe todo o total. A morte ocorrida durante uma noite só altera a distribuição da noite seguinte.

Não duplicar ou manter uma cópia fixa da progressão do Solo. O cálculo deve chamar a regra atual do Solo, para futuras alterações de balanceamento serem herdadas automaticamente.

## Barreira de fim de noite

A conclusão da horda local não pausa o mundo:

- movimento continua;
- mineração e coleta continuam;
- construção e organização continuam;
- o jogador pode usar casa, carrinho e inventário;
- nenhum novo inimigo/horda é criado depois que sua horda foi concluída;
- o relógio do ciclo não avança para o amanhecer até a sincronização da dupla.

O parceiro continua enfrentando os inimigos do próprio mapa. Quando ambos estiverem resolvidos (cada jogador vivo concluiu a horda, ou o participante morreu), os sobreviventes liberam o próximo ciclo. Se ambos morrerem, a sessão é encerrada.

## Morte, desconexão e ranking

- Morte encerra a sessão daquele jogador e o devolve ao lobby.
- Não há espectador nem reconexão.
- O sobrevivente continua localmente.
- Um evento de morte altera a pressão somente na próxima noite.
- Se houver desconexão sem evento explícito, a indisponibilidade será decidida na sincronização de fim de noite.
- Não haverá heartbeat ou polling durante a partida.
- O prazo máximo para uma resposta ausente na barreira ainda precisa ser definido antes da integração.
- Ranking cooperativo acumula somente enquanto os dois estiverem vivos; depois da primeira morte, congela. A continuação do sobrevivente não aumenta o resultado da dupla.

## Itens, XP e drops

São sempre individuais durante a partida. Não há XP compartilhado, drops duplicados, inventário sincronizado ou recursos transferidos automaticamente. A troca é feita no lobby, voluntariamente.

## Plano incremental

1. **Contrato e regras puras (esta etapa):** substituir o protocolo de snapshots/inputs por eventos mínimos; implementar cálculo 1,7×, divisão determinística, barreira de noite e seed individual; atualizar esta documentação.
2. **Integração do motor local:** adicionar modo cooperativo opcional ao GameEngine sem alterar o caminho Solo; permitir estado local `awaiting_partner` que mantém movimento/coleta, mas bloqueia somente o avanço do ciclo.
3. **Transporte de eventos:** conectar eventos privados de morte e conclusão de noite; implementar sequência, validação, sincronização e prazo de resposta ausente. Sem heartbeat ou polling durante a partida.
4. **Entrada/saída do lobby:** reaproveitar as salas atuais, iniciar dois GameEngines locais com seeds derivadas e retirar heartbeat/polling de lobby enquanto a partida estiver ativa.
5. **Persistência e ranking:** salvar resultados individuais e congelar o resultado Duo na primeira morte, com validação de servidor.
6. **Testes:** validar Solo inalterado; testar 17→9/8, 17→17, morte durante a noite, primeiro jogador aguardando enquanto coleta, avanço conjunto, desconexão, mensagens duplicadas e fim da sessão.

## Limites desta etapa

- Não altera `src/game/engine.ts`, `src/App.tsx`, UI ou CONFIG.
- Não altera Supabase, migrations, policies ou dados.
- Não muda o lobby existente.
- Não declara o modo Duo jogável nesta etapa.
- Build/testes não devem ser declarados como executados se não forem realmente rodados.
