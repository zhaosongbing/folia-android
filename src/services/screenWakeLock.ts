// src/services/screenWakeLock.ts
// 播放时保持屏幕常亮（Screen Wake Lock API）。
//
// 为什么用 Wake Lock 而不是给 Activity 加 FLAG_KEEP_SCREEN_ON：
// 后者是原生窗口标志，一旦设置，页面隐藏、暂停播放都不会自动失效，
// 容易忘了解释 —— 而「只在播放中亮着、其余交还系统」正是这个需求的核心。
// Wake Lock 的 sentinel 在页面切到后台时由系统自动释放，语义天然对上。
//
// 浏览器不支持时静默失败：常亮只是体验优化，不该因此打断播放。

/** Wake Lock 的 sentinel；release() 之后不能再次使用。 */
export type ScreenWakeLockSentinel = { release: () => Promise<void> };

type WakeLockNavigator = Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<ScreenWakeLockSentinel> };
};

/** 当前环境是否支持屏幕常亮。 */
export const isScreenWakeLockSupported = (): boolean =>
    typeof navigator !== 'undefined' && 'wakeLock' in navigator;

/**
 * 请求屏幕常亮。页面不可见时会被系统拒绝，所以调用方应先看 visibilityState。
 * 拿不到（不支持、被拒绝、页面隐藏）时返回 null，不抛异常。
 */
export const requestScreenWakeLock = async (): Promise<ScreenWakeLockSentinel | null> => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return null;
    }
    const api = (navigator as WakeLockNavigator).wakeLock;
    if (!api) return null;
    try {
        return await api.request('screen');
    } catch {
        // 被拒绝（省电模式、低电量、页面不可见）时静默：下次状态变化会再试
        return null;
    }
};

/** 释放已持有的 sentinel；重复调用安全。 */
export const releaseScreenWakeLock = async (
    sentinel: ScreenWakeLockSentinel | null,
): Promise<void> => {
    if (!sentinel) return;
    try {
        await sentinel.release();
    } catch {
        // 已经被系统释放掉了，再 release 会 reject，忽略即可
    }
};
