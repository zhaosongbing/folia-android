package top.izuna.foliamajor;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 应用内下载并安装更新包。
 *
 * 为什么不用系统浏览器跳转：浏览器下载完还要用户自己去文件管理器点开，中间少一步就断了。
 * 这里直接下载到应用 cache 目录，再用 FileProvider 把 content:// URI 交给系统安装器，
 * 用户只需要在安装器上确认一次。
 *
 * 相关配置：
 * - FileProvider 在 AndroidManifest 里已声明（authorities = ${applicationId}.fileprovider）；
 * - res/xml/file_paths.xml 里已有 cache-path，所以 APK 放在 cacheDir 下即可被共享；
 * - 安装未知来源应用需要 REQUEST_INSTALL_PACKAGES 权限（清单里已加）。
 */
@CapacitorPlugin(name = "FoliaUpdate")
public class FoliaUpdatePlugin extends Plugin {

    private static final String UPDATE_DIR = "updates";

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName", "folia-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("missing-url");
            return;
        }
        // 只接受 apk 后缀：安装器认这个，也避免把别的文件当安装包打开
        if (!fileName.toLowerCase().endsWith(".apk")) {
            fileName = fileName + ".apk";
        }
        final String finalName = fileName;

        Context context = getContext();
        new Thread(() -> {
            File target = null;
            try {
                File dir = new File(context.getCacheDir(), UPDATE_DIR);
                if (!dir.exists() && !dir.mkdirs()) {
                    call.reject("cache-dir-unavailable");
                    return;
                }
                target = new File(dir, finalName);

                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.connect();

                int status = connection.getResponseCode();
                if (status != HttpURLConnection.HTTP_OK) {
                    call.reject("http-" + status);
                    return;
                }

                long total = connection.getContentLengthLong();
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[8192];
                    long written = 0;
                    int lastPercent = -1;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        written += read;
                        if (total > 0) {
                            int percent = (int) (written * 100 / total);
                            // 只在百分比变化时回调，避免每 8KB 都过一次桥
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                JSObject progress = new JSObject();
                                progress.put("percent", percent);
                                progress.put("received", written);
                                progress.put("total", total);
                                notifyListeners("downloadProgress", progress);
                            }
                        }
                    }
                    output.flush();
                }

                installApk(context, target);
                JSObject result = new JSObject();
                result.put("path", target.getAbsolutePath());
                result.put("size", target.length());
                call.resolve(result);
            } catch (Exception error) {
                if (target != null && target.exists()) {
                    // 下了一半的文件留着只会占空间，也不会有人再用
                    //noinspection ResultOfMethodCallIgnored
                    target.delete();
                }
                call.reject(error.getClass().getSimpleName() + ": " + error.getMessage());
            }
        }).start();
    }

    /** 把下载好的 APK 交给系统安装器。 */
    private void installApk(Context context, File apk) {
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        // WebView 里启动需要 NEW_TASK，否则 ActivityNotFoundException
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        }
        context.startActivity(intent);
    }
}
