# Publicação e atualização do Fíbula Online para Android

## Objetivo desta etapa

O workflow **Release Android APK** gera um APK de produção assinado. Por padrão, ele apenas compila o APK e disponibiliza o resultado como artefato do GitHub Actions, sem criar uma GitHub Release pública.

A publicação oficial é uma opção manual separada: só marque **Publish GitHub Release** quando o APK já estiver validado e você decidir liberar a versão.

A página de download do site e o aviso/instalador de atualização dentro do app serão etapas seguintes.

## Assinatura permanente (obrigatória)

O Android só aceita instalar uma atualização sobre o app existente quando o novo APK usa o mesmo certificado de assinatura. **Não perca nem substitua o keystore criado para o Fíbula.** Se a chave for perdida, os jogadores terão que desinstalar o app antigo antes de instalar uma versão assinada com outra chave, podendo perder dados locais.

Crie uma chave de produção uma única vez em um computador confiável. Exemplo com `keytool` (incluído no JDK do Android Studio):

```bash
keytool -genkeypair -v -keystore fibula-release-key.jks -keyalg RSA -keysize 4096 -validity 10000 -alias fibula-release
```

Guarde o arquivo `fibula-release-key.jks` e as senhas em local seguro, com cópia de segurança offline. Nunca envie o arquivo para o repositório nem compartilhe as senhas no chat.

Converta o arquivo para Base64 para cadastrar no GitHub:

- Linux: `base64 -w 0 fibula-release-key.jks`
- macOS: `base64 < fibula-release-key.jks | tr -d '\\n'`
- Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("fibula-release-key.jks")) | Set-Clipboard`

Cadastre em **Repository → Settings → Secrets and variables → Actions → New repository secret**:

| Nome | Conteúdo |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 completo do arquivo JKS |
| `ANDROID_KEYSTORE_PASSWORD` | Senha do keystore |
| `ANDROID_KEY_ALIAS` | `fibula-release` (ou o alias escolhido) |
| `ANDROID_KEY_PASSWORD` | Senha da chave |

Não cadastre o conteúdo dessas secrets como Variables e não coloque valores no código.

## Validar o APK sem publicar

Depois que a PR da validação estiver aprovada e mesclada e as quatro secrets estiverem configuradas:

1. Abra **Actions → Release Android APK**.
2. Clique em **Run workflow** usando a branch `main`.
3. Informe `version_name` no formato `X.Y.Z` (ex.: `0.1.1`).
4. Informe `version_code` como inteiro positivo.
5. Deixe **Publish GitHub Release** desmarcado.
6. Execute e aguarde o workflow concluir.

Nesse modo, o workflow compila o APK assinado e guarda o APK e o `fibula-version.json` como artefato por 30 dias. Nenhuma GitHub Release ou tag pública é criada. Baixe o artefato para conferir a assinatura e a instalação antes de liberar uma versão.

## Publicar uma versão oficial

Somente depois de validar o APK:

1. Abra **Actions → Release Android APK** e clique em **Run workflow** usando `main`.
2. Informe um `version_name` novo no formato `X.Y.Z`.
3. Informe um `version_code` inteiro maior que todos os anteriores.
4. Marque **Publish GitHub Release**.
5. Execute e aguarde o workflow concluir.

O workflow compila o app, aplica a mesma assinatura permanente, guarda um artifact por 30 dias e cria uma GitHub Release com o APK anexado. O tag segue o formato `android-vX.Y.Z`; uma versão/tag já existente não deve ser reutilizada.

## O que ainda não faz parte desta etapa

- Botão de download do APK no site Fíbula.
- Consulta de versão nova dentro do app.
- Download e abertura do instalador Android a partir do app.

Essas funções virão depois que a publicação de APKs assinados estiver validada.
