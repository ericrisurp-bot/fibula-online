# Login único Arena → Fíbula Online

## Fluxo

- A Arena iEricris é a provedora de identidade.
- O Fíbula inicia OAuth 2.1 Authorization Code com PKCE como cliente público.
- O callback troca o código por tokens diretamente no endpoint OAuth da Arena.
- O token de acesso da Arena é fornecido ao cliente Supabase do Fíbula pela opção `accessToken`; o projeto Fíbula já está configurado para confiar no emissor OIDC da Arena.
- Nenhum client secret da Arena ou chave `service_role` do Fíbula deve ser colocado no navegador.

## Configuração necessária

1. No projeto Supabase da Arena, em **Authentication → OAuth Server → OAuth Apps**, registrar o Fíbula como **public client**.
2. Cadastrar o redirect URI exato do ambiente:
   - Produção: `https://fibula.iericris.com.br/auth/callback`
   - Preview: usar o endereço Preview do Cloudflare Pages seguido de `/auth/callback`, se o preview também for testado com OAuth.
3. Solicitar os escopos `openid email profile` e manter PKCE habilitado.
4. Copiar somente o **Client ID público** para a variável `VITE_ARENA_OAUTH_CLIENT_ID` do Cloudflare Pages.
5. Configurar no Cloudflare Pages:
   - `VITE_FIBULA_SUPABASE_URL=https://jkbplwnklzhayzghizwh.supabase.co`
   - `VITE_FIBULA_SUPABASE_PUBLISHABLE_KEY` com a chave publishable ativa do projeto Fíbula.
6. Reexecutar o build/deploy do Cloudflare Pages somente após aprovação explícita da PR.

Para desenvolvimento local, copiar `.env.example` para `.env.local` e preencher as mesmas variáveis.

## Segurança e limites desta etapa

- Usa `state` e PKCE S256; o callback valida o estado antes da troca do código.
- Os tokens ficam no armazenamento local do navegador para manter a sessão entre aberturas do PWA. O refresh token é rotacionado quando a sessão é renovada.
- O cliente Supabase do Fíbula não cria uma senha nem uma sessão própria de Auth; ele envia o JWT da Arena como token de terceiro.
- O identificador `sub` da Arena é UUID, compatível com `auth.uid()` nas políticas do Fíbula, desde que as tabelas usem a mesma identidade.
- Esta PR não cria tabelas, políticas RLS, perfis ou nomes de personagem. A escolha e a unicidade do nome de jogo precisam de uma etapa própria no banco, com índice único e políticas de acesso.
- O cadastro do OAuth App e as variáveis do Cloudflare permanecem pendentes; nenhum segredo é versionado neste repositório.
