// src/stores/useSettingsModalStore.ts
// The settings dialog's own UI state: which tab and subview are open, the user-guide gate, the
// pinned command slots, and the app language preference.
//
// Split out of useSettingsUiStore — this is chrome around the settings, not a setting itself.

import { create } from 'zustand';
import i18n from '../i18n/config';


import { normalizePinnedCommandIds, readPinnedCommandIds, writePinnedCommandIds, type PinnedCommandIds } from '../components/command-palette/pinnedCommandPreferences';
import { applyAppLanguagePreference, readStoredAppLanguagePreference, type AppLanguagePreference } from '../i18n/config';
import { setStatusMessage } from './useStatusMessageStore';
import type { SettingsAnchorId } from '../components/modal/settings/navigation/settingsAnchorModel';

export type SettingsModalInitialTab = 'help' | 'options';

export type SettingsSubviewId = 'appearance' | 'player' | 'home' | 'playback' | 'lyrics' | 'general' | 'interaction' | 'integration' | 'storage' | 'desktop' | 'graphics' | 'mods' | 'visualizer' | 'themePark' | 'lyricFilter' | 'globalLyricOffset';

/** 歌词动画调参台的四页。列成数组是为了让「思索」的设置直达在单测里能核对 section 真实存在。 */
export const VISUALIZER_SETTINGS_SECTIONS = ['common', 'background', 'visualizer', 'subtitle'] as const;
export type VisualizerSettingsSection = typeof VISUALIZER_SETTINGS_SECTIONS[number];

export type SettingsModalState = {
    isOpen: boolean;
    initialTab: SettingsModalInitialTab;
    initialSubview?: SettingsSubviewId | null;
    initialVisualizerSection?: VisualizerSettingsSection | null;
    /**
     * A section inside the subview to land on, rather than its top. The sidebar table of contents
     * already knows how to scroll to one; this is the same destination, reachable from outside.
     * Carries a seq so that asking for the same anchor twice still scrolls the second time.
     * `rowId` names one row inside the section (its `data-settings-row`) to land on and outline;
     * while that row is not on the page the landing falls back to the section.
     */
    initialAnchor?: { id: SettingsAnchorId; rowId?: string; seq: number } | null;
};

// Separate from the retired guide key so people who saw the old carousel still receive the Ponder lesson.
const LAST_SEEN_GUIDE_VERSION_STORAGE_KEY = 'folia_last_seen_ponder_onboarding_version';
/** 设置弹窗顶部分组标签下方那条滑动指示线的显隐。 */
const SETTINGS_TAB_INDICATOR_KEY = 'settings_tab_indicator';
/** 设置弹窗的高斯模糊：模糊半径（px）与面板不透明度（%）。 */
const SETTINGS_BLUR_PX_KEY = 'settings_modal_blur_px';
const SETTINGS_OPACITY_KEY = 'settings_modal_opacity';
/** 折叠组卡片自己的模糊与不透明度：与面板分开存，互不影响。 */
const SETTINGS_FOLD_BLUR_PX_KEY = 'settings_fold_blur_px';
const SETTINGS_FOLD_OPACITY_KEY = 'settings_fold_opacity';

/** 模糊半径的调节范围与默认值。0 = 不模糊（纯色面板）。 */
export const SETTINGS_BLUR_MIN_PX = 0;
export const SETTINGS_BLUR_MAX_PX = 40;
export const SETTINGS_BLUR_DEFAULT_PX = 18;
/** 面板不透明度的调节范围与默认值（%）。越低越透，模糊背后越明显。 */
export const SETTINGS_OPACITY_MIN_PERCENT = 40;
export const SETTINGS_OPACITY_MAX_PERCENT = 100;
export const SETTINGS_OPACITY_DEFAULT_PERCENT = 86;

/** 折叠组卡片：默认值与改动前的观感一致（模糊跟面板同一档，卡片底色 72%）。 */
export const SETTINGS_FOLD_BLUR_DEFAULT_PX = SETTINGS_BLUR_DEFAULT_PX;
export const SETTINGS_FOLD_OPACITY_MIN_PERCENT = 30;
export const SETTINGS_FOLD_OPACITY_MAX_PERCENT = 100;
export const SETTINGS_FOLD_OPACITY_DEFAULT_PERCENT = 72;

