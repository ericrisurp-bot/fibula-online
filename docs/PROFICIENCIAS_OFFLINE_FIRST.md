# Sistema de Proficiências — visão do produto e arquitetura proposta

> **Status:** documentação de intenção e planejamento. Ainda não é uma implementação nem uma decisão final de schema, fórmula, balanceamento ou frequência de sincronização.
>
> **Objetivo desta nota:** permitir que desenvolvimento, auditorias e futuras etapas do projeto entendam o que estamos construindo sem depender de explicações repetidas fora do repositório.

## 1. Objetivo do sistema

A Fíbula Online deverá registrar o uso real que cada jogador faz de armas, armaduras, ferramentas de sobrevivência e carroça. Esses registros alimentarão futuramente proficiências exibidas no perfil do jogador.

A proficiência deverá representar prática acumulada. Nesta fase de planejamento, estamos definindo **o que contar e como preservar os registros**, não quanto cada nível concede.

Requisito principal de produto:

**Uma ação válida realizada no jogo deve ser contabilizada mesmo que a conexão caia logo depois. O registro não pode depender de chegar à casinha, salvar a partida ou manter a conexão ativa.**

O jogo não deve exigir servidor de jogo dedicado nem chamadas de rede por ação para cumprir esse requisito.

## 2. Categorias e eventos que deverão ser contabilizados

Os nomes abaixo são rótulos conceituais. IDs internos e estrutura definitiva ainda serão definidos na implementação.

### 2.1 Combate — armas

| Ação / equipamento | Proficiência alimentada | Regra de contagem pretendida |
|---|---|---|
| Espada | Força | Contar cada golpe que realmente acertar um alvo válido. |
| Arco | Força + destreza | Um acerto de arco distribui progresso entre força e destreza. A divisão pretendida é 50% para cada atributo, antes dos modificadores de classe que ainda serão definidos. |
| Cajado | Inteligência mágica | Contar cada acerto válido realizado com o cajado. |
| Bastão da Natureza | Inteligência mágica | Contar cada acerto válido realizado com o bastão. |

**Importante sobre o arco:** a intenção é que o mesmo acerto contribua para os dois atributos, com divisão de progresso entre eles, e não conceda o progresso integral de duas armas diferentes. A quantidade final por acerto e os modificadores por classe/especialização ainda precisam ser definidos. A especialização de arqueiro deverá ter progressão própria e não receber automaticamente a mesma progressão de força/destreza de uma classe especializada em cada atributo.

Contar acertos efetivos, e não apenas cliques, animações, tentativas de ataque ou disparos que não atingiram nada. Regras para dano em área, múltiplos alvos, ataques contínuos e alvos inválidos serão detalhadas na etapa técnica.

### 2.2 Defesa — armadura

| Ação / equipamento | Proficiência alimentada | Regra de contagem pretendida |
|---|---|---|
| Armadura equipada | Defesa / armadura | Registrar eventos válidos de dano recebido enquanto a armadura estiver equipada e participando da defesa. |

Ainda será necessário definir se o contador considera cada impacto recebido, dano efetivamente absorvido ou outro evento do sistema de combate. Não contar apenas o tempo com a armadura equipada, nem permitir que um mesmo impacto seja contabilizado repetidamente.

### 2.3 Sobrevivência — ferramentas

| Ferramenta | Proficiência | Regra de contagem pretendida |
|---|---|---|
| Machado de madeira | Lenhador / madeira | Cada golpe válido aplicado à árvore ou recurso. |
| Picareta | Minerador / pedra | Cada golpe válido aplicado à pedra ou recurso mineral. |
| Faca de esfolar | Esfolamento | Cada golpe/ação válida de esfolamento. |
| Vara de pesca | Pesca | Cada ação de pesca concluída (uma puxada válida), não cada frame ou atualização da animação. |
| Foice de mão | Colheita | Cada golpe/ação válida de colheita. |

A intenção de design é que essas proficiências possam, no futuro, melhorar a chance de encontrar recursos raros ou a quantidade obtida. **Elas não devem aumentar a velocidade de coleta nesta proposta.** As fórmulas, raridades, limites, bônus e probabilidades serão definidos em outra etapa.

Não contar ações canceladas, tentativas sem recurso válido, animações interrompidas ou eventos duplicados.

### 2.4 Transporte — carroça

A carroça terá um contador separado do deslocamento do personagem.

- Registrar a distância efetivamente percorrida pela carroça enquanto ela se move.
- Converter essa distância em passos/unidades acumuladas de carroça, usando uma unidade consistente a ser definida na implementação.
- Não usar os passos do jogador como substituto dos passos da carroça.
- Evitar contar a mesma distância duas vezes em atualizações consecutivas.

