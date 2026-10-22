// src/services/appUpdateDownload.ts
// 应用内下载更新包并拉起系统安装器。
//
// 原生侧：FoliaUpdatePlugin（下载到 cacheDir/updates，再用 FileProvider 交给安装器）。
// 浏览器预览没有原生壳，调用方应退回「打开链接」的老路径。

import { Capacitor, registerPlugin } from '@capacitor/core';

export type DownloadProgress = {
    percent: number;
    received: number;
    total: number;
};

type FoliaUpdatePlugin = {
    downloadAndInstall(options: { url: string; fileName: string }): Promise<{ path: string; size: number }>;
    addListener(
        eventName: 'downloadProgress',
        listener: (data: DownloadProgress) => void,
    ): Promise<{ remove: () => Promise<void> }>;
};

const FoliaUpdate = registerPlugin<FoliaUpdatePlugin>('FoliaUpdate');

/** 原生端能不能走应用内下载（浏览器里不能）。 */
export const canDownloadUpdateInApp = (): boolean => Capacitor.isNativePlatform();

/** 从下载链接里取文件名；取不到就用一个固定名，后缀必须保留 .apk。 */
export const resolveUpdateFileName = (downloadUrl: string, version: string): string => {
    try {
        const path = new URL(downloadUrl).pathname;
        const last = path.split('/').filter(Boolean).pop() ?? '';
        if (last.toLowerCase().endsWith('.apk')) return decodeURIComponent(last);
    } catch {
        // 非法 URL 就走兜底名
    }
    return `Folia-${version}.apk`;
};

/**
 * 下载并安装。
 *
 * `onProgress` 会在下载过程中被反复调用；返回的函数负责摘掉监听 —— 调用方要在结束时
 * （成功、失败都算）调一次，否则每次点下载都会多挂一个监听。
 */
export const downloadAndInstallUpdate = async (
    downloadUrl: string,
    version: string,
    onProgress?: (progress: DownloadProgress) => void,
): Promise<{ path: string; size: number }> => {
    let handle: { remove: () => Promise<void> } | null = null;
    if (onProgress) {
        handle = await FoliaUpdate.addListener('downloadProgress', onProgress);
    }
    try {
        return await FoliaUpdate.downloadAndInstall({
            url: downloadUrl,
            fileName: resolveUpdateFileName(downloadUrl, version),
        });
    } finally {
        await handle?.remove();
    }
};
