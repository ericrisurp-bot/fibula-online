# Sistema de equipamentos e núcleos

**Status:** especificação de design para revisão. Este documento não autoriza implementar regras que estejam marcadas como pendentes.

## 1. Objetivo

O sistema de fabricação deve ser orientado por materiais, estruturas de equipamento e núcleos encontrados por drop. O núcleo é a fonte dos atributos e dos multiplicadores; a estrutura (armadura, arma ou acessório) determina quais atributos pode aproveitar.

O sistema deve permitir escolhas reais: o jogador compara os atributos do núcleo com a finalidade do equipamento e decide onde utilizá-lo.

## 2. Vocabulário

- **Atributo:** um dos atributos formais já existentes no jogo.
- **Núcleo:** item obtido por drop que carrega atributos, raridade e potência.
- **Estrutura:** peça fabricada que recebe um núcleo.
- **Compatibilidade:** relação entre os atributos do núcleo e os atributos aceitos pela estrutura/material.
- **Potência:** percentual sorteado dentro da faixa permitida para a raridade.
- **SURP:** condição de potência máxima (100% da referência da própria raridade). Não é uma raridade adicional.
- **Efeito especial:** comportamento próprio de uma arma/classe (por exemplo, empurrão ou perfuração); não deve ser confundido com atributo formal.

## 3. Atributos formais existentes

A matriz deve partir dos atributos já registrados em `src/game/attributes.ts`:

1. `vida`
2. `forca`
3. `armadura`
4. `resistenciaMagica`
5. `inteligencia`
6. `destreza`
7. `velocidadeMovimento`
8. `velocidadeAtaque`
9. `alcanceAtaque`
10. `esquiva`
11. `areaAtaque`

Não criar atributos formais novos como parte desta especificação. Dano e efeitos especiais de arma não devem ser apresentados como se fossem automaticamente atributos formais.

> Atenção: a existência de um atributo em `attributes.ts` não prova que todos os seus efeitos estejam implementados no combate. Antes de implementar bônus, auditar o caminho real de cálculo e confirmar o efeito funcional de cada atributo.

## 4. Separação dos núcleos por categoria

### 4.1 Núcleos de armadura

A categoria de armadura é defensiva e de mobilidade. O núcleo é específico por peça e contém todos os atributos permitidos para aquela peça, reunindo a união dos atributos definidos para couro e bronze:

| Peça | Atributos do núcleo |
|---|---|
| Capacete | Armadura, Vida, Mobilidade |
| Peitoral | Armadura, Vida, Mobilidade |
| Calça | Vida, Mobilidade |
| Bota | Mobilidade |
| Luva | Armadura, Esquiva, Mobilidade |

**Não pode carregar força, resistência mágica nem velocidade de ataque.** A compatibilidade com o tipo de armadura continua sendo validada pela tabela de atributos da peça e do material.

Os identificadores internos do núcleo são traduzidos para os identificadores de armadura da seguinte forma:

| Núcleo | Armadura |
|---|---|
| `leggings` | `calca` |
| `velocidadeMovimento` | `mobilidade` |
| Demais identificadores | Sem alteração |

O tipo de equipamento do núcleo é escolhido na geração; a peça e o tipo/material da armadura são escolhidos na fabricação. A lista de atributos do núcleo é derivada de `ARMOR_PIECE_ATTRIBUTES`, pela união dos atributos de couro e bronze para a peça correspondente.

### 4.2 Núcleos de armas

A categoria de armas é ofensiva. A matriz aprovada permite:

- Força
- Inteligência
- Destreza

Velocidade de ataque está banida da geração de novos núcleos. Os conjuntos atuais são definidos por modelo: Espada = Força; Arco = Força e Destreza; Cajado e Bastão da Natureza = Inteligência. Núcleos antigos que contenham velocidade de ataque continuam válidos e legíveis, mas esse atributo fica inativo.

Armas existentes na especificação:

- Espada
- Arco
- Cajado
- Bastão da Natureza

