import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

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

const javaRoot = 'android/app/src/main/java';
function findMainActivity(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findMainActivity(fullPath);
      if (found) return found;
    } else if (entry.name === 'MainActivity.java') {
      return fullPath;
    }
  }
  return null;
}

if (!existsSync(javaRoot)) throw new Error('Diretório Java do Android não encontrado.');
const mainActivityPath = findMainActivity(javaRoot);
if (!mainActivityPath) throw new Error('MainActivity.java não encontrado no projeto Android gerado.');
const mainActivity = readFileSync(mainActivityPath, 'utf8');
const packageMatch = mainActivity.match(/^package\s+([\w.]+);/m);
if (!packageMatch) throw new Error('Não foi possível identificar o package da MainActivity.');
const javaPackage = packageMatch[1];
const javaDirectory = dirname(mainActivityPath);
const pluginPath = join(javaDirectory, 'ApkInstallerPlugin.java');

const pluginSource = `package ${javaPackage};

import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.List;

@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {
    @PluginMethod
    public void checkInstallPermission(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject result = new JSObject();
        result.put("canInstall", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Não foi possível abrir a autorização de instalação do Android.", error);
        }
    }

    @PluginMethod
    public void verifyApk(PluginCall call) {
        String filePath = call.getString("filePath");
        Object expectedSizeValue = call.getData().opt("expectedSize");
        Long expectedSize = null;
        if (expectedSizeValue instanceof Number) {
            Number numericSize = (Number) expectedSizeValue;
            double sizeAsDouble = numericSize.doubleValue();
            long sizeAsLong = numericSize.longValue();
            if (Double.isFinite(sizeAsDouble) && sizeAsDouble == (double) sizeAsLong && sizeAsLong > 0) {
                expectedSize = sizeAsLong;
            }
        } else if (expectedSizeValue instanceof String) {
            try {
                expectedSize = Long.parseLong(((String) expectedSizeValue).trim());
            } catch (NumberFormatException ignored) {
                // O tamanho será apontado como inválido abaixo.
            }
        }
        String expectedSha256 = call.getString("expectedSha256");

        StringBuilder invalidFields = new StringBuilder();
        if (filePath == null || filePath.trim().isEmpty()) invalidFields.append("filePath");
        if (expectedSize == null || expectedSize <= 0) {
            if (invalidFields.length() > 0) invalidFields.append(", ");
            invalidFields.append("expectedSize");
        }
        if (expectedSha256 == null || !expectedSha256.matches("(?i)[a-f0-9]{64}")) {
            if (invalidFields.length() > 0) invalidFields.append(", ");
            invalidFields.append("expectedSha256");
        }
        if (invalidFields.length() > 0) {
            call.reject("Dados de validação do APK inválidos: " + invalidFields + ".");
            return;
        }

        try {
            Uri fileUri = Uri.parse(filePath);
            File apkFile = new File(fileUri.getPath());
            if (!apkFile.isFile() || apkFile.length() != expectedSize) {
                JSObject result = new JSObject();
                result.put("valid", false);
                result.put("size", apkFile.isFile() ? apkFile.length() : 0);
                result.put("sha256", "");
                call.resolve(result);
                return;
            }

            java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
            try (java.io.FileInputStream input = new java.io.FileInputStream(apkFile)) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            }
            StringBuilder hash = new StringBuilder();
            for (byte value : digest.digest()) {
                hash.append(String.format(java.util.Locale.ROOT, "%02x", value & 0xff));
            }

            JSObject result = new JSObject();
            result.put("valid", hash.toString().equalsIgnoreCase(expectedSha256));
            result.put("size", apkFile.length());
            result.put("sha256", hash.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não foi possível validar a integridade do APK.", error);
        }
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("Caminho do APK não informado.");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("O Fíbula ainda não tem autorização para solicitar instalações.");
            return;
        }

        try {
            Uri fileUri = Uri.parse(filePath);
            File apkFile = new File(fileUri.getPath());
            if (!apkFile.isFile() || apkFile.length() <= 0) {
                call.reject("O APK baixado não foi encontrado ou está vazio.");
                return;
            }

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".apkprovider",
                apkFile
            );
            // Use the same generic APK-opening flow used when the user taps
            // an APK in Downloads: Android resolves the package installer and
            // keeps its normal security / Play Protect checks in control.
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.setClipData(ClipData.newUri(
                getContext().getContentResolver(),
                "Fíbula APK",
                contentUri
            ));

            PackageManager packageManager = getContext().getPackageManager();
            List<ResolveInfo> installers = packageManager.queryIntentActivities(
                intent,
                PackageManager.MATCH_DEFAULT_ONLY
            );
            if (installers.isEmpty()) {
                call.reject("Nenhum instalador de APK encontrado neste aparelho.");
                return;
            }
            for (ResolveInfo installer : installers) {
                if (installer.activityInfo != null) {
                    getContext().grantUriPermission(
                        installer.activityInfo.packageName,
                        contentUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                }
            }

            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            String exceptionName = error.getClass().getSimpleName();
            String exceptionMessage = error.getMessage();
            String details = exceptionName
                + (exceptionMessage == null || exceptionMessage.trim().isEmpty()
                    ? ""
                    : ": " + exceptionMessage);
            Log.e("ApkInstallerPlugin", "Falha ao abrir o instalador do APK: " + details, error);
            call.reject(
                "O Android não conseguiu abrir o instalador do APK. " + details,
                error
            );
        }
    }
}
`;
writeFileSync(pluginPath, pluginSource);

