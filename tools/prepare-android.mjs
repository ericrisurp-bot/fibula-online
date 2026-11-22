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

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.Context;
import android.content.IntentFilter;
import android.content.Intent;
import android.content.pm.PackageInstaller;
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("O Fíbula ainda não tem autorização para solicitar instalações.");
            return;
        }

        String step = "1) validar arquivo";
        File apkFile;
        Uri contentUri;
        try {
            String filePath = call.getString("filePath");
            if (filePath == null || filePath.trim().isEmpty()) {
                throw new IllegalArgumentException("Caminho do APK não informado.");
            }
            Uri fileUri = Uri.parse(filePath);
            apkFile = new File(fileUri.getPath());
            if (!apkFile.isFile() || apkFile.length() <= 0) {
                throw new IllegalArgumentException("O APK baixado não foi encontrado ou está vazio.");
            }
        } catch (Exception error) {
            String details = formatInstallError(step, error);
            Log.e("ApkInstallerPlugin", "Falha na instalação do APK: " + details, error);
            call.reject("Não foi possível instalar o APK. " + details, error);
            return;
        }

        step = "2) FileProvider.getUriForFile";
        try {
            contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".apkprovider",
                apkFile
            );
        } catch (Exception error) {
            String details = formatInstallError(step, error);
            Log.e("ApkInstallerPlugin", "Falha na instalação do APK: " + details, error);
            call.reject("Não foi possível instalar o APK. " + details, error);
            return;
        }

        step = "3) montar a intent";
        Intent viewIntent;
        try {
            viewIntent = new Intent(Intent.ACTION_VIEW);
            viewIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            viewIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            viewIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            viewIntent.setClipData(new ClipData(
                "Fíbula APK",
                new String[] {"application/vnd.android.package-archive"},
                new ClipData.Item(contentUri)
            ));
        } catch (Exception error) {
            String details = formatInstallError(step, error);
            Log.e("ApkInstallerPlugin", "Falha na instalação do APK: " + details, error);
            call.reject("Não foi possível instalar o APK. " + details, error);
            return;
        }

        String permissionWarning = null;
        step = "4) queryIntentActivities e grantUriPermission";
        try {
            PackageManager packageManager = getContext().getPackageManager();
            List<ResolveInfo> installers = packageManager.queryIntentActivities(
                viewIntent,
                PackageManager.MATCH_DEFAULT_ONLY
            );
            for (ResolveInfo installer : installers) {
                if (installer.activityInfo != null) {
                    getContext().grantUriPermission(
                        installer.activityInfo.packageName,
                        contentUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION
                    );
                }
            }
            if (installers.isEmpty()) {
                permissionWarning = "A consulta não encontrou instaladores; será tentada a abertura direta.";
                Log.w("ApkInstallerPlugin", permissionWarning);
            }
        } catch (Exception error) {
            permissionWarning = formatInstallError(step, error);
            Log.e("ApkInstallerPlugin", "Falha não bloqueante no passo 4: " + permissionWarning, error);
        }

        step = "5) startActivity (ACTION_VIEW)";
        try {
            getActivity().startActivity(viewIntent);
            call.resolve();
            return;
        } catch (Exception viewError) {
            String viewDetails = formatInstallError(step, viewError);
            Log.e("ApkInstallerPlugin", "Falha ao iniciar ACTION_VIEW: " + viewDetails, viewError);

            step = "5) startActivity (ACTION_INSTALL_PACKAGE)";
            try {
                Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                installIntent.setData(contentUri);
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                installIntent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
                installIntent.setClipData(new ClipData(
                    "Fíbula APK",
                    new String[] {"application/vnd.android.package-archive"},
                    new ClipData.Item(contentUri)
                ));
                getActivity().startActivity(installIntent);
                call.resolve();
                return;
            } catch (Exception installError) {
                String installDetails = formatInstallError(step, installError);
                Log.e("ApkInstallerPlugin", "Falha também ao iniciar ACTION_INSTALL_PACKAGE: " + installDetails, installError);
                String diagnostics = viewDetails + " | " + installDetails;
                if (permissionWarning != null) {
                    diagnostics += " | Aviso do passo 4 (não bloqueante): " + permissionWarning;
                }
                call.reject(
                    "Não foi possível abrir o instalador do APK. " + diagnostics,
                    installError
                );
            }
        }
    }


    private BroadcastReceiver installStatusReceiver;
    private PluginCall activeInstallCall;
    private boolean activeInstallCallResolved = false;
    private int activeInstallSessionId = -1;

    @PluginMethod
    public void installApkSession(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("O Fíbula ainda não tem autorização para solicitar instalações.");
            return;
        }

        String step = "1) validar arquivo";
        File apkFile;
        PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
        int sessionId = -1;
        boolean committed = false;
        try {
            String filePath = call.getString("filePath");
            if (filePath == null || filePath.trim().isEmpty()) {
                throw new IllegalArgumentException("Caminho do APK não informado.");
            }
            Uri fileUri = Uri.parse(filePath);
            apkFile = new File(fileUri.getPath());
            if (!apkFile.isFile() || apkFile.length() <= 0) {
                throw new IllegalArgumentException("O APK baixado não foi encontrado ou está vazio.");
            }

            step = "2) criar sessão PackageInstaller";
            PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL
            );
            params.setSize(apkFile.length());
            sessionId = installer.createSession(params);

            step = "3) registrar receptor de status";
            unregisterInstallStatusReceiver();
            activeInstallCall = call;
            activeInstallCallResolved = false;
            activeInstallSessionId = sessionId;
            final int currentSessionId = sessionId;
            final String statusAction = getContext().getPackageName() + ".INSTALL_STATUS";
            installStatusReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null || !statusAction.equals(intent.getAction())) return;
                    int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                    String statusMessage = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                    if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                        Intent confirmation = (Intent) intent.getParcelableExtra(Intent.EXTRA_INTENT);
                        if (confirmation == null) {
                            finishInstallCall(false, "O Android solicitou confirmação, mas não forneceu a tela de instalação. Código: " + status + ". Detalhes: " + statusMessage);
                            unregisterInstallStatusReceiver();
                            return;
                        }
                        try {
                            confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            getContext().startActivity(confirmation);
                            if (activeInstallCall != null && !activeInstallCallResolved) {
                                activeInstallCallResolved = true;
                                activeInstallCall.resolve();
                            }
                        } catch (Exception error) {
                            String details = formatInstallError("4) abrir confirmação do Android", error);
                            Log.e("ApkInstallerPlugin", "Falha na sessão de instalação: " + details, error);
                            finishInstallCall(false, "Não foi possível abrir a confirmação de instalação. " + details);
                            unregisterInstallStatusReceiver();
                        }
                        return;
                    }
                    if (status == PackageInstaller.STATUS_SUCCESS) {
                        finishInstallCall(true, null);
                        unregisterInstallStatusReceiver();
                        return;
                    }

                    String statusLabel;
                    switch (status) {
                        case PackageInstaller.STATUS_FAILURE:
                            statusLabel = "falha na instalação";
                            break;
                        case PackageInstaller.STATUS_FAILURE_ABORTED:
                            statusLabel = "instalação cancelada ou interrompida";
                            break;
                        case PackageInstaller.STATUS_FAILURE_BLOCKED:
                            statusLabel = "instalação bloqueada pelo Android";
                            break;
                        case PackageInstaller.STATUS_FAILURE_CONFLICT:
                            statusLabel = "conflito com pacote já instalado";
                            break;
                        case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                            statusLabel = "APK incompatível com o dispositivo";
                            break;
                        case PackageInstaller.STATUS_FAILURE_INVALID:
                            statusLabel = "pacote APK inválido";
                            break;
                        case PackageInstaller.STATUS_FAILURE_STORAGE:
                            statusLabel = "espaço de armazenamento insuficiente";
                            break;
                        default:
                            statusLabel = "falha não identificada na instalação";
                            break;
                    }
                    String failure = "Não foi possível concluir a instalação: " + statusLabel
                        + ". Código do status: " + status + ". Detalhes do Android: "
                        + (statusMessage == null || statusMessage.trim().isEmpty()
                            ? "nenhum detalhe informado."
                            : statusMessage);
                    Log.e("ApkInstallerPlugin", failure);
                    finishInstallCall(false, failure);
                    unregisterInstallStatusReceiver();
                }
            };
            IntentFilter filter = new IntentFilter(statusAction);
            if (Build.VERSION.SDK_INT >= 33) {
                getContext().registerReceiver(installStatusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(installStatusReceiver, filter);
            }

            step = "4) gravar APK na sessão";
            try (PackageInstaller.Session session = installer.openSession(sessionId);
                 java.io.FileInputStream input = new java.io.FileInputStream(apkFile);
                 java.io.OutputStream output = session.openWrite("base.apk", 0, apkFile.length())) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                session.fsync(output);

                step = "5) confirmar sessão";
                Intent statusIntent = new Intent(statusAction);
                statusIntent.setPackage(getContext().getPackageName());
                int pendingIntentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    pendingIntentFlags |= PendingIntent.FLAG_MUTABLE;
                }
                PendingIntent statusPendingIntent = PendingIntent.getBroadcast(
                    getContext(),
                    currentSessionId,
                    statusIntent,
                    pendingIntentFlags
                );
                session.commit(statusPendingIntent.getIntentSender());
                committed = true;
            }
        } catch (Exception error) {
            if (!committed && sessionId >= 0) {
                try {
                    installer.abandonSession(sessionId);
                } catch (Exception abandonError) {
                    Log.e("ApkInstallerPlugin", "Não foi possível abandonar a sessão " + sessionId, abandonError);
                }
            }
            String details = formatInstallError(step, error);
            Log.e("ApkInstallerPlugin", "Falha na sessão de instalação do APK: " + details, error);
            unregisterInstallStatusReceiver();
            if (activeInstallCall == call && !activeInstallCallResolved) {
                activeInstallCall = null;
                call.reject("Não foi possível instalar o APK pela sessão do Android. " + details, error);
            }
        }
    }

    private void finishInstallCall(boolean success, String message) {
        PluginCall call = activeInstallCall;
        if (call == null || activeInstallCallResolved) return;
        activeInstallCallResolved = true;
        activeInstallCall = null;
        if (success) call.resolve();
        else call.reject(message);
    }

    private void unregisterInstallStatusReceiver() {
        if (installStatusReceiver != null) {
            try {
                getContext().unregisterReceiver(installStatusReceiver);
            } catch (IllegalArgumentException ignored) {
                // O receptor pode já ter sido removido pelo ciclo de vida.
            }
            installStatusReceiver = null;
        }
        activeInstallSessionId = -1;
    }

    @Override
    protected void handleOnDestroy() {
        unregisterInstallStatusReceiver();
        activeInstallCall = null;
        super.handleOnDestroy();
    }

    private String formatInstallError(String step, Exception error) {
        String exceptionName = error.getClass().getSimpleName();
        String exceptionMessage = error.getMessage();
        String firstStackLine = error.getStackTrace().length > 0
            ? error.getStackTrace()[0].toString()
            : "pilha indisponível";
        return step + " falhou: " + exceptionName
            + (exceptionMessage == null || exceptionMessage.trim().isEmpty()
                ? ""
                : ": " + exceptionMessage)
            + " | Pilha: " + firstStackLine;
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