Os efeitos especiais devem respeitar a identidade e as capacidades reais de cada arma. Exemplos já existentes/conceituais incluem empurrão da espada, perfuração do arco, explosão mágica do cajado e efeitos de natureza do bastão. Esses efeitos não autorizam criar atributos formais novos.

**Alcance das armas:** permanece fixo nos valores atuais. Não conceder bônus de fabricação ao alcance nem permitir que um acessório aumente indiretamente o alcance de ataque enquanto essa regra estiver vigente.

### 4.3 Núcleos de acessórios

Acessórios são suportes para núcleos, não fontes de atributos próprios.

Estruturas previstas:

- Anel
- Colar
- Pulseira
- Cinto

Qualquer tipo de acessório pode receber qualquer núcleo, desde que o núcleo seja válido e seus atributos sejam compatíveis com o sistema. Novos núcleos de acessório sorteiam entre Força, Inteligência, Destreza, Vida, Armadura, Velocidade de movimento e Esquiva; Velocidade de ataque foi removida do pool de geração. Núcleos antigos com velocidade de ataque continuam válidos e legíveis, mas o atributo fica inativo.

O acessório não concede bônus intrínseco por ser anel, colar, pulseira ou cinto. Os atributos e multiplicadores vêm do núcleo instalado.

**Regra aprovada:** os multiplicadores de acessórios incidem sobre o atributo total do personagem, incluindo classe, níveis e equipamentos (regra A).

A forma de acumular dois ou mais multiplicadores que afetam o mesmo atributo ainda está pendente de decisão: soma aditiva ou composição multiplicativa. Não escolher uma fórmula por conta própria.

## 5. Quantidade de atributos por núcleo

- Núcleos de armadura: todos os atributos permitidos para a peça indicada pelo próprio núcleo; a quantidade varia conforme a peça. A geração comum sorteia cada atributo entre 50% e menos de 100% da referência; SURP mantém todos os atributos em 100%.
- Núcleos de acessório: dois atributos na geração comum e quatro no SURP.
- Núcleos de arma: quantidade fixa por modelo, independentemente de SURP — Espada 1, Arco 2, Cajado 1. O Bastão da Natureza usa o conjunto de Inteligência do Cajado.
- SURP continua significando que todos os atributos gerados naquele núcleo estão no máximo da raridade; portanto, Espada e Cajado têm um único atributo e esse único atributo precisa estar no máximo.
- Núcleos antigos preservam seus atributos originais e continuam legíveis, inclusive velocidade de ataque inativa.
- O núcleo SURP preserva exatamente os atributos e as respectivas potências durante a fabricação.
- Não substituir, sortear novamente, reduzir ou recalcular os atributos/potências de um núcleo SURP na fabricação.
- A quantidade de atributos é uma propriedade distinta da raridade e da potência.

A regra de dois atributos comuns e quatro atributos SURP aplica-se somente a acessórios. Núcleos de armadura seguem a lista completa de atributos permitidos pela peça; não reduzir essa lista para dois ou quatro.

## 6. Raridade e multiplicadores de referência

Progressão aprovada:

| Raridade | Multiplicador de referência | Percentual de referência |
|---|---:|---:|
| Normal | 0,2 | 20% |
| Comum | 0,4 | 40% |
| Incomum | 0,6 | 60% |
| Raro | 0,8 | 80% |
| Lendário | 1,0 | 100% |

A progressão mantém a proporção de 1:5 entre Normal e Lendário.

Os valores são referências de bônus/multiplicador, não multiplicadores do atributo total por si só. Para núcleos de armadura, o roll do núcleo é a média de `valor / referência da raridade` entre todos os atributos da peça, limitado ao intervalo de 0,5 a 1,0; SURP equivale a 1,0. Esse mesmo roll é a origem do roll do forro. Esta regra pode ser revista em etapa futura. A fórmula de aplicação dos atributos do núcleo continua sujeita às regras específicas de armadura. Para acessórios, está aprovada a incidência sobre o atributo total do personagem; a regra de acúmulo entre acessórios continua pendente.

## 7. Variação de potência: piso de 50% e teto de 100%

