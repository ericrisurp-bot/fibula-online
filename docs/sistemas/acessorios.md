# Acessórios — especificação J2

**Status:** especificação aprovada de dados e valores. J2b ajusta a receita, a origem do tipo e o formato das chaves armazenadas. Esta etapa não implementa tela, fabricação, servidor, persistência ou efeitos no motor do jogo.

## 1. Tipos e vagas

Existem exatamente três vagas, uma de cada tipo:

- Colar
- Pulseira
- Cinto

Não existem anel nem amuleto nesta especificação. **O tipo vem do núcleo**, pelo campo `core.equipmentType`, que deve ser `colar`, `pulseira` ou `cinto`. Não existe escolha de tipo na fabricação. Cada personagem pode equipar um colar, uma pulseira e um cinto.

O tipo final é o tipo já definido no núcleo; não é escolhido pelo jogador nem alterado pela receita. A fabricação deve rejeitar núcleo sem `equipmentType` válido para acessório.

## 2. Atributos válidos do núcleo e chaves armazenadas

O núcleo é a única fonte dos atributos. Cada núcleo comum contém dois atributos; um núcleo SURP contém quatro atributos.

| Chave recebida do núcleo | Chave armazenada | Nome apresentado | Referência lendária 1★ |
|---|---|---|---:|
| `forca` | `forca` | Força | 10 pontos |
| `inteligencia` | `inteligencia` | Inteligência | 10 pontos |
| `destreza` | `destreza` | Destreza | 10 pontos |
| `vida` | `vida` | Vida | 12 HP |
| `armadura` | `armadura` | Armadura | 0,8 ponto |
| `velocidadeMovimento` | `mobilidade` | Mobilidade | 2 pontos brutos |
| `esquiva` | `esquiva` | Esquiva | 0,008 (0,8%) |

O tipo das chaves armazenadas é a união: `forca | inteligencia | destreza | vida | armadura | mobilidade | esquiva`. A conversão da chave recebida do núcleo para a chave persistida é feita pelo helper `accessoryStoredAttributeKey`. **O servidor nunca persiste `velocidadeMovimento` em acessórios; persiste `mobilidade`.**

Velocidade de ataque e resistência mágica não fazem parte do conjunto válido. Se a classe não utiliza determinado atributo, ele não soma ao personagem e deve aparecer riscado, seguindo o tratamento já definido para atributos incompatíveis nas armas. Exemplo: Força em um Mago fica inativa.

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

**Valor persistido (1★):**

`valor armazenado = referência do atributo × fração da raridade × roll`

A estrela não altera o valor persistido. **Na leitura**, o valor efetivo é calculado por:

`valor efetivo = valor armazenado × (1 + 0,25 × (estrelas − 1))`

Assim, 1★ = 1,00×; 2★ = 1,25×; 3★ = 1,50×; 4★ = 1,75×. O valor guardado em `attributes` é sempre o valor de 1★ já multiplicado pela fração da raridade e pelo roll.

### Tabela de valores armazenados em 1★ com roll máximo (1,0)

| Raridade | Vida (HP) | Armadura (pts) | Esquiva (fração) | Esquiva (%) | Mobilidade | Força / Inteligência / Destreza (pts) |
|---|---:|---:|---:|---:|---:|---:|
| Normal | 2,4 | 0,16 | 0,0016 | 0,16% | 0,4 | 2 |
| Comum | 4,8 | 0,32 | 0,0032 | 0,32% | 0,8 | 4 |
| Incomum | 7,2 | 0,48 | 0,0048 | 0,48% | 1,2 | 6 |
| Raro | 9,6 | 0,64 | 0,0064 | 0,64% | 1,6 | 8 |
| Lendário | 12 | 0,8 | 0,008 | 0,8% | 2 | 10 |

A linha Lendário reproduz exatamente a referência aprovada: Vida 12 HP, Armadura 0,8 ponto, Esquiva 0,008, Mobilidade 2 e 10 pontos para cada atributo primário.

### Exemplos de cálculo

1. **Normal — Vida, roll 1,0, 1★:** 12 × 0,2 × 1,0 = **2,4 HP armazenados**; efetivo em 1★ = 2,4 HP.
2. **Comum — Força, roll 1,0, 1★:** 10 × 0,4 × 1,0 = **4 pontos armazenados**; efetivo em 1★ = 4.
3. **Incomum — Esquiva, roll 1,0, 1★:** 0,008 × 0,6 × 1,0 = **0,0048 armazenado** (0,48%).
4. **Raro — Vida, roll 1,0, 2★:** valor armazenado = 12 × 0,8 × 1,0 = 9,6 HP; leitura = 9,6 × 1,25 = **12 HP efetivos**.
5. **Lendário — Mobilidade, roll 0,75, 1★:** 2 × 1,0 × 0,75 = **1,5 ponto armazenado**; efetivo em 1★ = 1,5.

