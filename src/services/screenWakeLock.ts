// src/services/screenWakeLock.ts
// 播放时保持屏幕常亮。
//
// 两条通道，原生优先：
//   1. Capacitor 原生壳里的窗口标志 FLAG_KEEP_SCREEN_ON（FoliaSystemBars.setKeepScreenOn）。
//      这是唯一在所有设备上都有效的通道 —— 车机、老平板的 WebView 常常是 Chrome 70 上下，
//      根本没有 navigator.wakeLock（那个 API 要 Chrome 84），只走网页那条路时开关看着打开了、
//      屏幕照样灭，这就是「加了常亮但不起作用」的根因。
//   2. 浏览器 / Electron 渲染进程里的 Screen Wake Lock。
//
// sentinel 被系统释放之后必须能被重新申请：以前把 sentinel 存在闭包里，系统悄悄释放
// （切后台、锁屏、切到别的应用）之后局部变量还是非空，acquire() 直接 return，
// 回到前台就再也拿不回来了。这里记录一个「是否仍持有」的状态，release 事件一到就清掉。

import { Capacitor } from '@capacitor/core';
import { FoliaSystemBars } from './systemBars';

/** Wake Lock 的 sentinel；release() 之后不能再次使用。 */
export type ScreenWakeLockSentinel = {
    release: () => Promise<void>;
    released?: boolean;
    addEventListener?: (type: 'release', listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<ScreenWakeLockSentinel> };
};

/** 这个环境能不能保持屏幕常亮（原生壳或支持 Wake Lock 的浏览器）。 */
export const isScreenWakeLockSupported = (): boolean =>
    Capacitor.isNativePlatform()
    || (typeof navigator !== 'undefined' && 'wakeLock' in navigator);

/** 原生壳里窗口标志的当前状态，避免每次 sync 都跨桥调用一次。 */
let nativeKeepOn = false;
/** 浏览器通道当前持有的 sentinel。 */
let heldSentinel: ScreenWakeLockSentinel | null = null;
/** 最后一次希望的状态：申请与释放的竞态按它收敛。 */
let wanted = false;

const acquireBrowserLock = async (): Promise<void> => {
    const api = (navigator as WakeLockNavigator).wakeLock;
    if (!api || heldSentinel) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    try {
        const sentinel = await api.request('screen');
        // 申请期间状态又变了：立刻还回去，不要留下一个没人管的锁。
        if (!wanted) {
            void sentinel.release().catch(() => undefined);
            return;
        }
        heldSentinel = sentinel;
        // 系统在页面隐藏、锁屏、切到别的应用时会自己释放；这里跟着清掉，
        // 否则下一次 acquire 会被这个已失效的非空引用挡住。
        sentinel.addEventListener?.('release', () => {
            if (heldSentinel === sentinel) heldSentinel = null;
        });
    } catch {
        // 被拒绝（省电模式、低电量、页面不可见）时静默：下次状态变化会再试
    }
};

const releaseBrowserLock = (): void => {
    const sentinel = heldSentinel;
    heldSentinel = null;
    if (!sentinel) return;
    void Promise.resolve(sentinel.release()).catch(() => undefined);
};

/**
 * 按需要打开或关掉屏幕常亮。原生壳走窗口标志，其余走 Wake Lock。
 * 失败一律吞掉：常亮只是体验优化，不该因此打断播放。
 */
export const applyScreenWakeLock = async (on: boolean): Promise<void> => {
    wanted = on;

    if (Capacitor.isNativePlatform()) {
        if (nativeKeepOn === on) return;
        nativeKeepOn = on;
        try {
            await FoliaSystemBars.setKeepScreenOn({ on });
        } catch {
            // 旧壳没有这个方法：回到网页通道再试一次，能拿到就还是亮的
            nativeKeepOn = false;
            if (on) await acquireBrowserLock();
            else releaseBrowserLock();
        }
        return;
    }

    if (on) await acquireBrowserLock();
    else releaseBrowserLock();
};

/**
 * 页面可见性变了要把「想要的状态」重新对一遍：系统已经释放掉的锁要重新申请，
 * 页面隐藏时（浏览器通道）要还回去。调用方在 visibilitychange 里调它。
 */
export const resyncScreenWakeLock = async (wantOn: boolean): Promise<void> => {
    if (!wantOn) {
        await applyScreenWakeLock(false);
        return;
    }
    if (Capacitor.isNativePlatform()) {
        // 窗口标志在后台不生效，回来时按需要重设一次。
        if (nativeKeepOn !== true) {
            nativeKeepOn = false;
            await applyScreenWakeLock(true);
        }
        return;
    }
    // 浏览器通道：页面隐藏时系统会释放，回到前台由这里重新申请。
    await applyScreenWakeLock(true);
};
