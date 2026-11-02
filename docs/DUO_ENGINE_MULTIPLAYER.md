# Duo engine — preparação do estado por jogador

## Passo 1: PlayerRuntime

Nesta etapa, os campos abaixo foram agrupados em `GameEngine.local`, um objeto `PlayerRuntime`. O objeto representa o runtime do jogador local; a execução continua com um único jogador. Os valores iniciais e os pontos de reset existentes foram preservados por renome mecânico.

| Campo | Origem no motor | Passos 2 e 3: trabalho ainda necessário |
|---|---|---|
| `attackTimer` | Campo privado do motor; cadência do ataque automático | Passo 2: associar a cada entidade de jogador e passar a entidade aos fluxos de combate. Passo 3: validar isolamento dos timers em N jogadores. |
| `combatLockTimer` | Campo privado; bloqueio temporário da coleta após combate | Passo 2: mover para o estado da entidade e usar no fluxo individual de coleta. Passo 3: validar independência entre jogadores. |
| `weaponSide` | Campo privado; lado/pose da arma | Passo 2: associar à entidade que possui a arma. Passo 3: validar animação e disparo por jogador. |
| `gatheringTimer` | Campo privado; cadência da coleta | Passo 2: associar à entidade e aos métodos de coleta. Passo 3: validar coleta simultânea sem alterar a ordem compartilhada dos recursos. |
| `stepDistance` | Campo privado; distância acumulada para passos | Passo 2: mover para a entidade e atualizar por movimento individual. Passo 3: validar áudio/animação de passos por jogador. |
| `stepFoot` | Campo privado; pé alternado na animação de passos | Passo 2: mover para a entidade. Passo 3: validar alternância independente. |
| `stepTarget` | Campo privado; limiar da próxima passada | Passo 2: mover para a entidade. Passo 3: validar cadência individual. |
| `mageAttackCount` | Campo privado; contador de ataques do Mago para explosão | Passo 2: mover para a entidade/classe do jogador que dispara. Passo 3: validar contagem independente por Mago. |
| `archerHealArrowCount` | Campo privado; contador de flechas para cura do Arqueiro | Passo 2: mover para a entidade e seu fluxo de projéteis. Passo 3: validar cura atribuída ao Arqueiro correto. |
| `healthTransitionRemaining` | Campo privado; vida pendente durante troca de classe | Passo 2: mover para a entidade. Passo 3: validar transições individuais sem alterar fórmula/ordem numérica. |
| `healthTransitionRate` | Campo privado; taxa da transição de vida | Passo 2: mover para a entidade. Passo 3: validar evolução individual da vida. |
| `enemyDamageTimer` | Campo privado; temporização relacionada ao dano de inimigos | Passo 2: determinar e mover junto ao fluxo individual de dano. Passo 3: validar dano/feedback por jogador. |
| `druidBasicHitCount` | Campo privado; acertos básicos do Druida para cura | Passo 2: mover para a entidade e registrar acertos do jogador correto. Passo 3: validar contagem e cura individual. |
| `druidKillsSinceOrb` | Campo privado; abates do Druida para gerar orbe de cura | Passo 2: atribuir abates/orbes ao jogador correto. Passo 3: decidir propriedade e coleta de orbes compartilhados. |
| `druidOrbHealTimer` | Campo privado; temporização de cura/orbe do Druida | Passo 2: mover para a entidade e seus efeitos. Passo 3: validar temporização individual. |
| `druidContagionTimer` | Campo privado; intervalo de propagação da contaminação do Druida | Passo 2: mover para a entidade/efeitos do Druida. Passo 3: decidir resolução dos efeitos sobre inimigos compartilhados e ordem determinística. |
| `input` | Campo privado `InputState`; vetor de movimento | Passo 2: colocar entrada na entidade e manter `setMove` como adaptador do jogador local. Passo 3: fornecer entrada independente para cada jogador. |
| `keys` | Campo privado `Set<string>`; teclas pressionadas | Passo 2: colocar teclas na entidade e manter `setKey` como adaptador local. Passo 3: fornecer conjunto independente de teclas por jogador. |

### Estado compartilhado do mundo

Continuam compartilhados nesta etapa: árvores, pedras, algodão, casa, refinaria, tecelaria, carrinho, inimigos, tiros, orbes, drops, ciclo dia/noite, tempo decorrido, número da noite, hordas, seed/PRNG e kills da partida. Nenhuma dessas estruturas foi movida ou alterada aqui.