## 4. Estrelas e metal

O limite de estrelas é definido pelo metal da estrutura, não pela raridade do núcleo:

| Metal | Teto | Situação |
|---|---:|---|
| Bronze | 2★ | Metal da receita desta especificação |
| Ferro | 4★ | Futuro; não implementado nesta etapa |

Bronze limita em 2★. A implementação mantém Ferro preparado para 4★ como expansão futura, mas Ferro não faz parte da receita atual. Nenhuma peça começa acima de 1★. A validação deve respeitar o teto do metal.

## 5. Receita de fabricação

A receita sobe uma unidade por raridade, tanto nas barras de bronze quanto na alça. A alça pode ser Linho ou Couro refinado:

| Raridade | Degrau | Barras de bronze | Alça (linho ou couro refinado) |
|---|---:|---:|---:|
| Normal | 0 | 3 | 8 |
| Comum | 1 | 4 | 9 |
| Incomum | 2 | 5 | 10 |
| Raro | 3 | 6 | 11 |
| Lendário | 4 | 7 | 12 |

Fórmulas: `barras de bronze = 3 + degrau`; `alça = 8 + degrau`. O degrau é Normal=0, Comum=1, Incomum=2, Raro=3 e Lendário=4. Núcleo, barras e alça devem ter a mesma raridade. A alça não altera bônus, atributo, roll ou raridade; é apenas material de fabricação.

Identificadores dos materiais:

| Material | Normal | Comum | Incomum | Raro | Lendário |
|---|---|---|---|---|---|
| Barra de bronze | `bronze` | `bronze:common` | `bronze:uncommon` | `bronze:rare` | `bronze:legendary` |
| Linho | `linen` | `linen:common` | `linen:uncommon` | `linen:rare` | `linen:legendary` |
| Couro refinado | `refined_leather` | `refined_leather:common` | `refined_leather:uncommon` | `refined_leather:rare` | `refined_leather:legendary` |

O material Normal não recebe sufixo de raridade. Os demais seguem o padrão `item:raridade`, igual ao helper de materiais usado pela fabricação de armaduras.

## 6. Acúmulo, tetos e assinatura

Os valores de vários acessórios que afetam o mesmo atributo são somados de forma **aditiva**. Não são multiplicadores do atributo total do personagem.

Os tetos globais existentes continuam valendo depois da soma das fontes aplicáveis:

- Armadura: redução máxima de 60%.
- Esquiva: máximo de 35%.

A peça fabricada guarda o nome do criador em `crafted_by`, seguindo a assinatura já usada por armas e armaduras. A assinatura é apenas o nome de quem fabricou; não altera os bônus.

## 7. Efeitos extras

Explosão, cura, sangramento e perfuração estão fora do J2b. Não são atributos do núcleo nesta etapa e não recebem valores, chances, escalas ou regras de ativação aqui.

## 8. Servidor (J3)

**Status J3: já aplicado no projeto Supabase `fibula-online` pela migration `20261117154440_fibula_acessorios_fabricados`.** A tabela `fibula_accessories`, a política de leitura própria e as RPCs `fibula_craft_accessory` e `fibula_delete_accessory` já existem no banco. O arquivo-fonte dessa migration estava ausente da `main` e foi restaurado nesta PR para reconciliar o histórico do repositório. **Não reaplicar essa migration no projeto que já registra a versão.**

### Tabela `fibula_accessories`

| Coluna | Conteúdo |
|---|---|
| `id` | Identificador do acessório |
| `user_id` | Proprietário |
| `type` | Tipo herdado de `core.equipmentType`: `colar`, `pulseira` ou `cinto` |
| `rarity` | Raridade do núcleo |
| `metal` | Metal da peça |
| `stars` | Estrelas atuais |
| `surp` | Indicador SURP do núcleo |
| `attributes` | Atributos armazenados com as chaves finais; valores de 1★ já incluem fração da raridade e roll |
| `lining` | `linho` ou `couro_refinado` |
| `created_at` | Data de criação |
| `crafted_by` | Nome de quem fabricou |

### Funções previstas

| Função | Contrato |
|---|---|
| `fibula_craft_accessory(p_lining text, p_core_item_id text)` | Retorna `{accessory, inventory}` |
| `fibula_delete_accessory(p_accessory_id uuid)` | Retorna `boolean` |

A fabricação J3 deverá obter o tipo do núcleo selecionado, validar a raridade correspondente dos materiais e armazenar os atributos com as chaves finais descritas na seção 2. A multiplicação por estrela ocorre na leitura; não se grava o valor escalado por estrelas em `attributes`.

## 9. Pendências

- Progressão de estrelas por XP no Arsenal.
- Definição e balanceamento dos efeitos extras (explosão, cura, sangramento e perfuração).
- Metal Ferro e seu fluxo de fabricação, com teto futuro de 4★.
- Integração do cliente/Arsenal com as RPCs J3 já existentes.
