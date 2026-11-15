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

O valor do forro usa a mesma escala de raridade × estrelas × `roll` da armadura. O `roll` é fornecido pelo chamador; esta etapa não define sua origem nem sorteia o valor.

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

## Decisões em aberto

1. **Núcleo de armadura:** será específico por peça ou genérico?
2. **Roll do forro:** de onde virá o `roll` do forro? A função recebe esse valor, mas esta etapa não escolhe sua origem.
3. **Acúmulo entre peças:** qual será a regra de acúmulo dos atributos quando várias peças da mesma classe estiverem equipadas?

Essas decisões não foram presumidas nem implementadas nesta etapa.
