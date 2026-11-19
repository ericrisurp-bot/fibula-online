# Etapa 7 — Estrutura de recompensas e bônus de proficiências

**Status:** contrato arquitetural para revisão; nenhum bônus, marco ou valor de balanceamento está aprovado.

## 1. Objetivo e limites

Esta etapa define como representar recompensas e bônus desbloqueados por proficiências. Ela não aplica efeitos ao personagem e não altera gameplay.

Separação obrigatória entre:
- **Progressão:** determina o nível da proficiência a partir do total e de uma tabela versionada.
- **Desbloqueio:** verifica quais recompensas foram alcançadas por esse nível.
- **Efeito ativo:** transforma um bônus desbloqueado em uma contribuição para o cálculo do personagem. A integração efetiva fica para uma etapa posterior.

A PR da Etapa 6 contém o primeiro motor configurável em branch própria. Este documento não depende de importar esse código nem incorpora a branch #491. A integração será feita após revisão e aprovação das duas estruturas.

## 2. Vocabulário

- **Recompensa:** item conceitual concedido ao alcançar um marco. Pode ser um bônus permanente, uma habilidade/passiva ou uma recompensa apenas visual.
- **Bônus:** recompensa que modifica uma regra ou valor de jogo.
- **Marco de desbloqueio:** condição de progressão que habilita uma recompensa.
- **Definição de bônus:** descrição imutável e identificável do efeito, incluindo seu alvo e regra de combinação.
- **Bônus ativo:** definição desbloqueada e elegível para a classe/contexto atual.
- **Snapshot de efeitos:** resultado calculado para o personagem em um contexto, sem alterar a definição nem o histórico da proficiência.

Alcançar um marco não deve, por si só, executar uma alteração permanente no contador de proficiência.

## 3. Contrato conceitual de uma recompensa

Cada recompensa deverá ter os seguintes campos, quando implementada:

| Campo | Finalidade |
|---|---|
| `id` | Identificador estável e único; não depende do texto exibido |
| `version` | Versão da definição para mudanças compatíveis e auditoria |
| `proficiencyKey` | Proficiência que habilita a recompensa |
| `unlockLevel` | Nível necessário, ainda pendente de balanceamento |
| `kind` | Categoria: bônus de atributo, modificador de regra, passiva ou cosmético |
| `effect` | Descrição tipada do efeito, sem lógica escondida em texto |
| `scope` | Contexto em que se aplica: personagem, classe ou situação específica |
| `stackingPolicy` | Como combina com equipamento, atributos e outros bônus |
| `enabled` | Permite desativar uma definição sem apagar histórico |
| `display` | Nome, descrição e explicação apresentados ao jogador |

Os valores de `unlockLevel`, `effect` e limites permanecem em aberto. Não criar registros de exemplo com números fictícios que possam ser confundidos com balanceamento aprovado.

## 4. Tipos de efeito a suportar

A estrutura deverá permitir, sem presumir que todos serão usados:

1. **Atributo-base:** contribuição para um atributo já existente, sujeita às regras de uso por classe.
2. **Modificador de regra:** altera um parâmetro de uma ação ou sistema específico, com alvo e unidade explícitos.
3. **Passiva condicional:** efeito ativo somente quando uma condição verificável é verdadeira.
4. **Recompensa cosmética:** desbloqueio sem impacto numérico ou mecânico.

Não usar texto livre como instrução executável. O efeito deve ser uma união discriminada de tipos conhecidos, validada antes de ser aplicado. Efeitos desconhecidos ou versões não suportadas devem ser ignorados com segurança, nunca interpretados parcialmente.

## 5. Regras de combinação

A futura camada de aplicação deverá declarar explicitamente para cada tipo de efeito:

- se soma, multiplica, substitui ou escolhe o maior valor;
- a ordem de aplicação em relação a atributos-base, nível, classe, equipamento, armadura, acessórios e comida;
- limites mínimos/máximos e arredondamento;
- se o efeito é permanente, condicional ou contextual;
- se duas recompensas da mesma família podem coexistir;
- como tratar definições desativadas ou versões antigas.

Não presumir que todo bônus é aditivo. Não somar o mesmo efeito em mais de uma camada. O cálculo deve ser determinístico: mesmas entradas e mesmas versões devem produzir o mesmo resultado.

## 6. Desbloqueio e idempotência

O desbloqueio deve ser derivado do nível calculado e do catálogo versionado de recompensas:
- uma recompensa está desbloqueada quando a proficiência correspondente satisfaz seu marco;
- reprocessar o mesmo total não concede a recompensa novamente;
- reconectar, sincronizar ou abrir o perfil não pode duplicar efeitos;
- não criar progressão adicional como consequência do próprio bônus, salvo decisão explícita futura e proteção contra ciclos;
- uma definição desativada deixa de produzir efeito, mas não deve apagar o total histórico da proficiência.

