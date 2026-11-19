# Etapa 8 — Ponte estrutural entre proficiências e atributos

**Status:** estrutura tipada criada; nenhum bônus está ativo no gameplay e nenhum valor de balanceamento foi aprovado.

## Entrega

O módulo `src/game/proficiencyAttributeIntegration.ts` conecta, de forma pura, os contratos das Etapas 6 e 7:

- recebe totais brutos de proficiência, tabelas de progressão versionadas e definições de recompensa;
- valida cada recompensa isoladamente, ignora registros inválidos e IDs duplicados/ambíguos;
- valida chaves de proficiência e atributos por listas fechadas, limites numéricos e nível de desbloqueio dentro da tabela;
- calcula o nível com o motor da Etapa 6;
- considera apenas recompensas habilitadas e já desbloqueadas;
- respeita escopo geral/classe;
- consulta `ATTRIBUTE_USAGE` e não produz contribuição para atributo que a classe não utiliza;
- devolve contribuições tipadas com `source: 'proficiency'`, identificadas por recompensa e pelas versões usadas;
- reutiliza o resultado de progressão por chave durante cada resolução, evitando recalcular a mesma proficiência para várias recompensas.

## Limite deliberado desta etapa

A função **não aplica** as contribuições a `PlayerAttributes`, `AttributeBaseBonuses`, dano, PD ou equipamento. As contribuições são devolvidas separadamente: não são somadas, multiplicadas, limitadas ou arredondadas.

Isso evita escolher silenciosamente uma política de acúmulo e evita duplicar bônus em relação a armas, armaduras, acessórios, comida ou outros sistemas. O ponto de aplicação real será criado depois que a política for aprovada.

## Decisões ainda necessárias

- Revisão do Claude dos contratos das Etapas 6 e 7 e desta ponte.
- Quais proficiências terão recompensas e quais tipos realmente serão usados.
- Valores e marcos de desbloqueio.
- Política de combinação com atributos, classe, arma, armadura, acessórios e comida.
- Limites, arredondamento, duração e versionamento/reavaliação.
- Autoridade dos dados e estratégia de persistência para recompensas que precisem de concessão única.

Nenhum valor de exemplo foi incluído. A ausência de tabelas ou recompensas configuradas significa que esta camada não concede nada por padrão.

## Fora do escopo

- Nenhuma alteração no motor de gameplay ou na captura de eventos.
- Nenhuma alteração em `attributes.ts`, `power.ts`, dano, PD, armas, armaduras, acessórios ou comida.
- Nenhuma UI, persistência adicional ou ativação de bônus.
- Nenhuma alteração em Supabase, SQL, migrations, RPC, secrets ou Cloudflare.
- Sem build/testes nesta execução via API do GitHub; não validado em navegador/Android.
