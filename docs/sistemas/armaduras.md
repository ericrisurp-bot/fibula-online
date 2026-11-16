# Sistema de armaduras — dados e fórmulas A1

> Esta etapa contém somente dados e funções puras. Nada aqui está ligado ao jogo: nenhum fluxo de fabricação, inventário, equipamento, combate ou UI importa ou utiliza `src/game/armor.ts`. A flag `CONFIG.rulesV2.enabled` continua `false`.

## Peças e tipos

O conjunto tem cinco peças: capacete, peitoral, calça, bota e luva.

- **Tipo 1 — Couro**
- **Tipo 2 — Bronze**

Os atributos possíveis dependem exatamente do tipo e da peça. A tabela abaixo mostra os valores de referência no teto do SURP: lendário, 1 estrela e `roll = 1.0`. A ausência de um atributo significa que ele não é permitido naquela peça/tipo.

| Tipo | Peça | Armadura | Vida | Mobilidade | Esquiva |
|---|---|---:|---:|---:|---:|
| Couro | Capacete | 0.8 | 12 | 2 | — |
| Couro | Peitoral | 1.5 | 20 | 3 | — |
| Couro | Calça | — | 15 | 6 | — |
| Couro | Bota | — | — | 12 | — |
| Couro | Luva | 0.6 | — | 2 | 0.02 |
| Bronze | Capacete | 1.5 | 20 | — | — |
| Bronze | Peitoral | 2.5 | 35 | — | — |
| Bronze | Calça | — | 25 | 3 | — |
| Bronze | Bota | — | — | 6 | — |
| Bronze | Luva | 1.0 | — | — | 0.02 |

Esquiva é armazenada como fração: `0.02` representa 2%.

Os dados correspondentes estão em `ARMOR_PIECE_ATTRIBUTES[type][piece]` e `ARMOR_BASE_VALUES[type][piece]`.

## Raridade e estrelas

A fração de raridade é:

| Raridade (`CoreRarity`) | Fração | Máximo de estrelas |
|---|---:|---:|
| Normal | 0.2 | 1 |
| Common | 0.4 | 2 |
| Uncommon | 0.6 | 3 |
| Rare | 0.8 | 4 |
| Legendary | 1.0 | 5 |

O multiplicador de estrelas é `1 + 0.25 × (estrelas - 1)`. As estrelas devem ser um inteiro entre 1 e o máximo permitido pela raridade; valores fora da faixa geram `Error`.

A fórmula de cada atributo de armadura é:

`valor = valor-base × fração-da-raridade × multiplicador-de-estrelas × roll`

O `roll` é recebido do chamador, deve estar entre 0.5 e 1.0 e nunca é sorteado por este módulo. `roll = 1.0` representa o teto do SURP. A função também rejeita atributos que não pertencem à lista permitida da peça/tipo.

Conferência dos tetos em relação ao lendário 1 estrela:

| Raridade e estrelas | Multiplicador resultante |
|---|---:|
| Normal 1★ | 0.2× |
| Common 2★ | 0.5× |
| Uncommon 3★ | 0.9× |
| Rare 4★ | 1.4× |
| Legendary 5★ | 2.0× |

## Forro

Cada peça recebe um forro, com valor de referência lendário, 1 estrela e `roll = 1.0`:

| Forro | Efeito | Valor-base |
|---|---|---:|
| Algodão | Vida | +6 |
| Linho | Mobilidade | +2 |
| Couro refinado | Ganho de XP dentro da partida | +0.015 (+1.5%) |

O valor do forro usa a mesma escala de raridade × estrelas × `roll` da armadura. Para armaduras, o `roll` do forro é o mesmo roll do núcleo da peça: média de `valor / referência da raridade` entre todos os atributos do núcleo, limitada a 0,5–1,0; núcleo SURP usa 1,0. A função recebe o roll já calculado; não o sorteia. Esta regra poderá ser revista futuramente.

**Couro refinado vale somente para o XP obtido dentro da partida.** Não representa bônus de XP geral ou de conta.

## Receitas

Os números abaixo são materiais por peça: material-base + material de forro.

| Tipo | Peça | Base | Forro |
|---|---|---:|---:|
| Couro | Capacete | 10 | 5 |
| Couro | Peitoral | 10 | 5 |
| Couro | Calça | 10 | 5 |
| Couro | Bota | 10 | 5 |
| Couro | Luva | 10 | 5 |
| Bronze | Capacete | 12 | 6 |
| Bronze | Peitoral | 15 | 8 |
| Bronze | Calça | 15 | 8 |
| Bronze | Bota | 12 | 6 |
| Bronze | Luva | 12 | 5 |

