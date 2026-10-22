// src/services/systemBars.ts
// 系统栏（状态栏 + 导航栏）显示开关的前端入口。
//
// 原生侧：FoliaSystemBarsPlugin → MainActivity.setSystemBarsVisible()。
// 默认是全屏沉浸（两条系统栏都隐藏），这是移植版一直以来的行为，所以这个开关默认关闭。
//
// 非原生环境（浏览器预览）直接跳过：没有原生壳时没有任何系统栏可谈。

import { Capacitor, registerPlugin } from '@capacitor/core';

type FoliaSystemBarsPlugin = {
    setVisible(options: { visible: boolean }): Promise<void>;
};

const FoliaSystemBars = registerPlugin<FoliaSystemBarsPlugin>('FoliaSystemBars');

/**
 * 按设置应用系统栏可见性。
 *
 * 失败一律吞掉：老版本原生壳没有这个插件，抛错不应该影响启动流程或设置界面。
 */
export const applySystemBarsVisibility = async (visible: boolean): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    try {
        await FoliaSystemBars.setVisible({ visible });
    } catch {
        // 插件不存在（旧壳）或原生调用失败：保持现状即可
    }
};
