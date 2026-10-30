# Auditoria de preparação para PWA, APK Android e evolução online

Data: 2026-10-30  
Repositório: `ericrisurp-bot/fibula-online`  
Base auditada: `main` em `5e1a987b1522937bc0b582bf0c2cbb62e8a2ef88`  
Escopo: inspeção somente leitura. Nenhuma alteração no código do jogo nesta etapa.

## 1. Estado atual confirmado

- Aplicação web em React 18 + TypeScript + Vite 6.
- Renderização principal em Canvas 2D, com engine em `src/game/engine.ts` e interface em `src/ui/` / `src/App.tsx`.
- O projeto já possui controles touch, joystick, atalhos móveis, ajustes de escala da interface e lógica de tela cheia/orientação.
- O build de produção é `npm run build` (`tsc -b && vite build`).
- A configuração Cloudflare em `wrangler.jsonc` publica os arquivos estáticos de `dist/`.
- `index.html` já define idioma pt-BR, viewport, cor de tema e descrição.

## 2. Lacunas para instalação como aplicativo

- Não foi encontrada dependência ou configuração de PWA no `package.json` / `vite.config.ts`.
- Não foi encontrado `manifest.webmanifest`, registro de service worker ou estratégia de atualização offline.
- Não foi encontrada configuração Capacitor nem projeto Android.
- Não foi encontrada uma família de ícones de aplicativo nos caminhos públicos consultados.
- O viewport ainda não declara `viewport-fit=cover`; isso deve ser avaliado junto aos recortes e áreas seguras do Android.
- Os scripts do package.json não incluem testes automatizados, lint ou validação i18n.

## 3. Persistência e estado do jogo

A busca no código encontrou persistência local para preferências de áudio e escala da interface via `localStorage`. Não foi localizada, nesta auditoria, uma rotina equivalente para salvar e restaurar a sessão/progresso do jogo (personagem, inventário, construções, ciclo e progresso).

Isso precisa ser tratado antes de prometer continuidade de progresso entre dispositivos ou após reinstalação. Para a primeira versão instalável, não se deve adicionar cache offline que sugira suporte a jogo offline sem uma política clara de salvamento e recuperação.

## 4. Comunicação e preparação para multiplayer

Na inspeção e nas buscas do código principal não foi identificada uma camada de cliente/API ou sincronização de partidas. A simulação atual é executada localmente no navegador por `GameEngine`.

Para o futuro modo online, a evolução recomendada é separar progressivamente:
1. apresentação/renderização Canvas;
2. regras e simulação do jogo;
3. persistência de perfil e progresso;
4. transporte de rede e sincronização;
5. serviços de conta, salas/partidas e autoridade do servidor.

Quando houver multiplayer, o servidor deverá validar o estado autoritativo da partida; o cliente não deve ser a fonte confiável de inventário, recompensas, dano ou progresso compartilhado. A escolha de transporte (por exemplo, WebSocket) e backend deve ocorrer em uma etapa própria, após requisitos de multiplayer definidos.

## 5. Arquitetura proposta

### PWA
- Adicionar manifest com nome, nome curto, cores, orientação e ícones dedicados.
- Registrar service worker com política explícita de atualização.
- Começar com cache dos recursos estáticos versionados; não cachear respostas de API, dados de conta ou estado de partida.
- Manter a Cloudflare Pages como hospedagem web e origem da PWA.
- Testar instalação, inicialização, atualização e áreas seguras em Android Chrome.

### APK Android
- Usar Capacitor para empacotar a mesma aplicação web, sem criar uma segunda implementação do jogo.
- Manter o projeto Android e os identificadores de app separados da configuração da PWA.
- Validar tela cheia, orientação, botão voltar, pausa/retomada, áudio após interação, teclado/controles e ciclo de vida do app.
- Gerar APK de teste primeiro; assinatura de distribuição e Play Store ficam para uma etapa posterior.

### Online futuro
- Não acoplar regras de jogo diretamente a APIs de plataforma.
- Definir contratos tipados para perfil, salvamento, inventário e sessão.
- Introduzir sincronização e autoridade de servidor em uma etapa separada, com migrações e testes próprios.
- Não adicionar autenticação, banco ou serviço realtime nesta etapa de preparação do app.

## 6. Sequência recomendada

1. **Fundação PWA:** manifest, ícones, metadados de instalação e service worker com cache conservador.
2. **Validação PWA:** instalação em Android, atualização, abertura standalone e comportamento em rede instável.
3. **Wrapper Capacitor:** projeto Android, configuração de orientação/tela cheia e APK de teste.
4. **Persistência do jogo:** especificar e implementar salvamento local/versionado, com migração e recuperação.
5. **Preparação multiplayer:** separar simulação, estado persistente e camada de transporte.
6. **Backend online:** contas, servidor autoritativo, salas e sincronização, somente após desenho técnico aprovado.

## 7. Limites desta auditoria

- Nenhum arquivo de produção foi alterado nesta etapa.
- Nenhuma dependência foi instalada.
- Nenhum build, lint ou teste foi executado.
- Nenhuma configuração de Cloudflare, banco de dados, autenticação ou segredo foi modificada.
- Nenhum deploy, merge ou alteração na `main` foi realizado.

## Conclusão

O projeto tem uma base adequada para compartilhar o mesmo jogo entre navegador, PWA e APK, porque já é uma aplicação React/Vite com Canvas e controles touch. A instalação como app é viável sem reescrever o jogo. O principal cuidado técnico antes do multiplayer é definir persistência real do progresso e, depois, separar a simulação local de uma futura autoridade de servidor.
