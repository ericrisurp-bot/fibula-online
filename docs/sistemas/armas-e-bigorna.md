# Armas e Bigorna

**Etapa:** N2a — especificação documental  
**Status:** receitas e regras de fabricação descritas como especificação; implementação de fabricação ainda não existe no código consultado.  
**Referência de código:** branch `main), consultada antes da redação. O documento de equipamentos e núcleos foi usado apenas como referência complementar.

## 1. Escopo e vocabulário

Esta especificação cobre a fabricação de quatro modelos de arma na Bigorna:

- Espada
- Arco
- Cajado
- Bastão da Natureza

Toda receita exige **exatamente 1 núcleo revelado da categoria arma**. Núcleo fechado não substitui núcleo revelado.

As raridades são: **normal, comum, incomum, raro e lendário**. Núcleo e todos os materiais consumidos na mesma fabricação devem ter exatamente a mesma raridade. Não é permitido misturar raridades.

As receitas, os valores de dano de referência, as regras de afinidade e o fluxo de fabricação no servidor descritos abaixo são a especificação desta etapa. Eles não devem ser confundidos com funcionalidades já presentes no jogo; as diferenças verificadas no código estão reunidas em [Divergências encontradas](#14-divergências-encontradas).

## 2. Receitas da Bigorna

Cada linha abaixo consome 1 núcleo revelado de arma, além dos materiais indicados. Tipo 1 e tipo 2 são escolhas alternativas para a estrutura metálica da arma.

| Arma | Núcleo | Cabo/estrutura secundária | Material principal — tipo 1 | Material principal — tipo 2 |
|---|---:|---:|---:|---:|
| Espada | 1 núcleo revelado de arma | Madeira ×5 (cabo) | Lâmina de pedra ×10 | Bronze ×10 |
| Arco | 1 núcleo revelado de arma | Madeira ×5 e linho ×5 | Pedra ×10 | Bronze ×10 |
| Cajado | 1 núcleo revelado de arma | Madeira ×5 | Pedra ×10 | Bronze ×10 |
| Bastão da Natureza | 1 núcleo revelado de arma | Madeira ×5 | Pedra ×10 | Bronze ×10 |

A escolha tipo 1 ou tipo 2 altera o material principal, não a raridade exigida. A receita do arco usa dois materiais secundários distintos — madeira e linho — além das dez unidades de pedra ou bronze.

### 2.1 Raridade dos materiais

A validação da fabricação deve comparar a raridade do núcleo com a raridade de **cada pilha/material da receita**. Todos precisam ser idênticos: normal com normal, comum com comum, incomum com incomum, raro com raro ou lendário com lendário.

No código atual:

- A raridade de um núcleo é obtida pelo parser de núcleo (`parseCoreItemId`), que distingue núcleo fechado de revelado e expõe a raridade do núcleo revelado. O tipo `CoreRarity` inclui as cinco raridades, inclusive `normal`.
- A raridade de um material comum do inventário é consultada por `getItemRarity(itemId)`, em `src/game/inventory.ts`. A função lê o segundo segmento de `itemId` (`itemId.split(':')[1]`) e reconhece somente `common`, `uncommon`, `rare` e `legendary`.
- `getBaseItemId(itemId)` lê o primeiro segmento do mesmo ID, permitindo identificar o material-base independentemente do sufixo de raridade.

**Atenção à raridade normal:** hoje `getItemRarity` retorna `undefined` para `normal), assim como para IDs sem um sufixo de raridade reconhecido. Portanto, o helper atual, sozinho, não distingue material normal de material sem raridade. A fabricação deverá tratar essa diferença explicitamente antes de aceitar uma combinação normal.

A interface atual da Bigorna apenas lista materiais por material-base; ela não compara raridades. A validação exata de igualdade ainda precisa ser implementada no fluxo de fabricação.

## 3. Afinidade do núcleo: cajado e Bastão da Natureza

A especificação usa uma afinidade oculta no núcleo revelado de arma:

- **Afinidade Dano:** aceita Cajado.
- **Afinidade Natureza:** aceita Bastão da Natureza.
- Núcleo revelado antigo, sem campo de afinidade, é aceito por qualquer um dos dois modelos de cajado.
- Espada e Arco ignoram a afinidade: podem usar núcleo com Dano, Natureza ou sem afinidade.

