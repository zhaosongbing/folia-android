package top.izuna.foliamajor;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Folia Android 全屏沉浸容器：
 * - 真全屏（状态栏/导航栏全隐藏，IMMERSIVE_STICKY + WindowInsetsController 双通道）；
 * - 刘海屏 / 挖孔屏适配（API 30+ ALWAYS，低版本 SHORT_EDGES）；
 * - WebView：混合内容放行 + 75% 等比缩放（wideViewPort + overviewMode + initialScale）；
 * - 注册 FoliaBridge（网络层扩展）与 FoliaNative（本地音乐 MediaStore/SAF + LocalAudioServer）。
 */
public class MainActivity extends BridgeActivity {

    /** 用户是否选择显示系统栏（状态栏 + 导航栏）。默认 false：与移植版一直以来的全屏沉浸一致。 */
    private boolean systemBarsVisible = false;
    /** 正在按用户选择设置系统栏，避免系统回调把自己又弹回全屏（会来回打架）。 */
    private boolean applyingSystemBars = false;

    /**
     * 供 FoliaSystemBarsPlugin 调用：显示或隐藏两条系统栏。
     * 选择会记在字段里，窗口重新获得焦点时按它重新应用，否则切回前台又变回全屏。
     */
    public void setSystemBarsVisible(boolean visible) {
        systemBarsVisible = visible;
        if (visible) {
            showSystemBars();
        } else {
            applyFullscreen();
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FoliaBridgePlugin.class);
        registerPlugin(FoliaCorePlugin.class);
        registerPlugin(FoliaSystemBarsPlugin.class);
        registerPlugin(FoliaUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        Bridge bridge = getBridge();
        if (bridge != null && bridge.getWebView() != null) {
            WebSettings ws = bridge.getWebView().getSettings();
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
            ws.setUseWideViewPort(true);
            ws.setLoadWithOverviewMode(true);
            ws.setSupportZoom(false);
            ws.setBuiltInZoomControls(false);
            bridge.getWebView().setInitialScale(75);
        }
        applyFullscreen();
        applyCutoutMode();
        getWindow().getDecorView().postDelayed(this::applyFullscreen, 500);
        getWindow().getDecorView().postDelayed(this::applyCutoutMode, 500);
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(visibility -> {
            if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0) applyFullscreen();
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyFullscreen();
            applyCutoutMode();
        }
    }

    private void applyFullscreen() {
        // 用户选了「显示系统栏」就不要把人按回全屏
        if (systemBarsVisible) {
            showSystemBars();
            return;
        }
        if (applyingSystemBars) {
            return;
        }
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(android.view.WindowInsets.Type.statusBars() | android.view.WindowInsets.Type.navigationBars());
                c.setSystemBarsBehavior(android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        }
    }

    /** 显示状态栏与导航栏，并把窗口从「全屏」恢复成常规布局。 */
    private void showSystemBars() {
        if (applyingSystemBars) {
            return;
        }
        applyingSystemBars = true;
        try {
            View decor = getWindow().getDecorView();
            // 去掉隐藏标志，但保留 layout 标志：内容仍延伸到系统栏下方，避免整页跳一下
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            getWindow().setStatusBarColor(Color.TRANSPARENT);
            getWindow().setNavigationBarColor(Color.TRANSPARENT);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                getWindow().setDecorFitsSystemWindows(false);
                android.view.WindowInsetsController controller = getWindow().getInsetsController();
                if (controller != null) {
                    controller.show(android.view.WindowInsets.Type.statusBars()
                            | android.view.WindowInsets.Type.navigationBars());
                    controller.setSystemBarsBehavior(
                            android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                }
            }
        } finally {
            applyingSystemBars = false;
        }
    }

    /**
     * 系统返回键先问 Web 层：有弹窗就让弹窗关掉，没有弹窗再按设置决定是否二次确认。
     *
     * 为什么不用 @capacitor/app 的 backButton 事件：这里只想要「拦一下、问一句」，
     * 为此装一个插件不划算；直接用 WebView.evaluateJavascript 回调，JS 侧返回
     * 'handled'（已处理）或 'exit'（可以走）。
     */
    @Override
    public void onBackPressed() {
        com.getcapacitor.Bridge bridge = getBridge();
        android.webkit.WebView webView = bridge != null ? bridge.getWebView() : null;
        if (webView == null) {
            moveTaskToBack(true);
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return window.__foliaHandleBack?window.__foliaHandleBack():'exit';}catch(e){return 'exit';}})()",
                value -> {
                    String result = value == null ? "" : value.replace("\"", "").trim();
                    if (!"handled".equals(result)) {
                        // 退到桌面但保留任务栈：比 finish() 更接近「按 Home」的观感，
                        // 再次进入时 WebView 状态还在。
                        runOnUiThread(() -> moveTaskToBack(true));
                    }
                });
    }

    private void applyCutoutMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attributes = getWindow().getAttributes();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                attributes.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS;
            } else {
                attributes.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            }
            getWindow().setAttributes(attributes);
        }
    }
}
