package top.izuna.foliamajor;

import android.app.Activity;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 系统栏（状态栏 + 导航栏）显示/隐藏开关。
 *
 * 这个应用默认是全屏沉浸的（MainActivity 里 IMMERSIVE_STICKY 把两条系统栏都藏起来）。
 * 有些用户希望在系统栏可见的情况下使用（例如要看时间、电量），所以把「隐藏」从写死
 * 改成可切换：前端设置开关 → 这个插件 → MainActivity.setSystemBarsVisible()。
 *
 * 状态存在 MainActivity 里而不是这里：窗口重新获得焦点时 onWindowFocusChanged 会重新
 * 应用系统栏，它必须知道用户选的是哪一种。
 */
@CapacitorPlugin(name = "FoliaSystemBars")
public class FoliaSystemBarsPlugin extends Plugin {

    /**
     * 退到桌面但保留任务栈（等同「按 Home」）。返回键的二次确认里点「退出」时走这里。
     * 放在这个插件里是因为它同属「窗口级行为」，为两个方法再开一个插件不值得。
     */
    @PluginMethod
    public void moveToBack(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("activity-unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            activity.moveTaskToBack(true);
            call.resolve();
        });
    }

    @PluginMethod
    public void setVisible(PluginCall call) {
        Boolean visible = call.getBoolean("visible", Boolean.FALSE);
        final boolean show = Boolean.TRUE.equals(visible);
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("activity-unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            if (activity instanceof MainActivity) {
                ((MainActivity) activity).setSystemBarsVisible(show);
                call.resolve();
            } else {
                call.reject("unsupported-activity");
            }
        });
    }

    /**
     * 播放中保持屏幕常亮（窗口 FLAG_KEEP_SCREEN_ON）。
     *
     * 单独一条通道而不是只用网页的 Screen Wake Lock：那个 API 要 Chrome 84，
     * 车机和不少老平板的 WebView 根本没有，开关打开也照黑屏。
     * 窗口标志由系统维护，页面隐藏时应用自己会关掉，语义和 Wake Lock 一样。
     */
    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        Boolean on = call.getBoolean("on", Boolean.FALSE);
        final boolean keep = Boolean.TRUE.equals(on);
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("activity-unavailable");
            return;
        }
        activity.runOnUiThread(() -> {
            if (activity instanceof MainActivity) {
                ((MainActivity) activity).setKeepScreenOn(keep);
                call.resolve();
            } else {
                call.reject("unsupported-activity");
            }
        });
    }
}