No futuro, a distância acumulada poderá ser convertida em nível de carroça. A intenção é que cada nível aumente a velocidade de acompanhamento, mas a carroça **nunca ultrapasse nem passe à frente do jogador**. Fórmula de distância por nível, velocidade, limites e comportamento de parada ainda não estão definidos.

## 3. Requisito obrigatório: offline-first e persistência imediata

A contagem de proficiência precisa funcionar independentemente da sincronização da partida.

Fluxo esperado:

1. O jogo valida que a ação aconteceu de verdade.
2. O contador local correspondente é atualizado.
3. O progresso é gravado em armazenamento persistente local do dispositivo, sem esperar a rede.
4. A interface pode refletir o novo progresso imediatamente.
5. Se houver conexão, o jogo sincroniza os dados pendentes com o Supabase em lotes.
6. O servidor confirma o lote recebido.
7. Somente depois da confirmação o lote local é marcado como sincronizado/seguro para descarte, mantendo sempre o acumulado local necessário para exibição e recuperação.

A casinha não participa desse fluxo. Não é necessário se aproximar dela, construir a casa, abrir o baú ou executar um salvamento manual para preservar proficiências.

### 3.1 Queda de conexão e encerramento inesperado

Cenário que precisa funcionar:

- Jogador permanece uma hora em uma partida.
- Durante esse período, acerta inimigos, minera, corta árvores, pesca e percorre distância com a carroça.
- A internet cai antes do fim da partida ou antes da sincronização final.
- O jogo mantém localmente o progresso já registrado.
- Quando a conexão voltar, os dados pendentes são enviados e reconciliados com o servidor.
- A perda da sincronização final da partida não deve apagar as proficiências das ações já persistidas.

A sincronização de proficiências deve ser independente do resultado final da partida. Morte, abandono, desconexão ou falha no envio do resumo da partida não podem apagar os registros locais de ações já concluídas.

**Limite físico importante:** armazenamento local protege contra queda de internet, fechamento do app e falhas de sincronização, desde que o dispositivo e os dados locais continuem disponíveis. Não protege, por si só, contra desinstalação, limpeza dos dados do app/navegador, perda ou defeito do aparelho antes de qualquer sincronização. A sincronização remota continua necessária para recuperação entre dispositivos.

## 4. Estratégia de sincronização para preservar o Supabase Free

Não fazer uma requisição ao Supabase por golpe, passo, puxada de pesca ou golpe de ferramenta. Isso geraria tráfego e chamadas desnecessárias.

A arquitetura a avaliar é:

- **Contagem local:** incrementar contadores no momento da ação válida.
- **Persistência local:** manter os dados em armazenamento durável do dispositivo. Para a aplicação web/PWA, avaliar IndexedDB como opção principal, em vez de depender apenas de memória ou localStorage.
- **Acúmulo/coalescência:** agrupar várias ações da mesma categoria em deltas compactos por jogador/sessão, sem precisar armazenar uma linha remota para cada golpe.
- **Envio em lote:** sincronizar em intervalos/eventos controlados (por exemplo, após um volume mínimo de alterações, em momentos seguros da partida, ao voltar a conexão e ao encerrar), com limites de tamanho e frequência a definir após medição.
- **Confirmação:** marcar como sincronizado somente o que o servidor confirmar.
- **Retentativa:** manter pendências em caso de timeout, erro ou desconexão e reenviar quando possível.
- **Idempotência:** cada lote/segmento precisa de identificador estável ou sequência monotônica para que reenvios não somem o mesmo progresso duas vezes.
- **Atualização atômica:** o servidor deve aplicar cada lote de forma atômica, evitando atualização parcial ou duplicada.
- **Segurança:** o servidor deve associar os dados ao usuário autenticado; o cliente não pode escolher livremente o ID de outro jogador nem alterar dados alheios.

### 4.1 Modelo de dados a investigar (não aprovado)

Uma alternativa a estudar é manter, no dispositivo, contadores acumulados e uma fila compacta de deltas ainda não confirmados. Cada lote poderia conter:

- identificador único do lote;
- identificação da sessão/partida;
- sequência do lote;
- categoria/tipo de proficiência;
- quantidade incremental acumulada desde o último lote confirmado;
- versão do formato dos dados.

No servidor, avaliar uma operação em lote que registre a chave de idempotência e some os deltas à proficiência do jogador em uma única transação.

Não criar uma linha remota por ação individual sem antes demonstrar que isso é necessário. O objetivo é que milhares de ações possam ser consolidadas em poucos envios, mantendo a precisão do contador.

A forma definitiva — tabela, RPC, política RLS, índices, retenção e estratégia de reconciliação — depende de auditoria do schema atual e de medição. Esta nota não autoriza criar tabelas, funções ou migrations.

## 5. Orçamento e limites do Supabase