Todo atributo ou efeito gerado por equipamento/núcleo pode alcançar de 50% a 100% do valor de referência da respectiva raridade.

- 50% é o piso absoluto.
- 100% é o teto.
- Nunca gerar valor abaixo de 50% da referência.
- A faixa vale para armas, armaduras, acessórios, atributos e efeitos.
- SURP significa atingir 100% da referência da própria raridade.

Exemplo ilustrativo com referência de dano igual a 10:

| Potência sorteada | Resultado |
|---:|---:|
| 50% | 5 |
| 57% | 5,7 |
| 69% | 6,9 |
| 80% | 8 |
| 90% | 9 |
| 100% | 10 — SURP |

Exemplo com núcleo de armadura Normal, cuja referência é 0,2:

| Potência relativa | Multiplicador resultante |
|---:|---:|
| 50% | 0,10 |
| 60% | 0,12 |
| 80% | 0,16 |
| 100% | 0,20 — SURP |

A potência pode variar dentro da faixa, não apenas em intervalos de dez pontos. Não definir arredondamento, distribuição probabilística ou se os atributos de um mesmo núcleo compartilham a mesma rolagem sem aprovação adicional.

## 8. Compatibilidade parcial

**Regra aprovada: compatibilidade parcial.**

Um núcleo pode ser utilizado em estruturas/materiais diferentes. Entretanto:

- Somente atributos compatíveis produzem efeito.
- Atributos incompatíveis permanecem no núcleo, mas ficam inativos naquela fabricação.
- Não converter atributo incompatível em outro.
- Não sortear atributo substituto.
- Não alterar a potência original do atributo.
- A compatibilidade deve ser validada no momento da fabricação/equipamento.

Exemplo: um núcleo com Vida e Armadura aplicado a uma estrutura de linho só pode ativar os atributos que a combinação efetivamente aceita. O atributo incompatível não se transforma em movimento ou esquiva.

## 9. Tipos e refinamentos de armadura

As armaduras têm dois tipos de estrutura, definidos pelo material-base da peça:

- **Tipo 1 — Couro:** o couro bruto é o material-base da peça. Este tipo oferece menos armadura que o Tipo 2.
- **Tipo 2 — Bronze:** o bronze é o material-base metálico da peça. Este tipo oferece mais armadura que o Tipo 1.

O couro bruto não é forro nem revestimento: ele constitui a estrutura-base do Tipo 1. Bronze e couro não concedem bônus próprios adicionais além da diferença de armadura entre os dois tipos descrita acima. Não atribuir mobilidade extra ao Tipo 1.

### 9.1 Forro e costura

Os refinamentos são aplicáveis aos dois tipos de armadura. A peça tem, na especificação conceitual, um slot de material-base, um slot de forro e um slot de costura. Para forro e costura, as opções de material são:

| Material de refinamento | Atributos aproveitados |
|---|---|
| Algodão | Vida |
| Linho | Velocidade de movimento e esquiva |
| Couro refinado | Armadura e resistência |

O material determina quais atributos do núcleo são aproveitados; ele não cria atributos nem altera os atributos ou as potências originais do núcleo. O núcleo continua sendo a fonte dos atributos e das potências. Armaduras não recebem força nem velocidade de ataque.

A armadura é fabricada na **Alfaiataria**.

### 9.2 Produção futura de couro refinado

O couro refinado será produzido na **Tecelaria**, dentro da partida, a partir do couro que cai do lobo. A Tecelaria atualmente refina algodão em linho; a produção de couro refinado é um requisito futuro e não deve ser considerada implementada nesta etapa.

As chances de refino, o estoque e a capacidade da Tecelaria para esse processo ainda não foram definidos e permanecem em Pendências.

## 10. Regras de fabricação e troca

Fluxo conceitual:

1. O jogador obtém um núcleo por drop.
2. O núcleo possui raridade, dois ou quatro atributos conforme as regras acima e uma potência por atributo/efeito.
3. O jogador escolhe uma estrutura e os materiais.
4. O sistema valida a compatibilidade.
5. A fabricação preserva os dados originais do núcleo, especialmente no caso SURP.
6. Somente os atributos compatíveis produzem efeito no equipamento final.
7. Ao trocar/remover equipamento, retirar os efeitos da peça anterior antes de aplicar os da nova. Não permitir acúmulo indevido de bônus antigos.

