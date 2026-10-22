// src/stores/useAppUpdateStore.ts
// 在线更新的状态中心：开关、检查结果、被跳过的版本、正在检查。
//
// 为什么单独一个 store 而不是塞进播放页/桌面设置：更新是应用级的事，
// 启动流程、设置页按钮、弹窗三处都要读同一份状态，放在某个页面域的 store 里会互相牵扯。

import { create } from 'zustand';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';
import {
    DEFAULT_UPDATE_SOURCE_URL,
    checkForAppUpdate,
    getCurrentAppVersion,
    type AppUpdateInfo,
} from '../services/appUpdate';

const ENABLE_KEY = 'enable_app_update_check';
const SKIPPED_VERSION_KEY = 'app_update_skipped_version';
const SOURCE_URL_KEY = 'app_update_source_url';

const readStoredString = (key: string, fallback: string): string => {
    if (typeof window === 'undefined') return fallback;
    const value = localStorage.getItem(key);
    return value && value.trim() ? value.trim() : fallback;
};

const readSkippedVersion = (): string | null => {
    if (typeof window === 'undefined') return null;
    const value = localStorage.getItem(SKIPPED_VERSION_KEY);
    return value && value.trim() ? value.trim() : null;
};

export type AppUpdateState = {
    /** 允许检查更新。默认开。 */
    enableAppUpdateCheck: boolean;
    /** 更新源（GitHub releases/latest 形式的 URL）。 */
    sourceUrl: string;
    /** 用户选择「稍后」时记下的版本，同一个版本不再打扰。 */
    skippedVersion: string | null;
    /** 当前版本，来自构建注入。 */
    currentVersion: string;
    isChecking: boolean;
    /** 最近一次检查到的可用更新；null 表示没有（或还没查过）。 */
    availableUpdate: AppUpdateInfo | null;
    /** 最近一次检查的结论文案键，用于设置页显示「已是最新 / 检查失败」。 */
    lastResult: 'idle' | 'current' | 'checking' | 'error';

    handleToggleAppUpdateCheck: (enable: boolean) => void;
    handleSetUpdateSourceUrl: (url: string) => void;
    handleSkipUpdateVersion: (version: string) => void;
    /**
     * 执行一次检查。
     * `manual` 为 true 时（设置页点按钮）不受「已跳过版本」限制，用户主动问就得答。
     * 返回结果，方便调用方决定要不要弹窗。
     */
    checkNow: (manual: boolean) => Promise<'update' | 'current' | 'error' | 'skipped' | 'disabled'>;
    /** 关掉弹窗但不跳过：下次启动还会提示。 */
    dismissUpdate: () => void;
};

export const useAppUpdateStore = create<AppUpdateState>((set, get) => ({
    enableAppUpdateCheck: getStoredBoolean(ENABLE_KEY, true),
    sourceUrl: readStoredString(SOURCE_URL_KEY, DEFAULT_UPDATE_SOURCE_URL),
    skippedVersion: readSkippedVersion(),
    currentVersion: getCurrentAppVersion(),
    isChecking: false,
    availableUpdate: null,
    lastResult: 'idle',

    handleToggleAppUpdateCheck: (enable) => {
        setStoredBoolean(ENABLE_KEY, enable);
        set({ enableAppUpdateCheck: enable });
    },

    handleSetUpdateSourceUrl: (url) => {
        const trimmed = url.trim();
        if (typeof window !== 'undefined') {
            if (trimmed) localStorage.setItem(SOURCE_URL_KEY, trimmed);
            else localStorage.removeItem(SOURCE_URL_KEY);
        }
        set({ sourceUrl: trimmed || DEFAULT_UPDATE_SOURCE_URL });
    },

    handleSkipUpdateVersion: (version) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(SKIPPED_VERSION_KEY, version);
        }
        set({ skippedVersion: version, availableUpdate: null });
    },

    dismissUpdate: () => set({ availableUpdate: null }),

    checkNow: async (manual) => {
        const { enableAppUpdateCheck, sourceUrl, skippedVersion } = get();
        if (!enableAppUpdateCheck && !manual) {
            return 'disabled';
        }

        set({ isChecking: true, lastResult: 'checking' });
        const result = await checkForAppUpdate(sourceUrl);
        set({ isChecking: false });

        if (result.status === 'error') {
            set({ availableUpdate: null, lastResult: 'error' });
            return 'error';
        }
        if (result.status === 'current') {
            set({ availableUpdate: null, lastResult: 'current' });
            return 'current';
        }

        // 用户之前对这个版本点过「稍后」：手动检查仍然弹，启动时的自动检查不弹
        if (!manual && skippedVersion === result.info.latestVersion) {
            set({ availableUpdate: null, lastResult: 'current' });
            return 'skipped';
        }

        set({ availableUpdate: result.info, lastResult: 'current' });
        return 'update';
    },
}));