export type SettingsModalUiState = {
    appLanguagePreference: AppLanguagePreference;
    pinnedCommandIds: PinnedCommandIds;
    isSubSettingsViewOpen: boolean;
    settingsModalState: SettingsModalState;
    lastSeenGuideVersion: string | null;
    isUserGuideModalOpen: boolean;
    /** 设置弹窗顶部分组标签的滑动指示线，默认显示。 */
    showTabIndicator: boolean;
    /** 设置弹窗面板的高斯模糊半径（px），0 为不模糊。 */
    settingsBlurPx: number;
    /** 设置弹窗面板的不透明度（%），配合模糊决定背后透出多少。 */
    settingsOpacityPercent: number;
    /** 设置弹窗里折叠组卡片自己的高斯模糊半径（px），0 为不模糊。 */
    settingsFoldBlurPx: number;
    /** 折叠组卡片自己的不透明度（%）。比面板低一点，卡片才不会像一块实心板压在玻璃上。 */
    settingsFoldOpacityPercent: number;
    setLastSeenGuideVersion: (version: string) => void;
    setShowTabIndicator: (show: boolean) => void;
    setSettingsBlurPx: (px: number) => void;
    setSettingsOpacityPercent: (percent: number) => void;
    setSettingsFoldBlurPx: (px: number) => void;
    setSettingsFoldOpacityPercent: (percent: number) => void;
    setIsUserGuideModalOpen: (isOpen: boolean) => void;
    setIsSubSettingsViewOpen: (open: boolean) => void;
    openSettings: (
        initialTab?: SettingsModalInitialTab,
        initialSubview?: SettingsSubviewId | null,
        initialVisualizerSection?: VisualizerSettingsSection | null,
        initialAnchorId?: SettingsAnchorId | null,
        initialRowId?: string | null,
    ) => void;
    closeSettings: () => void;
    handleSetAppLanguagePreference: (preference: AppLanguagePreference) => Promise<void>;
    setPinnedCommandId: (slotIndex: number, commandId: string | null) => void;
};

const readStoredTabIndicator = (): boolean => {
    if (typeof localStorage === 'undefined') return true;
    try {
        return localStorage.getItem(SETTINGS_TAB_INDICATOR_KEY) !== 'off';
    } catch {
        return true;
    }
};

const clampInt = (value: number, min: number, max: number, fallback: number): number => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.round(value)));
};

const readStoredBlurPx = (): number => {
    if (typeof localStorage === 'undefined') return SETTINGS_BLUR_DEFAULT_PX;
    try {
        const raw = Number.parseInt(localStorage.getItem(SETTINGS_BLUR_PX_KEY) ?? '', 10);
        return clampInt(raw, SETTINGS_BLUR_MIN_PX, SETTINGS_BLUR_MAX_PX, SETTINGS_BLUR_DEFAULT_PX);
    } catch {
        return SETTINGS_BLUR_DEFAULT_PX;
    }
};

const readStoredOpacityPercent = (): number => {
    if (typeof localStorage === 'undefined') return SETTINGS_OPACITY_DEFAULT_PERCENT;
    try {
        const raw = Number.parseInt(localStorage.getItem(SETTINGS_OPACITY_KEY) ?? '', 10);
        return clampInt(raw, SETTINGS_OPACITY_MIN_PERCENT, SETTINGS_OPACITY_MAX_PERCENT, SETTINGS_OPACITY_DEFAULT_PERCENT);
    } catch {
        return SETTINGS_OPACITY_DEFAULT_PERCENT;
    }
};

const readStoredFoldBlurPx = (): number => {
    if (typeof localStorage === 'undefined') return SETTINGS_FOLD_BLUR_DEFAULT_PX;
    try {
        const raw = Number.parseInt(localStorage.getItem(SETTINGS_FOLD_BLUR_PX_KEY) ?? '', 10);
        return clampInt(raw, SETTINGS_BLUR_MIN_PX, SETTINGS_BLUR_MAX_PX, SETTINGS_FOLD_BLUR_DEFAULT_PX);
    } catch {
        return SETTINGS_FOLD_BLUR_DEFAULT_PX;
    }
};

