// src/services/appExit.ts
// 「退到桌面」的前端入口。返回键二次确认里点确定后调用。
//
// 原生侧复用 FoliaSystemBarsPlugin 的 moveToBack：moveTaskToBack(true) 保留任务栈，
// 再次进入时 WebView 的状态还在（比 finish() 更像按 Home）。

import { Capacitor, registerPlugin } from '@capacitor/core';

type FoliaSystemBarsPlugin = {
    setVisible(options: { visible: boolean }): Promise<void>;
    moveToBack(): Promise<void>;
};

const FoliaSystemBars = registerPlugin<FoliaSystemBarsPlugin>('FoliaSystemBars');

/** 退到桌面。非原生环境（浏览器预览）是空操作。 */
export const moveAppToBack = async (): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await FoliaSystemBars.moveToBack();
    } catch {
        // 旧壳没有这个方法：忽略，界面上的确认框已经关掉了
    }
};
