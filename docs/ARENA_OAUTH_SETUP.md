# Login único Arena → Fíbula Online

## Fluxo

- A Arena iEricris é a provedora de identidade.
- O Fíbula inicia OAuth 2.1 Authorization Code com PKCE como cliente público.
- O callback troca o código por tokens diretamente no endpoint OAuth da Arena.
- O token de acesso da Arena é fornecido ao cliente Supabase do Fíbula pela opção `accessToken`; o projeto Fíbula já está configurado para confiar no emissor OIDC da Arena.
- Nenhum client secret da Arena ou chave `service_role` do Fíbula deve ser colocado no navegador.

## Configuração necessária

1. No projeto Supabase da Arena, em **Authentication → OAuth Server → OAuth Apps**, registrar o Fíbula como **public client**.
2. Cadastrar **somente um redirect URI fixo** no OAuth App da Arena:
   - `https://fibula.iericris.com.br/auth/callback`
3. Solicitar os escopos `openid email profile` e manter PKCE habilitado.

Os previews do Cloudflare Pages não precisam ser cadastrados individualmente. O Fíbula sempre envia o callback fixo de produção à Arena e inclui a origem do preview no parâmetro `state`. Depois da autorização, o callback de produção encaminha o navegador de volta ao preview de origem; o próprio preview valida o `state` e troca o código usando o mesmo redirect URI fixo. O encaminhamento aceita apenas HTTPS nos domínios `*.fibula.iericris.com.br` e `*.fibula-online.pages.dev`, além do domínio de produção.
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
