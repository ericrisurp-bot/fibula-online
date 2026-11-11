import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const iconSource = 'public/icons/icon.png';
const iconDirectory = 'assets';
const iconTarget = iconDirectory + '/icon.png';
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
const stringsPath = 'android/app/src/main/res/values/strings.xml';

if (!existsSync(iconSource)) {
  throw new Error('Ícone oficial do Fíbula não encontrado: ' + iconSource);
}
if (!existsSync(manifestPath) || !existsSync(stringsPath)) {
  throw new Error('Projeto Android não encontrado. Execute npx cap add android antes da preparação.');
}

mkdirSync(iconDirectory, { recursive: true });
copyFileSync(iconSource, iconTarget);

const assetCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const assetResult = spawnSync(assetCommand, [
  '@capacitor/assets',
  'generate',
  '--android',
  '--iconBackgroundColor',
  '#222322',
  '--splashBackgroundColor',
  '#222322',
], { stdio: 'inherit' });

if (assetResult.status !== 0) {
  throw new Error('Não foi possível gerar os ícones Android a partir de public/icons/icon.png.');
}

let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android:scheme="@string/custom_url_scheme"')) {
  const deepLinkFilter = [
    '',
    '            <intent-filter>',
    '                <action android:name="android.intent.action.VIEW" />',
    '                <category android:name="android.intent.category.DEFAULT" />',
    '                <category android:name="android.intent.category.BROWSABLE" />',
    '                <data android:scheme="@string/custom_url_scheme" android:host="auth" android:path="/callback" />',
    '            </intent-filter>',
  ].join('\n');
  const activityMatch = manifest.match(/<activity\b[\s\S]*?<\/activity>/);
  if (!activityMatch) throw new Error('Não foi possível localizar a Activity principal no AndroidManifest.xml.');
  manifest = manifest.replace(activityMatch[0], activityMatch[0].replace('</activity>', deepLinkFilter + '\n        </activity>'));
  writeFileSync(manifestPath, manifest);
}

let strings = readFileSync(stringsPath, 'utf8');
if (/<string\s+name="custom_url_scheme">[\s\S]*?<\/string>/.test(strings)) {
  strings = strings.replace(/<string\s+name="custom_url_scheme">[\s\S]*?<\/string>/, '<string name="custom_url_scheme">fibula</string>');
} else {
  strings = strings.replace('</resources>', '    <string name="custom_url_scheme">fibula</string>\n</resources>');
}
writeFileSync(stringsPath, strings);

console.log('Ícone oficial e retorno OAuth por fibula://auth/callback configurados no projeto Android.');