A solução precisa caber no Supabase Free atual, sem pressupor upgrade de plano ou servidor dedicado.

Antes de implementar sincronização, medir e estimar:

- quantidade média e máxima de ações por minuto em uma partida;
- quantidade de jogadores ativos e partidas simultâneas esperadas;
- frequência de lotes por jogador;
- tamanho médio e máximo de cada lote;
- chamadas HTTP/RPC geradas por hora e por sessão;
- crescimento mensal do banco;
- egress mensal;
- custo de leituras para montar o perfil;
- impacto de retentativas e reconexões.

Preferir leitura do perfil em um carregamento consolidado, em vez de consultar cada proficiência separadamente. Evitar polling frequente sem necessidade.

Não assumir que o plano Free suporta qualquer volume. Validar os limites e o consumo atual do projeto antes de escolher os intervalos de envio. Não consultar Supabase Log Query para essa avaliação: o projeto já teve essa cota esgotada; usar métricas disponíveis, GitHub Actions e consultas de leitura estritamente necessárias, conforme as regras operacionais do projeto.

## 6. Perfil do jogador — apresentação futura

As proficiências deverão aparecer na página de perfil aberta ao tocar no personagem no lobby.

A área visual deverá organizar os dados por grupos:

- **Combate:** força, destreza e inteligência mágica;
- **Defesa:** armadura;
- **Sobrevivência:** lenhador, mineração, esfolamento, pesca e colheita;
- **Transporte:** carroça.

A interface deve estar preparada para mostrar, quando as regras forem definidas:

- nome da proficiência;
- nível atual;
- progresso acumulado;
- progresso necessário para o próximo nível;
- eventualmente um indicador visual de progresso.

Nesta fase, não inventar níveis, barras percentuais, metas, bônus ou valores de progresso. A interface final deverá usar os valores reais fornecidos pelo sistema de proficiências.

Preservar os dados e comportamentos existentes do perfil: identidade, avatar, informações pessoais e estatísticas atuais. A implementação visual deverá respeitar o layout lateral existente e os tamanhos de tela móveis já considerados no projeto.

## 7. Regras que ainda precisam de decisão

Não preencher por suposição. Definir em etapas futuras:

1. Quantidade-base de progresso gerada por cada acerto/ação.
2. Modificadores por classe e especialização.
3. Fórmula exata da divisão de progresso do arco entre força e destreza.
4. Como a armadura ganha proficiência: impacto recebido, dano absorvido ou outro evento.
5. Regras para ataques em área, múltiplos alvos, dano contínuo e ações interrompidas.
6. Quantidade de progresso exigida por nível e limites máximos.
7. Efeitos de cada nível nas chances/quantidades de recursos raros.
8. Unidade de distância e fórmula de nível/velocidade da carroça.
9. Intervalo, gatilhos e tamanho máximo dos lotes de sincronização.
10. Política de reconciliação entre dispositivos e sessões simultâneas.

## 8. Fora do escopo desta etapa

Esta etapa é apenas documentação e alinhamento de arquitetura. Não implementar:

- contadores reais ou captura de eventos;
- armazenamento local ou sincronização;
- tabelas, RPCs, triggers, policies ou migrations do Supabase;
- mudanças no schema ou nos dados dos jogadores;
- bônus de atributos, dano ou defesa;
- velocidade de coleta;
- chances ou quantidades de drops;
- níveis ou fórmulas de proficiência;
- velocidade ou comportamento atual da carroça;
- alteração visual do perfil.

Nenhuma regra de gameplay existente deve mudar por causa desta documentação.

## 9. Critérios para considerar a futura implementação pronta

A implementação só deverá ser considerada concluída quando os testes demonstrarem:

- cada evento válido é contado uma única vez;
- ações inválidas/canceladas não geram progresso;
- o contador persiste localmente após fechamento/reabertura do app;
- desconectar a internet não interrompe a contagem;
- reconectar envia pendências sem duplicar valores;
- falha no resumo/finalização da partida não apaga proficiências já persistidas;
- o jogador não precisa visitar a casinha para salvar;
- os dados de um jogador não podem ser gravados ou lidos por outro;
- o volume de chamadas, egress e armazenamento permanece dentro do orçamento Free medido;
- o perfil apresenta os valores confirmados sem inventar progresso.

---

**Resumo para futuras auditorias:** proficiência é um sistema de progressão independente do salvamento da casinha e independente do encerramento da partida. A ação válida deve ser contada e persistida localmente imediatamente; o Supabase recebe deltas compactados em lotes, com confirmação e idempotência. O plano Free é uma restrição de projeto, então a solução deve minimizar chamadas e armazenamento remoto, medir o consumo e não depender de servidor dedicado. Fórmulas e benefícios permanecem em aberto até decisão explícita.