- Conjunto completo de couro: 75 materiais no total (50 base + 25 forro).
- Conjunto completo de bronze: 99 materiais no total (66 base + 33 forro).

`ARMOR_RECIPES[type][piece]` contém os campos `base` e `lining`. São apenas dados; não há consumo nem lógica de inventário nesta etapa.

## Aproveitamento por classe

O valor calculado de cada atributo pode ser multiplicado pelo aproveitamento da classe:

| Classe | Vida | Armadura | Mobilidade | Esquiva |
|---|---:|---:|---:|---:|
| Guerreiro | 1.2 | 1.3 | 0.7 | 0.8 |
| Mago | 0.9 | 0.8 | 1.0 | 1.0 |
| Druida | 1.0 | 0.9 | 1.0 | 1.0 |
| Arqueiro | 0.8 | 0.7 | 1.3 | 1.2 |

Os multiplicadores ficam em `ARMOR_CLASS_USAGE`; `applyClassUsage(classId, attribute, value)` aplica o multiplicador ao valor informado.

Esse aproveitamento de esquiva da armadura é diferente da esquiva-base por classe já existente em `CONFIG.player.classDodge`. Um não substitui o outro.

## Limites e decisões resolvidas

- **Núcleo de armadura por peça — resolvido:** cada núcleo identifica uma peça (capacete, peitoral, leggings/calça, bota ou luva) e carrega a união dos atributos permitidos para essa peça em couro e bronze, derivada de `ARMOR_PIECE_ATTRIBUTES`.
- **Roll do forro — resolvido:** usa o mesmo roll do núcleo da peça, calculado pela média de `valor / referência da raridade` dos atributos do núcleo, limitado a 0,5–1,0; SURP equivale a 1,0. A regra pode ser revista futuramente.
- **Acúmulo entre peças — resolvido:** soma simples dos bônus, respeitando os tetos globais descritos abaixo.
- **Redução de dano pela armadura:** teto de 60% (`CONFIG.rulesV2.armorMaxReduction = 0.6`). X pontos de armadura representam X% menos dano, respeitando o teto; cada golpe ainda causa no mínimo 1 de dano.
- **Esquiva:** teto total de 35%, somando esquiva-base da classe (`CONFIG.player.classDodge`) + esquiva da luva + esquiva dos acessórios.

## A4.2 — camada de dados da fabricação no cliente

O módulo `src/game/armorCrafting.ts` define somente o contrato de dados no cliente. Ele não é importado por telas nem conectado a qualquer fluxo do jogo.

### Contrato RPC e tabela

- `fibula_craft_armor(p_piece, p_type, p_lining, p_core_item_id)`: retorna um objeto `{ armor, inventory }`. A armadura contém os campos persistidos; os atributos são uma lista de 1 a 3 objetos `{ key, value }`.
- `fibula_delete_armor(p_armor_id)`: recebe o UUID da armadura e retorna boolean.
- `fibula_armors`: tabela legível pelo próprio jogador, com `id, piece, type, rarity, stars, surp, attributes, lining, lining_value, created_at`. A listagem do cliente ordena por `created_at` decrescente e limita o resultado a 50 linhas.
- Peças: `capacete | peitoral | calca | bota | luva`.
- Tipos: `couro | bronze`.
- Forros: `algodao | linho | couro_refinado`.
- `attributes` aceita somente chaves permitidas em `ARMOR_PIECE_ATTRIBUTES[type][piece]`; cada valor precisa ser finito e maior que zero.
- `stars` é inteiro de 1 até o teto definido por `ARMOR_MAX_STARS[rarity]`. `lining_value` também precisa ser finito e maior que zero.
- Os valores de `attributes` e `lining_value` são armazenados na escala de 1★. O cliente aplica `armorStarMultiplier` ao consultar o valor efetivo, sem aplicar aproveitamento por classe.

### Materiais e raridade

| Tipo / escolha | Item-base |
|---|---|
| Couro | `wolf_hide` |
| Bronze | `bronze` |
| Forro algodão | `cotton` |
| Forro linho | `linen` |
| Forro couro refinado | `refined_leather` |

A quantidade de cada material vem de `ARMOR_RECIPES[type][piece]`. Núcleo, material-base e material de forro devem ter sempre a mesma raridade. Itens normais usam o ID sem sufixo; nas demais raridades, o ID recebe `:<rarity>` (por exemplo, `wolf_hide:rare` e `cotton:rare`).

