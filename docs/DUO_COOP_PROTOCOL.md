# Fíbula Online — protocolo cooperativo Duo

## 1. Conceito oficial: cada jogador no seu mundo

Dois jogadores formam uma dupla no lobby compartilhado. Depois que o convidado marca **PRONTO**, o anfitrião pode iniciar. A partida começa nos dois dispositivos de forma independente e sincronizada.

Cada jogador executa seu próprio mundo: mapa, casa, carrinho, inventário, recursos, inimigos e construções são individuais. Nada disso é transmitido entre os participantes.

Durante a partida, nunca transmitir:
- posição, movimento ou vida em tempo real;
- ataques, projéteis ou dano;
- inimigos ou estado de combate;
- recursos, drops ou coleta;
- inventário, equipamentos ou construções;
- casa, carrinho ou estado do mapa.

Nada é compartilhado automaticamente: XP, abates, drops, materiais e equipamentos permanecem individuais. O envio de itens ocorre somente no lobby, por iniciativa dos jogadores, por meio da troca prevista na PR #264.

## 2. Dificuldade cooperativa

A dificuldade cooperativa deriva diretamente do alvo de horda produzido pelo Solo atual:

`dificuldadeCoop = alvoHordaSoloAtual × 1,7`

Não existe tabela própria de inimigos para o Duo. Se o cálculo ou balanceamento do Solo mudar, o Duo acompanha a mesma regra.

Exemplos de alvo total:
- 10 → 17
- 20 → 34
- 30 → 51

O total é dividido entre os dois jogadores vivos. A divisão deve usar aritmética inteira, sem ponto flutuante, para que cliente e servidor obtenham sempre o mesmo resultado. Com total ímpar, o primeiro participante na ordem estável recebe o excedente: 17 resulta em 9 e 8.

O servidor calcula e entrega o alvo individual de cada jogador. O cliente nunca informa a quantidade de inimigos que deseja receber. A horda é uma só, dividida entre os dois mundos.

Quando houver somente um jogador vivo, ele recebe 100% da pressão cooperativa a partir da próxima noite. O multiplicador permanece em 1,7×; não retorna a 1,0×.

## 3. Fluxo de uma noite

1. Os dois jogadores recebem do servidor os alvos individuais da noite.
2. Cada um enfrenta sua própria parte da horda no próprio mundo.
3. Quando limpa sua horda, o jogador envia o relato **“terminei”**.
4. Ele continua jogando normalmente no próprio mundo: pode minerar, coletar, caminhar, construir e usar carrinho e inventário.
5. A noite continua escura. Ele não amanhece sozinho nem inicia outra horda enquanto aguarda.
6. Quando o outro jogador também terminar, os dois amanhecem juntos. Segue o dia e depois a próxima noite, com nova divisão da horda.
7. Se o parceiro já morreu ou saiu, quem terminou não espera: amanhece imediatamente.
8. Se estava aguardando e o parceiro morrer ou cair durante a espera, amanhece imediatamente.

A espera bloqueia somente o avanço conjunto do ciclo; não congela o mundo local do jogador que já terminou.

## 4. Morte e queda de conexão

### Morte

- Quem morre envia **“morri”**, sai da partida e volta ao próprio lobby individual.
- Seu progresso individual é salvo normalmente no próprio lobby.
- Não existe espectador e não há transmissão do mapa do sobrevivente.
- O sobrevivente continua jogando no próprio mapa.
- A partir da PRÓXIMA noite — nunca no meio de uma noite — o sobrevivente recebe 100% da pressão cooperativa (por exemplo, 17).
- A dificuldade nunca volta para 1,0×.

### Queda de conexão

Se uma mensagem que exige resposta não chegar dentro do limite técnico de 15 segundos, a sincronização é considerada perdida. Não há contador visível e o jogo não deve travar enquanto aguarda.

- Quem caiu recebe o aviso **“queda de conexão ou sem resposta”** e volta ao lobby individual.
- O progresso individual é salvo e sincronizado quando houver conexão, usando o fluxo Solo offline já existente.
- Quem permaneceu conectado segue como se o parceiro tivesse morrido e recebe 100% da pressão a partir da próxima noite.
- Não há reconexão à partida, tentativas repetidas ou polling agressivo.
- Não há sinais de presença durante a partida. A comunicação acontece principalmente no fim das noites e nos eventos “terminei” e “morri”.
- O heartbeat do lobby continua existindo somente no lobby. A expiração por “partida sem heartbeat” deve ser revista na etapa de servidor.

## 5. Servidor — planejado, nada criado nesta etapa

O servidor será a fonte de verdade para a coordenação da sessão. O estado persistente mínimo planejado é:

- **Sessão da dupla:** sala, status, noite atual, instante de liberação do dia e resultado cooperativo congelado.
- **Jogadores da sessão:** vivo, morto ou caiu; semente própria de cada jogador.
- **Registros por noite:** alvo total, alvo individual de cada jogador e horário de cada relato.

Os relatos “terminei” e “morri” passam pelo servidor. É o servidor que decide quando liberar o amanhecer; um cliente nunca avisa o outro diretamente como fonte de verdade.

### Idempotência e concorrência

- Um relato vale uma única vez por combinação de sessão, noite e jogador.
- Repetir o mesmo relato devolve o resultado já gravado, sem avançar o ciclo novamente.
- O avanço só ocorre se a noite atual no servidor for exatamente a noite relatada.
- A operação usa compare-and-set com trava de linha.
- Relato atrasado de noite anterior recebe o resultado já guardado para aquela noite.
- Relato de jogador já eliminado recebe o estado **“eliminado”**.