A afinidade é uma propriedade independente dos atributos do núcleo: não ocupa uma das posições de atributo, não altera SURP, não participa do cálculo de atributos e não muda a quantidade, o pool ou os valores dos atributos.

A regra de compatibilidade é verificada na fabricação. Afinidade incompatível deve impedir a fabricação, sem converter ou sortear outra afinidade.

## 4. Dano de referência por arma e raridade

O dano de referência lendário e sua escala por raridade são:

| Raridade | Fração da referência lendária |
|---|---:|
| Normal | 1/5 |
| Comum | 2/5 |
| Incomum | 3/5 |
| Raro | 4/5 |
| Lendário | 5/5 |

| Arma | Normal | Comum | Incomum | Raro | Lendário |
|---|---:|---:|---:|---:|---:|
| Espada — referência lendária 32 | 6,4 | 12,8 | 19,2 | 25,6 | 32 |
| Cajado — referência lendária 34 | 6,8 | 13,6 | 20,4 | 27,2 | 34 |
| Bastão da Natureza — referência lendária 34 | 6,8 | 13,6 | 20,4 | 27,2 | 34 |
| Arco — referência lendária 26 | 5,2 | 10,4 | 15,6 | 20,8 | 26 |

Na fabricação, o dano final de cada arma é sorteado entre **50% e 100%** do valor de referência correspondente à raridade e ao modelo da arma. O sorteio deve ocorrer no servidor. O intervalo é contínuo; a distribuição probabilística e o arredondamento não são definidos nesta etapa.

## 5. Atributos do núcleo aplicados à arma

Um núcleo de arma revelado contém:

- **2 atributos** em um núcleo comum;
- **4 atributos** quando o núcleo é SURP.

Os atributos possíveis no pool de armas são Força, Inteligência, Destreza e Velocidade de ataque. A combinação é sorteada sem repetir a mesma chave no núcleo.

A arma ativa somente os atributos compatíveis com seu modelo:

| Arma | Atributos ativos |
|---|---|
| Espada | Força e Velocidade de ataque |
| Arco | Força, Destreza e Velocidade de ataque |
| Cajado | Inteligência e Velocidade de ataque |
| Bastão da Natureza | Inteligência e Velocidade de ataque |

Os atributos incompatíveis permanecem registrados no núcleo/arma, mas não somam ao personagem enquanto aquela arma estiver sendo usada. Não são convertidos, substituídos ou sorteados novamente.

### 5.1 Relação com atributos-base, nível e classe

A intenção desta especificação é que os bônus ativos da arma sejam somados ao valor-base correspondente do personagem e que a progressão por nível e classe seja aplicada conforme a fórmula aprovada para o atributo. Essa integração de bônus de equipamento ainda não existe no cálculo atual e precisa ser implementada sem alterar acidentalmente o balanceamento das classes.

O código atual em `src/game/attributes.ts` funciona assim:

1. `getPlayerAttributes(classId, level, pointsPerLevel)` parte de `CONFIG.attributes.baseValue` (hoje 100).
2. O ganho de nível é calculado como `max(0, level) × gainPerLevel × max(1, pointsPerLevel)`.
3. Cada atributo recebe esse ganho multiplicado pelo multiplicador de classe correspondente. Esses multiplicadores afetam o ganho por nível, não substituem o valor-base inicial.
4. `getDamageMultiplier` calcula o multiplicador de dano usando os atributos de dano da classe e divide a soma ponderada pelo valor-base. Hoje: Guerreiro usa Força; Mago usa Inteligência; Arqueiro combina 35% Força e 65% Destreza; Druida usa Inteligência. Velocidade de ataque não entra nessa soma de dano.
5. A interface do perfil usa o dano configurado da arma multiplicado por `getDamageMultiplier`.

Assim, o código atual já tem base de atributos, ganhos por nível, pesos de classe e multiplicador de dano. **Ainda não soma atributos fabricados de armas ao personagem nem integra esses bônus na fórmula.** A ordem e a fórmula de integração dos bônus da arma devem respeitar essa distinção e ser implementadas em etapa própria.