## 11. Regras de balanceamento que devem ser preservadas

- Armaduras não recebem força nem velocidade de ataque.
- Velocidade de ataque está banida de todos os pools de geração de novos núcleos; núcleos antigos que a contenham continuam válidos, mas o atributo fica inativo.
- Inteligência e destreza podem aparecer em núcleos de armas e de acessórios.
- Atributos defensivos/de mobilidade da categoria de armadura também podem aparecer em acessórios.
- Acessórios não possuem atributos próprios: o núcleo é a fonte dos efeitos.
- Acessórios multiplicam o atributo total do personagem.
- Alcance das armas permanece fixo e não recebe bônus.
- Bônus de equipamento não devem ser multiplicados pelos multiplicadores de progressão de classe de forma acidental; o mesmo equipamento precisa respeitar o balanceamento entre classes, exceto quando a regra de multiplicação total dos acessórios for explicitamente aplicada.
- Remover corretamente os efeitos de um equipamento quando ele for substituído.

## 12. Pendências que exigem aprovação antes de implementar

Esta documentação não resolve por suposição os seguintes pontos:

1. Valores numéricos de armadura do Tipo 1 (Couro) e do Tipo 2 (Bronze).
2. Confirmação da quantidade exata de slots de forro e costura. A estrutura conceitual descrita nesta seção prevê um slot de forro e um slot de costura, além do slot de material-base; não ampliar nem reduzir essa quantidade sem aprovação.
3. Números do couro refinado na Tecelaria: chance de refino, estoque e capacidade.
4. Fórmula exata de aplicação dos atributos dos núcleos de armadura e de armas.
5. Matriz individual de atributos/efeitos por espada, arco, cajado e bastão da Natureza.
6. Se `areaAtaque` pode aparecer em núcleos de armas e/ou acessórios.
7. Se `alcanceAtaque` fica totalmente fora de qualquer núcleo/acessório (a regra atual mantém o alcance das armas fixo).
8. Fórmula exata de aplicação dos multiplicadores de núcleos de armadura e de armas.
9. Acúmulo de dois ou mais acessórios que multiplicam o mesmo atributo: aditivo ou multiplicativo.
10. Distribuição probabilística dentro da faixa de 50% a 100%, incluindo arredondamento e se cada atributo recebe rolagem independente.
11. Como efeitos especiais (empurrão, perfuração, explosão, veneno, cura etc.) são escalados e quais armas podem receber cada efeito.
12. Se um núcleo SURP tem alguma chance específica de produzir equipamento SURP além de preservar os quatro atributos/potências do núcleo. Não assumir chance de 80% ou 100% sem aprovação explícita.
13. Quais atributos formais já possuem efeito real no combate e quais exigem implementação própria. A auditoria do código deve preceder qualquer alteração de gameplay.
14. Auditoria futura dos efeitos extras dos acessórios: dano de explosão, cura, sangramento e perfuração. Esta etapa não implementa nem altera esses efeitos.

## 13. Limites desta etapa

Esta etapa é documental. Não implementar geração de drops, inventário de núcleos, fabricação, slots, fórmulas de combate, balanceamento numérico adicional ou alterações de persistência.

A implementação deverá ocorrer em etapas próprias, após aprovação das pendências e auditoria dos pontos de integração do código.


## 14. Assinatura de quem fabricou

Armas e armaduras guardam no servidor o nome de quem realizou a fabricação, no campo `crafted_by` de cada equipamento. A assinatura é definida no momento da fabricação e acompanha a peça persistida. Ela aparece somente como o nome, de forma discreta, nos respectivos modais de detalhes; quando não houver nome válido, nada é exibido. A assinatura não altera atributos, raridade, fabricação, inventário ou equipamento.


## 15. Joalheria — etapa J1