let activitySource = mainActivity;
if (!activitySource.includes('import android.os.Bundle;')) {
  activitySource = activitySource.replace(/^(package [^;]+;\s*)/m, '$1\nimport android.os.Bundle;');
}
if (!activitySource.includes('registerPlugin(ApkInstallerPlugin.class)')) {
  if (/public void onCreate\s*\(/.test(activitySource)) {
    activitySource = activitySource.replace(/(super\.onCreate\(savedInstanceState\);)/, 'registerPlugin(ApkInstallerPlugin.class);\n        $1');
  } else {
    activitySource = activitySource.replace(/(public class MainActivity extends BridgeActivity\s*\{)/, '$1\n    @Override\n    public void onCreate(Bundle savedInstanceState) {\n        registerPlugin(ApkInstallerPlugin.class);\n        super.onCreate(savedInstanceState);\n    }');
  }
}
writeFileSync(mainActivityPath, activitySource);

let installerManifest = readFileSync(manifestPath, 'utf8');
if (!installerManifest.includes('application/vnd.android.package-archive')) {
  const installerQuery = [
    '        <intent>',
    '            <action android:name="android.intent.action.VIEW" />',
    '            <data android:mimeType="application/vnd.android.package-archive" />',
    '        </intent>',
  ].join('\n');
  if (installerManifest.includes('</queries>')) {
    installerManifest = installerManifest.replace('</queries>', installerQuery + '\n    </queries>');
  } else {
    installerManifest = installerManifest.replace(
      /(<application\b)/,
      '    <queries>\n' + installerQuery + '\n    </queries>\n\n    $1'
    );
  }
}
if (!installerManifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  installerManifest = installerManifest.replace(/(<application\b)/, '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n\n    $1');
}
if (!installerManifest.includes('.apkprovider')) {
  const provider = `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="\${applicationId}.apkprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/apk_file_paths" />
        </provider>
`;
  installerManifest = installerManifest.replace('</application>', provider + '    </application>');
}
writeFileSync(manifestPath, installerManifest);

const xmlDirectory = 'android/app/src/main/res/xml';
mkdirSync(xmlDirectory, { recursive: true });
writeFileSync(join(xmlDirectory, 'apk_file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <cache-path name="apk_cache" path="." />
</paths>
`);

console.log('Ícone, OAuth e instalador APK com autorização explícita do Android configurados.');