### Sementes e relógio

- Cada jogador recebe do servidor uma semente própria, derivada da semente da sessão.
- O servidor informa o instante de liberação do dia.
- Cada cliente conta o dia localmente a partir do recebimento dessa autorização.
- O fim da noite é determinado pelo evento de horda limpa; não depende de relógios locais acumulados. Assim, não há deriva acumulada entre ciclos.

### Validação e limite honesto

O servidor não presume que uma mensagem do cliente seja verdadeira. Confere sessão, noite esperada, estado dos jogadores e tempo mínimo plausível por noite, usando a mesma lógica de plausibilidade já aplicada em `fibula_finish_solo_match`.

O jogo roda no cliente. Dois clientes adulterados em conluio ainda podem forjar noites no ritmo mínimo plausível. Esse é o mesmo teto de risco existente no Solo; a arquitetura não promete impedir conluio entre clientes comprometidos.

**Nenhuma tabela, função ou migration de servidor será criada nesta etapa D0.**

## 6. Ranking cooperativo

O ranking cooperativo contabiliza somente as noites em que os dois jogadores estavam vivos e concluíram suas respectivas hordas.

Quando o primeiro jogador morre ou cai, o resultado cooperativo é encerrado e congelado. A continuação do sobrevivente não soma ao resultado Duo; ela continua contando somente no ranking individual.

O resultado cooperativo vem dos registros gravados e validados pelo servidor, nunca de números enviados livremente pelo cliente.

## 7. Arquitetura sugerida

- **PlayerEntity:** representa o jogador e seu mundo individual. Na prática, cada celular executa uma instância própria de `GameEngine`.
- **DuoSession:** mantém os dados mínimos da dupla, a sessão e o controle de sobrevivência e resultado.
- **DuoCycleSync:** coordena o encerramento das noites, a verificação das hordas, os estados vivo/morto, a pressão da próxima noite e a autorização do avanço conjunto.

Esses nomes descrevem responsabilidades planejadas; não significam que os módulos já estejam implementados.

## 8. Reaproveitar, adaptar e abandonar

### Reaproveitar

- Login Arena.
- Amigos e presença de lobby.
- Convites e salas Duo.
- Criar/entrar em sala, pronto do convidado, iniciar pelo anfitrião e sair.
- Limite de partidas simultâneas da PR #255.
- Troca voluntária de itens no lobby prevista na PR #264.
- Regras de coop em `src/game/coop/rules.ts`, adaptando o arredondamento para aritmética inteira.
- Validação de plausibilidade já usada pelo Solo.

### Adaptar

- Início da partida: criar a sessão e fornecer uma semente própria para cada jogador.
- Expiração por heartbeat durante uma partida: rever na etapa de servidor, pois heartbeat de lobby não representa atividade de partida.
- Documentos de protocolo: substituir o contrato antigo pelo modelo de mundos independentes.

### Abandonado

- Segundo jogador dentro do mesmo motor/mundo.
- Snapshots e inputs transmitidos por Realtime.
- Host autoritativo simulando o mundo compartilhado.
- Espectador e transmissão do mapa do sobrevivente.
- Reconexão à partida.
- Tipos de snapshot/input atualmente definidos em `src/game/coop/protocol.ts`: não serão usados pela nova arquitetura. O arquivo não é alterado nesta etapa; a remoção desses tipos fica reservada para uma etapa própria.

## 9. Plano de etapas

- **D0 — Documentação:** registrar a nova arquitetura cooperativa. Somente documentação.
- **D1 — Regra de horda:** criar uma função única para obter o alvo de horda do Solo e calcular ×1,7 usando aritmética inteira; incluir harness de equivalência para garantir que o Solo permaneça idêntico.
- **D2 — Gate opcional no motor:** adicionar o gate opcional “noite limpa, aguardando” e aceitar alvo externo. Desligado, o comportamento Solo deve permanecer idêntico.
- **D3 — Servidor:** preparar rascunho de tabelas e funções em arquivo, sem aplicar; exige aprovação prévia.
- **D4 — Cliente:** implementar o módulo `DuoCycleSync`.
- **D5 — UI:** ligar início da partida, aviso do parceiro, morte e queda de conexão.
- **D6 — Resultado:** obter resultado e ranking cooperativo a partir dos registros do servidor.
- **D7 — Teste real:** testar com duas contas o fim de noite, morte, queda de conexão e mensagens repetidas.

## 10. Lobby e salas (já implementado)

Esta seção registra as funcionalidades existentes do lobby que continuam válidas e serão reaproveitadas pela nova arquitetura. Elas não significam que a sincronização dos mundos durante a partida já esteja implementada.

- Convites entre amigos.
- Salas Duo persistentes.
- O convidado pode marcar **PRONTO**.
- O anfitrião inicia a partida depois que o convidado estiver pronto.
- Participantes podem sair da sala.
- Existe limite de partidas simultâneas, tratado pela implementação da PR #255.

O lobby compartilhado termina na coordenação da entrada da dupla. Depois do início, cada participante joga no próprio mundo independente.

## 11. Escopo desta D0

Esta etapa altera somente documentação. Não implementa sessão de servidor, sincronização, cálculo de horda, gate no motor, UI, ranking ou troca de itens.

Não altera o modo Solo, seu motor, suas regras, seu balanceamento ou seus salvamentos. Não altera `src/game/coop/protocol.ts`; os tipos antigos de snapshot/input ficam apenas registrados como abandonados até uma etapa própria de remoção.
