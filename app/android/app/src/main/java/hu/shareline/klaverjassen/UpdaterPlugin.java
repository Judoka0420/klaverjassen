package hu.shareline.klaverjassen;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Self-update helper for the sideloaded (non-Play-Store) APK.
 *
 *  - getCurrentVersion()      -> { code, name } of the installed APK
 *  - httpGet({ url })         -> { body }  (native GET; avoids WebView CORS on GitHub assets)
 *  - downloadAndInstall({url})-> downloads the APK via DownloadManager, then launches the
 *                                system installer (the "Install?" prompt) via FileProvider.
 *
 * The JS side (update.js) fetches version.json with httpGet, compares versionCode, and only
 * calls downloadAndInstall when a newer build exists.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    @PluginMethod
    public void getCurrentVersion(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            long code = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ? pi.getLongVersionCode() : pi.versionCode;
            JSObject r = new JSObject();
            r.put("code", code);
            r.put("name", pi.versionName);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read installed version", e);
        }
    }

    @PluginMethod
    public void httpGet(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null) { call.reject("Missing url"); return; }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);
                conn.setRequestProperty("Accept", "application/json");
                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) { call.reject("HTTP " + status); return; }
                StringBuilder sb = new StringBuilder();
                BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"));
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();
                JSObject r = new JSObject();
                r.put("body", sb.toString());
                call.resolve(r);
            } catch (Exception e) {
                call.reject("Request failed: " + e.getMessage(), e);
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null) { call.reject("Missing url"); return; }
        final Context ctx = getContext();

        // Android O+ requires per-source permission to install unknown apps.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !ctx.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent perm = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + ctx.getPackageName()));
                perm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(perm);
            } catch (Exception ignored) { }
            call.reject("install-permission-required");
            return;
        }

        try {
            File dest = new File(ctx.getExternalFilesDir(null), "update.apk");
            if (dest.exists() && !dest.delete()) { /* stale copy; DownloadManager overwrites */ }

            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle("Klaverjassen update");
            req.setMimeType("application/vnd.android.package-archive");
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(ctx, null, "update.apk");
            final long id = dm.enqueue(req);

            BroadcastReceiver onDone = new BroadcastReceiver() {
                @Override
                public void onReceive(Context c, Intent intent) {
                    long got = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (got != id) return;
                    try { c.unregisterReceiver(this); } catch (Exception ignored) { }

                    // Verify the download actually succeeded before firing the installer.
                    DownloadManager.Query q = new DownloadManager.Query().setFilterById(id);
                    android.database.Cursor cur = dm.query(q);
                    boolean ok = false;
                    if (cur != null && cur.moveToFirst()) {
                        int st = cur.getInt(cur.getColumnIndex(DownloadManager.COLUMN_STATUS));
                        ok = (st == DownloadManager.STATUS_SUCCESSFUL);
                    }
                    if (cur != null) cur.close();
                    if (!ok) { call.reject("download-failed"); return; }

                    Uri apkUri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", dest);
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    install.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    c.startActivity(install);
                    call.resolve();
                }
            };
            ContextCompat.registerReceiver(ctx, onDone,
                    new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                    ContextCompat.RECEIVER_EXPORTED);
        } catch (Exception e) {
            call.reject("Download/install failed: " + e.getMessage(), e);
        }
    }
}