A Joalheria usa uma única lista do Baú, sem abas ou faixa separada de núcleos. O cenário fica no topo; abaixo ficam a zona escura **Materiais selecionados** e a zona **Baú**, no mesmo padrão visual e proporcional da Bigorna.

### 15.1 Revelação de núcleos fechados

- Núcleos fechados são agrupados por raridade na lista do Baú e podem ser selecionados individualmente por grupo.
- Ao selecionar um núcleo fechado, o slot **Núcleo fechado 1/1** é preenchido e aparece o slot **Algodão ×5**.
- Somente algodão da mesma raridade do núcleo pode ser selecionado. O slot mostra a quantidade selecionada no formato X/5; clicar no slot devolve a seleção ao Baú.
- A revelação exige cinco algodões da mesma raridade, Baú carregado e conexão ativa.
- A operação continua usando exclusivamente a RPC existente `fibula_core_reveal`, por meio do fluxo `revealCoreFromChest`. Esta etapa não altera a RPC, seu contrato, o custo do polimento nem a persistência.
- Após a revelação, o núcleo revelado permanece no Baú e seus atributos são exibidos no cartão de atributos da Joalheria.

### 15.2 Núcleos revelados no Baú

- Núcleos revelados de **acessório** podem ser selecionados. O slot mostra o núcleo e o cartão exibe seus atributos.
- A seleção de um núcleo de acessório também mostra a área **Receita do acessório**, com o texto **Receita em definição** e o botão **Fabricar · Em breve** desabilitado.
- Núcleos revelados de **arma** e **armadura** são apenas informativos e inertes na Joalheria, com indicação de destino **Bigorna** e **Alfaiataria**, respectivamente.
- Algodão só é selecionável quando existe um núcleo fechado selecionado e a raridade coincide. Os demais materiais permanecem inertes.

### 15.3 Limites da etapa J1

A fabricação de acessórios **ainda não existe**. J1 não define receitas, materiais, quantidades, tipos de acessório, atributos adicionais, prévia de fabricação, RPC, tabela ou chamada de fabricação. Esses detalhes ficam para a etapa J2. A Bigorna e a Alfaiataria não são alteradas por esta etapa.


## 16. Detalhe de núcleos revelados — D1

Núcleos revelados exibem um botão de informação (ⓘ) nos Baús da Bigorna, Alfaiataria, Joalheria e no Baú do Lobby. O botão abre um modal leve com fechamento por X, toque fora ou Esc; abrir os detalhes não seleciona o núcleo nem executa a ação principal do item. Núcleos fechados não exibem esse botão.

Quando um núcleo revelado entra no slot de materiais selecionados de uma estação, um cartão compacto e rolável apresenta os mesmos dados sem substituir os controles da receita.

- **Armas:** modelo (Espada, Arco, Cajado ou Bastão da Natureza), raridade, SURP quando existente e todos os atributos do núcleo. Os valores mantêm o formato já usado pela Joalheria (valor × WEAPON_CORE_POINTS_PER_VALUE, com uma casa decimal e vírgula). Atributos incompatíveis com o modelo aparecem riscados e identificados como “não conta nesta arma”. O detalhe informa que dano e efeito da arma são sorteados na fabricação.
- **Armaduras:** peça, raridade, SURP quando existente e prévia dos atributos a 1★, usando `armorAttributeValue` e o mesmo roll por atributo do painel de fabricação. A Bigorna apresenta Bronze; a Alfaiataria apresenta Couro; Joalheria e Baú do Lobby apresentam as duas opções.
- **Acessórios:** raridade, SURP quando existente e atributos no mesmo formato atualmente exibido pela Joalheria. D1 não define nem altera uma conversão de atributo de acessório.
- **Núcleos fechados:** não exibem botão de atributos; após revelar, os detalhes ficam disponíveis.

A interface não apresenta classificações “bom”, “médio” ou “ruim”. SURP é a única indicação de qualidade exibida. D1 é somente informativo: não altera valores, fórmulas, compatibilidade, receitas, custos, raridades, revelação, fabricação, persistência ou regras de jogo.
