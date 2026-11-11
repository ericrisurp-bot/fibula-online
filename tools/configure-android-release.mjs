import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const gradlePath = 'android/app/build.gradle';
const versionName = process.env.ANDROID_VERSION_NAME ?? '';
const versionCode = process.env.ANDROID_VERSION_CODE ?? '';
const keystorePath = process.env.ANDROID_KEYSTORE_PATH ?? '';

for (const [name, value] of [
  ['ANDROID_VERSION_NAME', versionName],
  ['ANDROID_VERSION_CODE', versionCode],
  ['ANDROID_KEYSTORE_PATH', keystorePath],
  ['ANDROID_KEYSTORE_PASSWORD', process.env.ANDROID_KEYSTORE_PASSWORD ?? ''],
  ['ANDROID_KEY_ALIAS', process.env.ANDROID_KEY_ALIAS ?? ''],
  ['ANDROID_KEY_PASSWORD', process.env.ANDROID_KEY_PASSWORD ?? ''],
]) {
  if (!value.trim()) throw new Error(`Variável obrigatória ausente: ${name}`);
}

if (!/^\d+\.\d+\.\d+$/.test(versionName)) {
  throw new Error('ANDROID_VERSION_NAME deve seguir o formato X.Y.Z.');
}
if (!/^[1-9]\d*$/.test(versionCode)) {
  throw new Error('ANDROID_VERSION_CODE deve ser um inteiro positivo.');
}
if (!existsSync(keystorePath)) {
  throw new Error('Arquivo de assinatura Android não encontrado no caminho informado.');
}
if (!existsSync(gradlePath)) {
  throw new Error('Projeto Android não encontrado. Execute npx cap add android antes da configuração.');
}

let gradle = readFileSync(gradlePath, 'utf8');
const versionCodePattern = /(versionCode\s+)\d+/;
const versionNamePattern = /(versionName\s+)[\"'][^\"']+[\"']/;

if (!versionCodePattern.test(gradle) || !versionNamePattern.test(gradle)) {
  throw new Error('Não foi possível localizar versionCode e versionName no app/build.gradle gerado pelo Capacitor.');
}

gradle = gradle
  .replace(versionCodePattern, `$1${versionCode}`)
  .replace(versionNamePattern, `$1"${versionName}"`);

if (!gradle.includes('signingConfigs {')) {
  const buildTypesIndex = gradle.indexOf('buildTypes {');
  if (buildTypesIndex < 0) throw new Error('Bloco buildTypes não encontrado em app/build.gradle.');

  const signingConfig = `signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }

    `;
  gradle = gradle.slice(0, buildTypesIndex) + signingConfig + gradle.slice(buildTypesIndex);
}

const buildTypesIndex = gradle.indexOf('buildTypes {');
const releaseIndex = gradle.indexOf('release {', buildTypesIndex);
if (buildTypesIndex < 0 || releaseIndex < 0) {
  throw new Error('Bloco buildTypes.release não encontrado em app/build.gradle.');
}

const releaseOpeningBrace = gradle.indexOf('{', releaseIndex);
const releaseBody = gradle.slice(releaseOpeningBrace + 1, releaseOpeningBrace + 1000);
if (!releaseBody.includes('signingConfig signingConfigs.release')) {
  gradle = gradle.slice(0, releaseOpeningBrace + 1)
    + '\n            signingConfig signingConfigs.release'
    + gradle.slice(releaseOpeningBrace + 1);
}

writeFileSync(gradlePath, gradle);
console.log(`Versão Android ${versionName} (${versionCode}) configurada com assinatura permanente.`);
