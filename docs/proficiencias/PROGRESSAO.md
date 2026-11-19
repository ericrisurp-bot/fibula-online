# Etapa 5 — Especificação da progressão de proficiências

**Status:** proposta para discussão; nenhum valor de balanceamento está aprovado.

## 1. Objetivo e escopo

Definir o contrato de progressão das proficiências antes de implementar níveis, bônus ou interface. Esta etapa é documental: não altera o comportamento do jogo nem os dados existentes.

A fundação já registra contadores por chave e a captura local já recebe eventos do motor. Esses contadores representam uso acumulado (hits, impacts, actions, fishing pulls ou distance), não pontos de experiência. Não reinterpretar os totais atuais como XP sem uma decisão explícita e uma estratégia de migração/conversão.

## 2. Proficiências existentes

As chaves atualmente previstas na fundação são:

| Chave | O que mede | Unidade |
|---|---|---|
| `espada` | acertos válidos com espada | hits |
| `arco` | acertos válidos com arco | hits |
| `cajado` | acertos válidos com cajado | hits |
| `bastao_natureza` | acertos válidos com Bastão da Natureza | hits |
| `golpes_recebidos` | impactos válidos recebidos | impacts |
| `machado_madeira` | ações válidas de corte | actions |
| `picareta` | ações válidas de mineração | actions |
| `faca_esfolar` | ações válidas de esfolamento | actions |
| `vara_pesca` | puxadas de pesca concluídas | fishing pulls |
| `foice_mao` | ações válidas de colheita | actions |
| `carroca_distancia` | distância efetivamente percorrida | distance |

A unidade e o evento de cada chave devem continuar semanticamente estáveis. Alterar captura ou unidade exige revisão própria.

## 3. Modelo de progressão — decisões pendentes

Nenhuma curva numérica foi definida. Antes de implementar, aprovar:

1. **Nível inicial:** confirmar se toda proficiência começa no nível 0 ou 1.
2. **Nível máximo:** definir um limite comum ou limites por grupo.
3. **Requisito por nível:** escolher uma curva (linear, progressiva ou por marcos) e publicar os requisitos completos em tabela versionada.
4. **Acúmulo:** decidir se o nível é calculado diretamente do contador acumulado ou se haverá XP separado. Recomendação técnica: manter o contador bruto como histórico de uso e derivar o nível por uma tabela de requisitos versionada; não apagar nem sobrescrever contadores.
5. **Excedente:** definir se o progresso acima do nível máximo fica armazenado (recomendado) ou é descartado.
6. **Novas proficiências:** estabelecer como novas chaves entram no catálogo sem alterar o significado das existentes.

### Alternativas para avaliação

- **Contador bruto como fonte única:** nível derivado de marcos de uso. É simples e evita duas fontes de verdade, mas cada unidade precisa de uma curva compatível.
- **XP separado:** cada evento converte unidade em XP. Dá liberdade de balanceamento, mas adiciona regras de conversão, persistência e reconciliação.

**Recomendação:** começar avaliando contador bruto + tabela versionada de marcos. Só introduzir XP separado se o balanceamento realmente precisar atribuir pesos diferentes a eventos da mesma proficiência.

## 4. Grupos e identidade das proficiências

As proficiências podem ser apresentadas em grupos funcionais, sem alterar suas chaves técnicas:

- **Combate:** espada, arco, cajado, Bastão da Natureza.
- **Sobrevivência:** golpes recebidos.
- **Coleta e ferramentas:** machado, picareta, faca de esfolar, vara de pesca, foice de mão.
- **Transporte:** distância de carroça.

Pendente: aprovar nomes, ordem e agrupamento visual. A identidade do jogador e o armazenamento devem permanecer vinculados à conta Fíbula, sem depender do nome de Clash Royale/Arena.

## 5. Bônus — princípios, não valores

Não conceder bônus nesta etapa. Para cada bônus futuro, registrar:

- proficiência que o desbloqueia;
- nível/marco exigido;
- efeito exato e unidade;
- valor ou fórmula;
- limite/acúmulo com equipamentos, atributos, classe e outros efeitos;
- se é passivo, condicional ou ativado;
- comportamento em Solo e Duo;
- impacto em inimigos, coleta, economia e desempenho;
- forma de exibição e explicação ao jogador.

Princípios recomendados para a próxima decisão:

- bônus devem ser graduais e legíveis, sem tornar equipamento ou atributos existentes irrelevantes;
- evitar bônus que acelerem a própria proficiência de forma ilimitada (loop de progressão);
- bônus defensivos devem considerar o evento já definido: impacto válido recebido quando a esquiva falha; armadura equipada não deve gerar progresso por si só;
- bônus de distância da carroça não devem recompensar movimento artificial ou duplicado;
- o mesmo cálculo de personagem deve valer em Solo e Duo, salvo regra de balanceamento explicitamente aprovada.

## 6. Integridade e exploração

A progressão deve aceitar somente eventos válidos emitidos pelo motor. Não criar progressão a partir de cliques, tentativas sem resultado, dano causado sem acerto real, tempo parado ou valores enviados livremente pelo cliente.

A sincronização offline-first deve continuar idempotente. Retries não podem duplicar progresso. Eventos novos ocorridos durante o envio devem permanecer pendentes para o lote seguinte. A etapa de progressão não deve enfraquecer esses invariantes.

## 7. Interface futura

A tela de perfil poderá exibir, quando aprovada:

- nome e ícone da proficiência;
- nível atual;
- total de uso acumulado;
- progresso até o próximo nível;
- próximo marco e recompensa, quando houver.

Não exibir bônus inexistentes como se já estivessem ativos. Definir depois se os detalhes aparecem em painel, tooltip ou modal e como a tela se adapta ao celular.

## 8. Sequência sugerida após aprovação do balanceamento

1. Aprovar nível inicial, limite máximo, curva e tratamento do excedente.
2. Aprovar a tabela de marcos para cada unidade.
3. Aprovar bônus por proficiência e regras de acúmulo.
4. Implementar cálculo puro e testes unitários, sem UI.
5. Integrar cálculo à persistência/sincronização com estratégia explícita para dados já acumulados.
6. Implementar exibição no perfil.
7. Validar gameplay em Solo e Duo, inclusive progresso offline e retry idempotente.

## 9. Aprovações necessárias

- [ ] Nível inicial e nível máximo.
- [ ] Contador bruto como fonte do nível ou XP separado.
- [ ] Curva/requisitos por proficiência e tratamento do excedente.
- [ ] Bônus, marcos e regras de acúmulo.
- [ ] Grupos, nomes e apresentação no perfil.
- [ ] Estratégia para compatibilidade com contadores já acumulados.

Até essas decisões serem aprovadas, os itens acima permanecem propostas. Esta especificação não autoriza alterações no banco, migrações, gameplay, bônus ou interface.