### Situação de implementação

**O servidor da A4.1 ainda não foi aplicado ao banco.** As RPCs e a tabela descritas acima são contrato decidido, não objetos disponíveis para execução neste momento. A A4.2 apenas prepara as funções tipadas do cliente para esse contrato: não tenta chamar as RPCs durante esta etapa, não altera banco, não consome materiais e não conecta fabricação, inventário, equipamento, combate ou UI ao jogo. Nada está ligado ao jogo.

## Limites desta etapa

Esta etapa contém apenas dados e funções puras, além da camada de dados cliente isolada. Nenhuma regra está conectada ao jogo: não há integração com telas, fluxo de fabricação, inventário, equipamento ou combate. `CONFIG.rulesV2.enabled` permanece `false`.

## A4.3a — painel de fabricação na Alfaiataria (couro)

A tela de fabricação de armadura de couro fica na estação **Alfaiataria** e é controlada exclusivamente por `CONFIG.rulesV2.armorCraftingEnabled`, cujo valor inicial é `false`.

- Com o interruptor desligado, a Alfaiataria permanece exatamente na apresentação anterior: espaços de prévia, tecidos no Baú e botão **Costurar · Em breve**. A Bigorna e a fabricação de armas não são alteradas.
- Com o interruptor ligado, a tela substitui esses espaços, a zona de tecidos e o botão de costura pelo painel de fabricação de couro, mantendo a cena visual da Alfaiataria.
- O jogador escolhe somente um núcleo de armadura revelado e um forro obrigatório (algodão, linho ou couro refinado). A peça é determinada pelo `equipmentType` do núcleo. Núcleos legados ou que não passam em `armorCoreRoll(core)` não são exibidos.
- Os materiais não são escolhidos manualmente: o painel calcula a receita de `armorMaterialItemIds` e mostra quanto existe e quanto falta no Baú. Material-base e material do forro precisam ter a mesma raridade do núcleo.
- A prévia é informativa e sempre em 1★. O roll de cada atributo é derivado do valor do núcleo dividido pela fração da raridade, limitado a 0,5–1,0; núcleo SURP usa 1,0. O forro usa `armorCoreRoll(core)`. O resultado definitivo é sempre o retornado pelo servidor.
- Ao fabricar, o cliente aplica somente o inventário retornado pela RPC, limpa a seleção e exibe a quantidade de estrelas recebida. Em erro, apresenta a mensagem e tenta atualizar o Baú.
- A fabricação exige conexão, Baú confirmado e materiais suficientes. Não existe nesta etapa botão para abrir o Arsenal; isso pertence à A5.

**O servidor da A4.1 ainda não foi aplicado ao banco.** Portanto, o interruptor permanece desligado por padrão e, enquanto estiver `false`, o cliente não chama `listMyArmors` nem qualquer RPC nova de fabricação de armadura. Nenhuma integração fica ativa por padrão.



## A4.3b — aba Armaduras na Bigorna (bronze, Tipo 2)

Com `CONFIG.rulesV2.armorCraftingEnabled` ligado, a Bigorna apresenta duas abas acessíveis: **Armas** e **Armaduras**. A aba **Armas** mantém o fluxo atual de fabricação de armas; a aba **Armaduras** reutiliza `ArmorCraftPanel` com `type="bronze"` e as mesmas integrações de inventário, Baú e atualização de `craftedArmors` usadas pela Alfaiataria.

- A aba Armaduras lista exclusivamente núcleos revelados válidos de armadura; o próprio painel valida a categoria e o roll do núcleo.
- O material-base do Tipo 2 é `bronze`; o material do forro é escolhido entre algodão, linho e couro refinado. Quantidades e raridade seguem `ARMOR_RECIPES` e `armorMaterialItemIds` do módulo `src/game/armor.ts` / camada `src/game/armorCrafting.ts`.
- A Alfaiataria continua usando somente `type="couro"` (Tipo 1).
- A seleção da aba é estado local da tela. Alternar entre abas não reinicia os estados de fabricação mantidos no `App` nem inicia RPC por si só. A fabricação continua dependendo da ação explícita no painel correspondente.
- Com `armorCraftingEnabled = false`, a barra de abas e o painel de bronze não são renderizados; a Bigorna mantém o conteúdo de armas anterior e o estado inicial da aba é **Armas**.

**Limite de servidor:** o servidor da A4.1 ainda não foi aplicado ao banco. Não considerar as RPCs de fabricação de armadura disponíveis até a aplicação e validação dessa etapa.