Preferência arquitetural: tratar desbloqueios como dados derivados, não como uma segunda fonte de verdade. Se uma futura recompensa exigir concessão única persistida (por exemplo, item físico), essa concessão deverá ter chave idempotente estável baseada no usuário e no ID/versionamento da recompensa.

## 7. Identidade, classe e contexto

- Recompensas pertencem à conta Fíbula, não ao nome de Clash Royale/Arena.
- Uma recompensa pode ser geral ou específica de uma classe, mas o escopo precisa estar declarado.
- O cálculo não deve duplicar um bônus porque o jogador alternou entre classes.
- Solo e Duo devem consumir o mesmo resultado de personagem para entradas equivalentes; diferenças de contexto precisam ser regras explícitas, não ramificações acidentais.
- A morte, saída ou reinício de partida não deve apagar desbloqueios permanentes.
- Efeitos temporários de partida não devem ser confundidos com recompensas permanentes de proficiência.

## 8. Integração com o sistema atual de atributos

O projeto já possui:
- `AttributeKey`, `PlayerAttributes` e `AttributeBaseBonuses` em `src/game/attributes.ts`;
- cálculo de bônus de armadura e acessórios em módulos separados;
- regras de uso de atributos por classe em `ATTRIBUTE_USAGE`.

A futura integração deve compor as contribuições em um ponto explícito do pipeline, evitando modificar diretamente valores já calculados ou somar o mesmo bônus em mais de um módulo. Bônus que apontem para atributos não utilizados pela classe devem seguir uma regra aprovada e consistente com `ATTRIBUTE_USAGE`.

Esta etapa não altera `attributes.ts`, armadura, acessórios, armas ou cálculo de dano/PD.

## 9. Integridade e segurança

- O cliente não pode enviar livremente uma lista de bônus ativos para obter vantagens.
- O estado ativo deve ser reconstruível a partir de contadores sincronizados, tabelas de progressão e catálogo de recompensas confiáveis.
- Definições precisam ser validadas (ID, versão, chave, marco, tipo e parâmetros).
- IDs duplicados ou definições ambíguas devem falhar de forma segura.
- Não confiar em valores de efeito recebidos de UI, URL, armazenamento editável ou payload não validado.
- A estratégia de autoridade/validação server-side deverá ser decidida antes de conceder recompensas com valor econômico ou itens.

## 10. Compatibilidade e versionamento

- IDs de recompensa são permanentes; não reutilizar ID removido para outro efeito.
- Alterar requisito ou efeito exige nova versão e política de migração/reavaliação explícita.
- O total bruto de proficiência não deve ser reescrito por mudanças de balanceamento.
- Uma alteração de tabela de progressão ou catálogo precisa definir se desbloqueios antigos são recalculados, preservados ou compensados.
- O resultado calculado deve identificar as versões de tabela e catálogo usadas, para permitir diagnóstico e reprodução.

## 11. Decisões que ficam para o usuário e Claude

Nenhum item abaixo está aprovado:

- quais proficiências terão recompensas;
- quantas recompensas cada proficiência terá;
- níveis/marcos de desbloqueio;
- quais serão cosméticas, passivas, condicionais ou bônus numéricos;
- atributos/alvos e valores/fórmulas;
- regra de combinação com equipamentos, armadura, acessórios, comida e classe;
- limites, arredondamento e duração;
- quais efeitos são gerais ou específicos por classe;
- política de reequilíbrio quando uma definição mudar;
- quais recompensas, se houver, exigem concessão única persistida.

## 12. Fora do escopo desta etapa

- Nenhuma implementação de bônus no gameplay.
- Nenhuma alteração de atributos, dano, PD, equipamentos, armadura, acessórios ou comida.
- Nenhuma UI.
- Nenhuma alteração em IndexedDB, RPC, Supabase, SQL, migrations, secrets ou Cloudflare.
- Nenhuma alteração na captura de eventos ou nos contadores.
- Nenhum valor de balanceamento ou recompensa inventado.

## 13. Critérios para a próxima etapa

Antes de integrar os bônus ao personagem:
- [ ] Claude revisou o contrato de progressão da Etapa 6 e este contrato de recompensas.
- [ ] O usuário aprovou os tipos de recompensa que realmente existirão.
- [ ] Os marcos e valores foram definidos e aprovados.
- [ ] A regra de combinação com atributos/equipamentos foi aprovada.
- [ ] A estratégia de autoridade, persistência e versionamento foi decidida.
- [ ] Há testes para idempotência, troca de classe, Solo/Duo e reavaliação após mudança de versão.