## 6. SURP da arma

Uma arma fabricada será SURP somente quando **todos os valores sorteados da arma** estiverem no máximo possível para a raridade:

- dano no teto de 100% da referência da arma naquela raridade;
- todos os atributos ativos no teto de 100% da referência de atributo daquela raridade.

Um núcleo SURP aumenta a chance de a arma fabricada sair SURP. **A chance exata está PENDENTE** e não deve ser presumida nem derivada da chance de geração de núcleos.

No código atual, `revealCore` gera dois atributos em núcleos não-SURP e quatro em núcleos SURP. Para um núcleo SURP, os valores dos atributos gerados ficam em 100% da referência da raridade; nos demais, cada valor é sorteado entre 50% e 100%. `CORE_SURP_CHANCE` hoje vale 2% e é usado na geração/revelação do **núcleo**. Esse 2% não é a chance de uma arma fabricada ser SURP.

## 7. Fabricação no servidor: arquitetura definida

A fabricação deve ser realizada por uma função do Supabase. Em uma única transação, a função deverá:

1. validar a sessão/autenticação e identificar a conta proprietária;
2. validar o núcleo revelado, a categoria arma, a raridade e a afinidade aplicável;
3. validar receita, tipo 1 ou tipo 2, quantidades e igualdade de raridade entre núcleo e todos os materiais;
4. confirmar que a conta possui os itens no Baú e espaço válido para receber o resultado;
5. consumir uma unidade do núcleo e as quantidades exigidas de cada material;
6. sortear no servidor o dano e os atributos ativos, incluindo a regra SURP;
7. criar e gravar a arma resultante em uma tabela própria da conta;
8. confirmar a transação e devolver ao cliente somente o resultado persistido.

A aleatoriedade e os valores finais são responsabilidade exclusiva do servidor. **O cliente nunca envia dano, atributos, potência, SURP ou outros valores calculados para serem aceitos como resultado.** O cliente envia apenas as escolhas necessárias à receita; o servidor valida tudo e gera o item.

A Bigorna exige internet. Sem conexão, não deve haver fabricação local nem resultado provisório considerado válido.

### 7.1 Fluxo ponta a ponta

1. Abrir a Bigorna no Lobby e selecionar um núcleo revelado de categoria arma.
2. Escolher o modelo: Espada, Arco, Cajado ou Bastão da Natureza.
3. Para Espada/Arco/Cajado/Bastão, escolher material principal tipo 1 (pedra) ou tipo 2 (bronze).
4. Selecionar todos os materiais secundários exigidos pela receita — inclusive madeira e linho separadamente no caso do Arco.
5. Conferir a quantidade de cada item e a raridade de todos os componentes. O núcleo e cada material devem ter a mesma raridade.
6. Solicitar a fabricação com conexão ativa.
7. O servidor valida a sessão, inventário, receita, raridade, afinidade e capacidade; sorteia os valores e grava a arma na conta em uma transação.
8. O cliente recebe a confirmação e os dados da arma persistida.

### 7.2 Erros que a fabricação deve tratar

- **Núcleo inválido:** ID malformado, núcleo fechado, núcleo inexistente, categoria diferente de arma ou núcleo revelado inválido.
- **Raridade diferente:** raridade do núcleo ou de qualquer material diferente da raridade dos demais componentes.
- **Material insuficiente:** quantidade disponível menor que a exigida em qualquer parte da receita.
- **Afinidade incompatível:** Cajado com afinidade Natureza ou Bastão da Natureza com afinidade Dano. Núcleo antigo sem afinidade continua aceito para ambos.
- **Baú cheio:** a validação de capacidade do Baú deve impedir uma operação que não possa ser concluída com segurança.
- **Arsenal cheio:** a arma não pode ser entregue se não houver capacidade válida no destino definido para armas.

A operação não deve aceitar resultado parcial nem valores fornecidos pelo cliente. A política exata de consumo/estorno quando ocorre uma falha permanece pendente, conforme a lista de decisões em aberto.

## 8. Pendências

Os itens abaixo permanecem deliberadamente sem valores ou decisões nesta especificação:

1. Valores dos efeitos especiais por raridade: empurrão, perfuração, explosão e efeitos de natureza.
2. Chance de uma arma sair SURP quando fabricada com núcleo SURP.
3. Estrelas e XP concedidos no Lobby pela fabricação.
4. Onde a arma fabricada aparece e como é equipada.
5. Limite de armas por conta.
6. O que acontece com o núcleo e os materiais se a fabricação falhar.

## 9. Divergências encontradas

Esta seção registra o estado do código consultado em `main` em relação às regras desta especificação. As divergências são informativas; nenhuma delas foi corrigida nesta etapa.

### 9.1 Afinidade ainda não está na main consultada

`src/game/cores.ts` na `main` consultada não declara o campo `affinity` em `Core`, não sorteia afinidade em `revealCore` e não valida afinidade em `parseNewCore`. A implementação correspondente está proposta na PR #330 (N1.2), mas não fazia parte da `main` usada como base desta documentação. Portanto, a regra de afinidade acima descreve o comportamento especificado para a etapa, não o comportamento presente nessa versão de `main`.

### 9.2 Raridade normal de materiais não é reconhecida pelo helper atual

`CoreRarity` reconhece `normal`, mas `ItemRarity` e `getItemRarity` em `src/game/inventory.ts` não reconhecem `normal`. Para um ID cujo segundo segmento seja `normal`, o helper retorna `undefined`. O código atual também não valida igualdade de raridade entre núcleo e materiais na Bigorna.

### 9.3 Bigorna é somente uma interface protótipo

Em `src/App.tsx`:

- `anvilCoreStacks` é uma lista vazia fixa; o código comenta que o inventário ainda não possui itens de núcleo definidos.
- Os materiais principais são filtrados por material-base `stone` ou `bronze`.
- Os materiais secundários são filtrados por `wood`, `wolf_hide`, `linen` ou `cotton`.
- A interface tem um espaço de material principal com limite de 10 unidades e um espaço secundário com limite de 5 unidades.
- Cada espaço seleciona um único `itemId). Logo, a interface atual não consegue selecionar madeira e linho simultaneamente como dois materiais secundários da receita do Arco.
- O botão “Fabricar equipamento” está desabilitado e informa que a fabricação será habilitada quando os núcleos e a integração do equipamento estiverem disponíveis.
- Não há validação de raridade/afinidade, consumo de núcleo e materiais, sorteio de arma ou gravação de arma nessa interface.

A lista de materiais exibida pela Bigorna é mais ampla que as receitas de armas desta especificação, pois inclui couro de lobo e algodão como opções secundárias. Isso não os torna ingredientes válidos para as quatro receitas de armas descritas aqui.

### 9.4 Dano configurado atualmente é diferente do dano de referência da fabricação

Em `src/game/config.ts`, os danos-base atuais são: Espada 16, Cajado 17, Arco 13 e Bastão 17. Os valores de referência lendários desta especificação são, respectivamente, 32, 34, 26 e 34. O código atual não aplica a tabela de dano por raridade da fabricação nem o sorteio de 50% a 100% descrito nesta etapa.

### 9.5 Atributos de arma fabricada ainda não integram o personagem

`src/game/cores.ts` já define o pool de atributos possíveis para núcleos de arma e gera dois atributos, ou quatro em núcleo SURP. `src/game/attributes.ts` calcula atributos-base e ganhos por nível/classe, mas não recebe atributos de uma arma fabricada. A compatibilidade por modelo de arma e a soma dos bônus ativos ainda não estão ligadas ao cálculo atual.

### 9.6 Arsenal atual não define limite específico de armas por conta

`src/game/arsenal.ts` define capacidade geral de 30 itens no Arsenal e inclui o slot `arma` entre os slots de equipamento. Isso não define um limite próprio de armas por conta nem implementa o fluxo de fabricação/entrega/equipamento das armas da Bigorna. O limite específico continua pendente.

## 10. Limites desta etapa

Este PR adiciona somente esta documentação. Não implementa receitas, afinidade, fabricação, funções Supabase, tabelas, consumo de materiais, aleatoriedade de servidor, dano, atributos de arma, SURP de arma, entrega ao Arsenal ou alterações de interface.