const readStoredFoldOpacityPercent = (): number => {
    if (typeof localStorage === 'undefined') return SETTINGS_FOLD_OPACITY_DEFAULT_PERCENT;
    try {
        const raw = Number.parseInt(localStorage.getItem(SETTINGS_FOLD_OPACITY_KEY) ?? '', 10);
        return clampInt(raw, SETTINGS_FOLD_OPACITY_MIN_PERCENT, SETTINGS_FOLD_OPACITY_MAX_PERCENT, SETTINGS_FOLD_OPACITY_DEFAULT_PERCENT);
    } catch {
        return SETTINGS_FOLD_OPACITY_DEFAULT_PERCENT;
    }
};

export const useSettingsModalStore = create<SettingsModalUiState>((set, get) => ({
    appLanguagePreference: readStoredAppLanguagePreference(),
    pinnedCommandIds: readPinnedCommandIds(),
    isSubSettingsViewOpen: false,
    settingsModalState: {
        isOpen: false,
        initialTab: 'help',
        initialSubview: null,
        initialVisualizerSection: null,
        initialAnchor: null,
    },
    lastSeenGuideVersion: typeof window !== 'undefined' ? localStorage.getItem(LAST_SEEN_GUIDE_VERSION_STORAGE_KEY) : null,
    isUserGuideModalOpen: false,
    showTabIndicator: readStoredTabIndicator(),
    settingsBlurPx: readStoredBlurPx(),
    settingsOpacityPercent: readStoredOpacityPercent(),
    settingsFoldBlurPx: readStoredFoldBlurPx(),
    settingsFoldOpacityPercent: readStoredFoldOpacityPercent(),
    setLastSeenGuideVersion: (version) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(LAST_SEEN_GUIDE_VERSION_STORAGE_KEY, version);
        }
        set({ lastSeenGuideVersion: version });
    },
    setIsUserGuideModalOpen: (isOpen) => set({ isUserGuideModalOpen: isOpen }),
    setIsSubSettingsViewOpen: (open) => set({ isSubSettingsViewOpen: open }),
    openSettings: (initialTab = 'help', initialSubview = null, initialVisualizerSection = null, initialAnchorId = null, initialRowId = null) => set({
        settingsModalState: {
            isOpen: true,
            initialTab,
            initialSubview,
            initialVisualizerSection,
            initialAnchor: initialAnchorId
                ? {
                    id: initialAnchorId,
                    ...(initialRowId ? { rowId: initialRowId } : {}),
                    seq: (get().settingsModalState.initialAnchor?.seq ?? 0) + 1,
                }
                : null,
        },
    }),
    setShowTabIndicator: (show) => {
        set({ showTabIndicator: show });
        try {
            localStorage.setItem(SETTINGS_TAB_INDICATOR_KEY, show ? 'on' : 'off');
        } catch {
            // 隐私模式下写不进去，本次会话仍然生效
        }
    },
    setSettingsBlurPx: (px) => {
        const clamped = clampInt(px, SETTINGS_BLUR_MIN_PX, SETTINGS_BLUR_MAX_PX, SETTINGS_BLUR_DEFAULT_PX);
        set({ settingsBlurPx: clamped });
        try {
            localStorage.setItem(SETTINGS_BLUR_PX_KEY, String(clamped));
        } catch {
            // 存储写不进去时至少让本次会话生效
        }
    },
    setSettingsOpacityPercent: (percent) => {
        const clamped = clampInt(percent, SETTINGS_OPACITY_MIN_PERCENT, SETTINGS_OPACITY_MAX_PERCENT, SETTINGS_OPACITY_DEFAULT_PERCENT);
        set({ settingsOpacityPercent: clamped });
        try {
            localStorage.setItem(SETTINGS_OPACITY_KEY, String(clamped));
        } catch {
            // 存储写不进去时至少让本次会话生效
        }
    },
    setSettingsFoldBlurPx: (px) => {
        const clamped = clampInt(px, SETTINGS_BLUR_MIN_PX, SETTINGS_BLUR_MAX_PX, SETTINGS_FOLD_BLUR_DEFAULT_PX);
        set({ settingsFoldBlurPx: clamped });
        try {
            localStorage.setItem(SETTINGS_FOLD_BLUR_PX_KEY, String(clamped));
        } catch {
            // 存储写不进去时至少让本次会话生效
        }
    },
    setSettingsFoldOpacityPercent: (percent) => {
        const clamped = clampInt(percent, SETTINGS_FOLD_OPACITY_MIN_PERCENT, SETTINGS_FOLD_OPACITY_MAX_PERCENT, SETTINGS_FOLD_OPACITY_DEFAULT_PERCENT);
        set({ settingsFoldOpacityPercent: clamped });
        try {
            localStorage.setItem(SETTINGS_FOLD_OPACITY_KEY, String(clamped));
        } catch {
            // 存储写不进去时至少让本次会话生效
        }
    },
    closeSettings: () => set(state => ({
        settingsModalState: {
            ...state.settingsModalState,
            isOpen: false,
        },
    })),
    handleSetAppLanguagePreference: async (preference) => {
        await applyAppLanguagePreference(preference);
        set({ appLanguagePreference: preference });
        const getLanguageLabel = (pref: AppLanguagePreference): string => {
            switch (pref) {
                case 'zh-CN': return i18n.t('options.appLanguageZhCN', { lng: 'zh-CN' });
                case 'zh-TW': return i18n.t('options.appLanguageZhTW', { lng: 'zh-TW' });
                case 'in': return i18n.t('options.appLanguageInID', { lng: 'in' });
                case 'en': return i18n.t('options.appLanguageEnUS', { lng: 'en' });
                default: return '';
            }
        };

        setStatusMessage({
            type: 'info',
            text: preference === 'system'
                ? i18n.t('notifications.langFollowSystem')
                : i18n.t('notifications.langManual', { language: getLanguageLabel(preference) }),
        });
    },
    setPinnedCommandId: (slotIndex, commandId) => {
        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= 3) {
            return;
        }
        const current = get().pinnedCommandIds;
        const next = normalizePinnedCommandIds(
            current.map((currentCommandId, index) => (
                index === slotIndex ? commandId : currentCommandId
            )),
        );
        writePinnedCommandIds(next);
        set({ pinnedCommandIds: next });
    },
}));