## Passo 2: fachada do jogador principal

O motor expõe `readonly players: PlayerEntity[]` com uma única instância `PrimaryPlayerView`, além do getter `primaryPlayer` que retorna `players[0]`. A fachada é um adaptador, não uma cópia de estado: `id` é sempre `local`; `classId`, `weapon`, `dead` e `bag` delegam com getters/setters para `state.classId`, `state.weapon`, `state.dead` e `state.inventory`; `pub` lê `state.player`; `runtime` lê `local`. Cada acesso consulta o `state` atual, portanto substituições feitas por `restart()`/`freshState()` não deixam referências públicas obsoletas. Nenhum uso preexistente de `this.state.*` foi migrado nesta etapa.

### Métodos que o Passo 3 migrará

- **Movimento/entrada:** `setKey`, `setMove`, `setClass`, `resolvePlayerObstacles`, `isPlayerAtTreeShadow`, `isPlayerAtRock`, `isPlayerAtCottonPlant` e a atualização individual executada por `update`.
- **Combate e tiros:** `autoAttack`, `moveShots`, `arrowHitsSolidObstacle`, `updateDruidEffects`, `registerDruidBasicHit` e `killEnemy`.
- **Coleta e construção:** `autoGather`, `gatherDist`, `rockGatherDist`, `hitRock`, `hitCottonPlant`, `collectStone`, `collectCotton`, `collectLinen`, `cutTree`, `collectWood`, `attractMaterials`, `buildHouse`, `buildRefinery`, `buildTecelaria`, `deliverCottonToTecelaria`, `deliverStonesToRefinery` e as operações de inventário/carrinho.
- **Inimigos e hordas:** `spawnHordeEnemy`, `enemyMovementDirection`, `moveEnemies`, `separateEnemies`, `resolveRockBoxCollisions` e `getLevelStats`.
- **XP/drops/orbes:** `collectXp`, `killEnemy` e os trechos de coleta/atração de drops e orbes dentro de `update` e `attractMaterials`.


Na etapa 3.1b, o segundo jogador será outro `PlayerEntity` com campos próprios. O contador `kills` continuará pertencendo ao estado compartilhado da partida, não a cada jogador.

## Decisões pendentes para a etapa 3.1b

A implementação ainda trata o mundo como se houvesse um único jogador nos pontos abaixo. Esta lista registra decisões necessárias; não implementa mudanças:

- **Alvo da perseguição dos slimes:** definir seleção de alvo entre jogadores vivos, desempate determinístico e comportamento quando todos estiverem mortos.
- **Nascimento da horda:** definir de qual jogador/posição a horda usa como referência, mantendo a sequência do PRNG bem definida.
- **Atração de drops e orbes:** decidir se cada drop/orbe pertence a um jogador, é atraído pelo mais próximo ou segue outra regra; definir desempates e ordem de atualização.
- **Carrinho puxado:** definir qual jogador pode puxar/soltar e como tratar jogadores próximos ou simultâneos.
- **Casa e baú com dono:** decidir se inventário/armazenamento é individual ou compartilhado e quem pode interagir.
- **Câmera:** decidir câmera individual, compartilhada ou outra composição para jogadores separados.
- **HUD:** definir jogador primário, indicadores individuais e apresentação de vida/XP/classe/inventário de cada participante.
- **Morte e espectador:** definir se a partida continua para sobreviventes, como o jogador morto observa e quando a partida termina.
- **Dificuldade com dois jogadores:** confirmar a regra de escala (incluindo a hipótese ×1,3) e como ela afeta inimigos/hordas sem alterar o Solo.
- **XP e loot individuais:** decidir autoria e divisão de XP, drops, abates, cura e recompensas quando vários jogadores participarem do mesmo combate.

## Limites desta etapa

- Não altera `GameSnapshot`, `emit` ou `visibleStateKey`.
- Não altera `state.player`, `state.inventory`, `state.classId`, CONFIG, UI, balanceamento, fórmulas ou eventos.
- Não adiciona segundo jogador, rede ou regras de multiplayer.
- A equivalência do Solo não foi executada nesta etapa; deverá ser validada externamente com as sementes e comparações determinísticas previstas.