## Armadura equipada (A5.1)

A camada de dados de equipamento define um **conjunto único de armaduras compartilhado por todas as classes**: cada personagem mantém no aparelho uma seleção por espaço (capacete, peitoral, calça, bota e luva), com no máximo uma peça em cada espaço. As seleções são persistidas localmente por usuário em `fibula:equipped-armors:<userId>`; não há persistência remota nem sincronização entre aparelhos nesta etapa. Se uma peça selecionada não existir mais na lista de armaduras fabricadas ou não corresponder ao espaço selecionado, ela é ignorada sem erro.

O cálculo agregado segue esta ordem, para cada peça equipada:

1. Obter o valor efetivo de cada atributo com estrelas (`armorEffectiveValue`) e o valor efetivo do forro (`armorLiningEffectiveValue`).
2. Aplicar uma única vez o aproveitamento da classe (`applyClassUsage`) aos atributos de armadura, vida, mobilidade e esquiva. O forro de algodão (vida) e de linho (mobilidade) também recebe esse aproveitamento; couro refinado soma XP de partida sem multiplicador de classe.
3. Somar simplesmente os resultados de todas as peças, sem aplicar tetos durante a agregação. A camada `armorEquipment.ts` é o único ponto em que o aproveitamento por classe é aplicado; o motor da A5.3 não deve reaplicá-lo.
4. Aplicar os limites somente ao converter os totais para seus efeitos finais: redução de dano por armadura limitada a **60%** (`CONFIG.rulesV2.armorMaxReduction`) e esquiva total limitada a **35%** (esquiva-base da classe + armadura e demais fontes aplicáveis).

`armorReductionFromPoints` e `armorTotalDodge` expõem as conversões com esses limites. Esta etapa entrega apenas persistência local, resolução de seleções e cálculo puro dos bônus agregados. A interface de equipamento será feita na **A5.2** e a integração com o motor na **A5.3**.


## A5.2 — Armaduras fabricadas no Arsenal

A interface de equipamento das armaduras é controlada exclusivamente por `CONFIG.rulesV2.armorCraftingEnabled`.

- Com a chave desligada, a grade, os itens do inventário, os diálogos e os bônus de armadura não são renderizados; a seleção local de armaduras não é lida e a listagem `listMyArmors` não é chamada. Os cinco espaços legados permanecem com a apresentação e os dados anteriores.
- Com a chave ligada, capacete, peitoral, leggings/calça, bota e luva mostram as armaduras fabricadas equipadas, usando os assets `/assets/armors/zeryn-*.png` para couro e `/assets/armors/vark-*.png` para bronze. A raridade controla o brilho e as estrelas são exibidas junto à peça.
- As armaduras fabricadas não equipadas aparecem no inventário do Arsenal e são contadas na capacidade exibida. Armas e os espaços de colar, pulseira, cinto e bolsa mantêm seus fluxos anteriores.
- O conjunto equipado é único e compartilhado entre as abas Principal e Secundário. A seleção fica em `fibula:equipped-armors:<userId>`; ao carregar com sucesso a lista de armaduras, seleções inexistentes ou incompatíveis são removidas e persistidas novamente. Falha na listagem não apaga a seleção salva nem marca os dados como carregados.
- O diálogo oferece Equipar, Desequipar, Detalhes e Excluir. A exclusão só atualiza a lista e a seleção local após confirmação de sucesso de `deleteArmor`; sem conexão ou cliente, nenhuma peça é removida localmente.
- Os detalhes mostram tipo, raridade, estrelas, SURP, atributos efetivos com estrelas e valor efetivo do forro, sem aproveitamento de classe.
- O resumo por classe reutiliza exclusivamente `computeArmorBonuses`, `armorReductionFromPoints` e `armorTotalDodge`. Mostra redução de dano limitada a 60%, esquiva total limitada a 35% e XP da partida quando houver couro refinado.
- Os dois cálculos de PD no Arsenal e no Status recebem `armorBonuses` somente com a chave ligada. O Status aguarda também a conclusão bem-sucedida da listagem de armaduras. A integração dos bônus no motor continua reservada à A5.3; esta etapa não altera `engine.ts`.

O sistema antigo de itens de equipamento do Arsenal (`arsenalItems`) e sua persistência local não são apagados nem migrados. Os cinco espaços de armadura apenas deixam de exibi-los enquanto a chave estiver ligada; com a chave desligada, o comportamento legado permanece.
