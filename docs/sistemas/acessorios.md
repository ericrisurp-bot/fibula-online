# Acessórios — especificação J2

**Status:** especificação aprovada de dados e valores. Esta etapa não implementa tela, fabricação, servidor, persistência ou efeitos no motor do jogo.

## 1. Tipos e vagas

Existem exatamente três vagas, uma de cada tipo:

- Colar
- Pulseira
- Cinto

Não existem anel nem amuleto nesta especificação. O jogador escolhe o tipo durante a fabricação. O tipo não concede bônus próprio e não restringe o núcleo: qualquer núcleo de acessório válido pode ser usado em qualquer um dos três tipos.

Cada personagem pode equipar um colar, uma pulseira e um cinto. O tipo final é o escolhido na fabricação; o metadado `equipmentType` que o gerador atual possa anexar ao núcleo não determina nem restringe essa escolha. A geração existente não é alterada no J2.

## 2. Atributos válidos do núcleo

O núcleo é a única fonte dos atributos. Cada núcleo comum contém dois atributos; um núcleo SURP contém quatro atributos.

| Chave do núcleo | Nome apresentado | Referência lendária 1★ |
|---|---|---:|
| `forca` | Força | 10 pontos |
| `inteligencia` | Inteligência | 10 pontos |
| `destreza` | Destreza | 10 pontos |
| `vida` | Vida | 12 HP |
| `armadura` | Armadura | 0,8 ponto |
| `velocidadeMovimento` | Mobilidade | 2 pontos brutos |
| `esquiva` | Esquiva | 0,008 (0,8%) |

Velocidade de ataque e resistência mágica não fazem parte do conjunto válido. A chave interna `velocidadeMovimento` representa Mobilidade.

Se a classe não utiliza determinado atributo, ele não soma ao personagem e deve aparecer riscado, seguindo o tratamento já definido para atributos incompatíveis nas armas. Exemplo: Força em um Mago fica inativa.

## 3. Valores fixos, raridade e rolagem

Os valores são bônus fixos em unidades finais, nunca percentuais aplicados ao atributo total do personagem:

- Vida é medida em HP.
- Armadura é medida em pontos: X pontos equivalem a X%.
- Esquiva é armazenada como fração: 0,008 equivale a 0,8%.
- Mobilidade é um valor bruto.
- Força, Inteligência e Destreza são pontos.

A fração da raridade é a mesma escala já usada pelos núcleos:

| Raridade | Fração |
|---|---:|
| Normal | 0,2 |
| Comum | 0,4 |
| Incomum | 0,6 |
| Raro | 0,8 |
| Lendário | 1,0 |

O roll de cada atributo é calculado por `valor do atributo no núcleo / fração da raridade`, limitado ao intervalo de 0,5 a 1,0. Para SURP, o roll é sempre 1,0.

A fórmula é:

`valor final = referência do atributo × fração da raridade × (1 + 0,25 × (estrelas − 1)) × roll`

A peça nasce em 1★. Cada estrela acima da primeira acrescenta 25% do valor-base, de forma aditiva sobre a referência da peça: 1★ = 1,00×; 2★ = 1,25×; 3★ = 1,50×; 4★ = 1,75×.

### Tabela de valores em 1★ com roll máximo (1,0)

| Raridade | Vida (HP) | Armadura (pts) | Esquiva (fração) | Esquiva (%) | Mobilidade | Força / Inteligência / Destreza (pts) |
|---|---:|---:|---:|---:|---:|---:|
| Normal | 2,4 | 0,16 | 0,0016 | 0,16% | 0,4 | 2 |
| Comum | 4,8 | 0,32 | 0,0032 | 0,32% | 0,8 | 4 |
| Incomum | 7,2 | 0,48 | 0,0048 | 0,48% | 1,2 | 6 |
| Raro | 9,6 | 0,64 | 0,0064 | 0,64% | 1,6 | 8 |
| Lendário | 12 | 0,8 | 0,008 | 0,8% | 2 | 10 |

A linha Lendário reproduz exatamente a referência aprovada: Vida 12 HP, Armadura 0,8 ponto, Esquiva 0,008, Mobilidade 2 e 10 pontos para cada atributo primário.

### Exemplos de cálculo

1. **Normal — Vida, 1★, roll 1,0:** 12 × 0,2 × 1,0 × 1,0 = **2,4 HP**.
2. **Comum — Vida, 1★, roll 1,0:** 12 × 0,4 × 1,0 × 1,0 = **4,8 HP**.
3. **Incomum — Vida, 1★, roll 1,0:** 12 × 0,6 × 1,0 × 1,0 = **7,2 HP**.
4. **Raro — Vida, 1★, roll 1,0:** 12 × 0,8 × 1,0 × 1,0 = **9,6 HP**.
5. **Lendário — Vida, 1★, roll 1,0:** 12 × 1,0 × 1,0 × 1,0 = **12 HP**.

Exemplo com rolagem e estrela: um núcleo Lendário de Armadura com roll 0,8 em uma peça 2★ concede 0,8 × 1,0 × 1,25 × 0,8 = **0,8 ponto de Armadura**.

## 4. Estrelas e metal

O limite de estrelas é definido pelo metal da estrutura, não pela raridade do núcleo:

| Metal | Teto | Situação |
|---|---:|---|
| Bronze | 2★ | Metal da receita desta especificação |
| Ferro | 4★ | Futuro; não implementado nesta etapa |

A função de cálculo aceita até 4★ para manter a fórmula preparada para o futuro Ferro. A validação da fabricação deve respeitar o teto do metal escolhido. Nenhuma peça começa acima de 1★.

## 5. Receita de fabricação

A receita é fixa para todas as raridades:

- 3 barras de bronze.
- 8 unidades de alça: Linho **ou** Couro refinado.
- Todos os materiais devem ter a mesma raridade do núcleo.
- A alça não altera bônus, atributo, roll ou raridade; é apenas material de fabricação.

Identificadores dos materiais:

| Material | Normal | Outras raridades |
|---|---|---|
| Barra de bronze | `bronze` | `bronze:common`, `bronze:uncommon`, `bronze:rare`, `bronze:legendary` |
| Linho | `linen` | `linen:common`, `linen:uncommon`, `linen:rare`, `linen:legendary` |
| Couro refinado | `refined_leather` | `refined_leather:common`, `refined_leather:uncommon`, `refined_leather:rare`, `refined_leather:legendary` |

O material Normal não recebe sufixo de raridade. Os demais seguem o padrão `item:raridade`, igual ao helper de materiais usado pela fabricação de armaduras.

## 6. Acúmulo, tetos e assinatura

Os valores de vários acessórios que afetam o mesmo atributo são somados de forma **aditiva**. Não são multiplicadores do atributo total.

Os tetos globais existentes continuam valendo depois da soma das fontes aplicáveis:

- Armadura: redução máxima de 60%.
- Esquiva: máximo de 35%.

A peça fabricada guarda o nome do criador em `crafted_by`, seguindo a assinatura já usada por armas e armaduras. A assinatura é apenas o nome de quem fabricou; não altera os bônus.

## 7. Efeitos extras

Explosão, cura, sangramento e perfuração estão fora do J2. Não são atributos do núcleo nesta etapa e não recebem valores, chances, escalas ou regras de ativação aqui.

## 8. Pendências

- Progressão de estrelas por XP no Arsenal.
- Definição e balanceamento dos efeitos extras (explosão, cura, sangramento e perfuração).
- Metal Ferro e seu fluxo de fabricação, com teto futuro de 4★.