/**
 * The SettingsModal half of the former settings snapshot, for the surfaces that
 * legitimately edit this whole domain at once. Ordinary consumers select one field instead.
 */
export const selectSettingsModalSnapshot = (state: SettingsModalUiState) => ({
    appLanguagePreference: state.appLanguagePreference,
    pinnedCommandIds: state.pinnedCommandIds,
    isSubSettingsViewOpen: state.isSubSettingsViewOpen,
    settingsModalState: state.settingsModalState,
    lastSeenGuideVersion: state.lastSeenGuideVersion,
    isUserGuideModalOpen: state.isUserGuideModalOpen,
    setLastSeenGuideVersion: state.setLastSeenGuideVersion,
    setIsUserGuideModalOpen: state.setIsUserGuideModalOpen,
    setIsSubSettingsViewOpen: state.setIsSubSettingsViewOpen,
    openSettings: state.openSettings,
    closeSettings: state.closeSettings,
    handleSetAppLanguagePreference: state.handleSetAppLanguagePreference,
    setPinnedCommandId: state.setPinnedCommandId,
});

// Module-level handles for the assembly layer; actions need no subscription.
export const openSettings = (
    initialTab?: SettingsModalInitialTab,
    initialSubview?: SettingsSubviewId | null,
    initialVisualizerSection?: VisualizerSettingsSection | null,
    initialAnchorId?: SettingsAnchorId | null,
    initialRowId?: string | null,
) => useSettingsModalStore.getState().openSettings(initialTab, initialSubview, initialVisualizerSection, initialAnchorId, initialRowId);
export const closeSettings = () => useSettingsModalStore.getState().closeSettings();
