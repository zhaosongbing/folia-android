// src/stores/usePlayerChromeSettingsStore.ts
// What the player page shows around the lyrics: the progress bar, the back and track-switch
// buttons, the titlebar, the transparent background and the auto-hide behaviour.
//
// Split out of useSettingsUiStore.

import { create } from 'zustand';
import i18n from '../i18n/config';
import {
    DEFAULT_PLAYER_CONTROL_SLOT_PRIMARY,
    DEFAULT_PLAYER_CONTROL_SLOT_SECONDARY,
    isPlayerControlSlotActionId,
    type PlayerControlSlotActionId,
} from '../types/playerControlSlots';
import { PLAYER_BOTTOM_BAR_BASE_OFFSET_PX } from '../utils/playerBottomBarLayout';
import { getStoredBoolean, setStoredBoolean } from './storagePrimitives';
import { setStatusMessage } from './useStatusMessageStore';

const PLAYER_BOTTOM_BAR_OFFSET_STORAGE_KEY = 'player_bottom_bar_offset';
const PLAYER_CONTROL_SLOT_PRIMARY_STORAGE_KEY = 'player_control_slot_primary';
const PLAYER_CONTROL_SLOT_SECONDARY_STORAGE_KEY = 'player_control_slot_secondary';

/** Reads the persisted lower-bounded offset; the viewport-dependent upper bound is applied by consumers. */
/**
 * 右侧按钮位置偏移（px）。约定「默认 0 = 原来贴右缘、跟底部基线的位置」：
 * - 水平正值向右（上限 40，再大按钮就探出屏幕），负值向左；
 * - 垂直正值向上（bottom 变大）。
 * 越界一律钳回区间，非法值回落 0。
 */
export const PANEL_HANDLE_OFFSET_X_MIN = -400;
export const PANEL_HANDLE_OFFSET_X_MAX = 40;
export const PANEL_HANDLE_OFFSET_Y_MIN = -120;
export const PANEL_HANDLE_OFFSET_Y_MAX = 480;

/**
 * 控制栏尺寸。三项都用「0 = 跟随原来的自适应行为」：
 * 宽度原本由外层 max-w 与 w-full 决定，高度由内容撑开，圆角是 rounded-full。
 * 这样默认情况下控制栏外观与加设置之前完全一致，只有用户明确拖了滑块才改变。
 */
export const PLAYER_BAR_WIDTH_MIN = 0;
export const PLAYER_BAR_WIDTH_MAX = 720;
export const PLAYER_BAR_WIDTH_DEFAULT = 0;
export const PLAYER_BAR_HEIGHT_MIN = 0;
export const PLAYER_BAR_HEIGHT_MAX = 200;
export const PLAYER_BAR_HEIGHT_DEFAULT = 0;
export const PLAYER_BAR_RADIUS_MIN = 0;
export const PLAYER_BAR_RADIUS_MAX = 48;
export const PLAYER_BAR_RADIUS_DEFAULT = 0;

const clampPlayerBarSize = (value: number, max: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(max, Math.round(value)));
};

const readStoredPlayerBarSize = (key: string, max: number): number => {
    if (typeof window === 'undefined') return 0;
    const parsed = parseFloat(localStorage.getItem(key) ?? '');
    return Number.isFinite(parsed) ? clampPlayerBarSize(parsed, max) : 0;
};

const clampPanelHandleOffset = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(min, Math.min(max, Math.round(value)));
};

const readStoredPanelHandleOffset = (key: string, min: number, max: number): number => {
    if (typeof window === 'undefined') return 0;
    const parsed = parseFloat(localStorage.getItem(key) ?? '');
    return Number.isFinite(parsed) ? clampPanelHandleOffset(parsed, min, max) : 0;
};

const readStoredPlayerBottomBarOffset = (): number => {    if (typeof window === 'undefined') {
        return PLAYER_BOTTOM_BAR_BASE_OFFSET_PX;
    }

    const parsed = parseFloat(localStorage.getItem(PLAYER_BOTTOM_BAR_OFFSET_STORAGE_KEY) ?? '');
    if (!Number.isFinite(parsed)) {
        return PLAYER_BOTTOM_BAR_BASE_OFFSET_PX;
    }

    return Math.max(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, Math.round(parsed));
};

const readStoredPlayerControlSlot = (
    key: string,
    fallback: PlayerControlSlotActionId,
): PlayerControlSlotActionId => {
    if (typeof window === 'undefined') {
        return fallback;
    }

    const saved = localStorage.getItem(key);
    return isPlayerControlSlotActionId(saved) ? saved : fallback;
};

export type PlayerChromeSettingsState = {
    hidePlayerProgressBar: boolean;
    playerBottomBarOffset: number;
    playerControlSlotPrimary: PlayerControlSlotActionId;
    playerControlSlotSecondary: PlayerControlSlotActionId;
    hidePlayerRightPanelButton: boolean;
    alwaysShowPlayerBackButton: boolean;
    alwaysShowTrackSwitchButtons: boolean;
    alwaysShowMainWindowTitlebar: boolean;
    hideFullscreenButton: boolean;
    useNativeMacFullscreenButton: boolean;
    transparentPlayerBackground: boolean;
    enablePlayerPageNativeBlur: boolean;
    autoHidePlayerChrome: boolean;
    autoHideCursorWithPlayerChrome: boolean;
    hideCursorWhenIdle: boolean;
    /** 播放页双击手势：左区上一首、中区播放/暂停、右区下一首。默认开。 */
    enablePlayerDoubleTapGesture: boolean;
    /** 播放页长按手势：按住弹出播放列表，并在长按位置展开。默认开。 */
    enablePlayerLongPressQueue: boolean;
    /** 右侧按钮水平偏移（px）：0 = 默认贴右缘，正值向右，负值向左。 */
    panelHandleOffsetXPx: number;
    /** 右侧按钮垂直偏移（px）：0 = 默认底部基线，正值向上。 */
    panelHandleOffsetYPx: number;
    /** 展开态控制栏在播放/暂停按钮两侧显示上一首/下一首。默认开。 */
    showExpandedTrackSwitchButtons: boolean;
    /** 控制栏横向长度（px）：0 = 跟随原来的自适应宽度。 */
    playerBarWidthPx: number;
    /** 控制栏纵向宽度（px）：0 = 跟随原来的内容撑开高度。 */
    playerBarHeightPx: number;
    /** 控制栏圆角（px）：0 = 原来的胶囊形（rounded-full）。 */
    playerBarRadiusPx: number;
    /** 控制栏展开时，歌名两侧的上一首/下一首箭头。默认开。 */
    showTitleTrackArrows: boolean;
    /** 控制栏改为「点击展开、再点或点外部收起」，关掉时保持悬停展开 + 点击进播放页。默认关。 */
    playerBarClickToExpand: boolean;
    /** 显示系统状态栏与导航栏。默认关：移植版一直全屏沉浸，开启后才把两条系统栏露出来。 */
    showSystemBars: boolean;
    /** 按系统返回键退出前先确认一次。默认开。 */
    confirmOnExit: boolean;
    showOpenPanelCloseButton: boolean;
    setTransparentPlayerBackgroundFromSystem: (enabled: boolean) => void;
    handleTogglePlayerPageNativeBlur: (enable: boolean) => void;
    handleToggleHidePlayerProgressBar: (enable: boolean) => void;
    handleSetPlayerBottomBarOffset: (offsetPx: number) => void;
    handleSetPlayerControlSlot: (slot: 'primary' | 'secondary', actionId: PlayerControlSlotActionId) => void;
    handleToggleHidePlayerRightPanelButton: (enable: boolean) => void;
    handleToggleAlwaysShowPlayerBackButton: (enable: boolean) => void;
    handleToggleAlwaysShowTrackSwitchButtons: (enable: boolean) => void;
    handleToggleAlwaysShowMainWindowTitlebar: (enable: boolean) => void;
    handleToggleHideFullscreenButton: (enable: boolean) => void;
    handleToggleNativeMacFullscreenButton: (enable: boolean) => void;
    handleToggleTransparentPlayerBackground: (enable: boolean) => void;
    handleWallpaperTransparentRefused: () => void;
    handleToggleAutoHidePlayerChrome: (enable: boolean) => void;
    handleToggleAutoHideCursorWithPlayerChrome: (enable: boolean) => void;
    handleToggleHideCursorWhenIdle: (enable: boolean) => void;
    handleTogglePlayerDoubleTapGesture: (enable: boolean) => void;
    handleTogglePlayerLongPressQueue: (enable: boolean) => void;
    handleSetPanelHandleOffsetXPx: (px: number) => void;
    handleSetPanelHandleOffsetYPx: (px: number) => void;
    handleToggleExpandedTrackSwitchButtons: (enable: boolean) => void;
    handleSetPlayerBarWidthPx: (px: number) => void;
    handleSetPlayerBarHeightPx: (px: number) => void;
    handleSetPlayerBarRadiusPx: (px: number) => void;
    handleToggleTitleTrackArrows: (enable: boolean) => void;
    handleTogglePlayerBarClickToExpand: (enable: boolean) => void;
    handleToggleSystemBars: (enable: boolean) => void;
    handleToggleConfirmOnExit: (enable: boolean) => void;
    handleToggleOpenPanelCloseButton: (enable: boolean) => void;
};

export const usePlayerChromeSettingsStore = create<PlayerChromeSettingsState>((set, get) => ({
    hidePlayerProgressBar: getStoredBoolean('hide_player_progress_bar', false),
    playerBottomBarOffset: readStoredPlayerBottomBarOffset(),
    playerControlSlotPrimary: readStoredPlayerControlSlot(
        PLAYER_CONTROL_SLOT_PRIMARY_STORAGE_KEY,
        DEFAULT_PLAYER_CONTROL_SLOT_PRIMARY,
    ),
    playerControlSlotSecondary: readStoredPlayerControlSlot(
        PLAYER_CONTROL_SLOT_SECONDARY_STORAGE_KEY,
        DEFAULT_PLAYER_CONTROL_SLOT_SECONDARY,
    ),
    hidePlayerRightPanelButton: getStoredBoolean('hide_player_right_panel_button', false),
    alwaysShowPlayerBackButton: getStoredBoolean('always_show_player_back_button', false),
    alwaysShowTrackSwitchButtons: getStoredBoolean('always_show_track_switch_buttons', false),
    alwaysShowMainWindowTitlebar: getStoredBoolean('always_show_main_window_titlebar', false),
    hideFullscreenButton: getStoredBoolean('hide_fullscreen_button', false),
    useNativeMacFullscreenButton: getStoredBoolean('use_native_mac_fullscreen_button', false),
    transparentPlayerBackground: getStoredBoolean('transparent_player_background', false),
    enablePlayerPageNativeBlur: getStoredBoolean('enable_player_page_native_blur', false),
    autoHidePlayerChrome: getStoredBoolean('auto_hide_player_chrome', false),
    // Rides the chrome auto-hide clock rather than owning one: the cursor goes away with the
    // controls it would have clicked. Opt-out, so auto-hide can keep the pointer if wanted.
    autoHideCursorWithPlayerChrome: getStoredBoolean('auto_hide_cursor_with_player_chrome', true),
    hideCursorWhenIdle: getStoredBoolean('hide_cursor_when_idle', false),
    enablePlayerDoubleTapGesture: getStoredBoolean('enable_player_double_tap_gesture', true),
    enablePlayerLongPressQueue: getStoredBoolean('enable_player_long_press_queue', true),
    panelHandleOffsetXPx: readStoredPanelHandleOffset(
        'panel_handle_offset_x_px',
        PANEL_HANDLE_OFFSET_X_MIN,
        PANEL_HANDLE_OFFSET_X_MAX,
    ),
    panelHandleOffsetYPx: readStoredPanelHandleOffset(
        'panel_handle_offset_y_px',
        PANEL_HANDLE_OFFSET_Y_MIN,
        PANEL_HANDLE_OFFSET_Y_MAX,
    ),
    showExpandedTrackSwitchButtons: getStoredBoolean('show_expanded_track_switch_buttons', true),
    playerBarWidthPx: readStoredPlayerBarSize('player_bar_width_px', PLAYER_BAR_WIDTH_MAX),
    playerBarHeightPx: readStoredPlayerBarSize('player_bar_height_px', PLAYER_BAR_HEIGHT_MAX),
    playerBarRadiusPx: readStoredPlayerBarSize('player_bar_radius_px', PLAYER_BAR_RADIUS_MAX),
    showTitleTrackArrows: getStoredBoolean('show_title_track_arrows', true),
    playerBarClickToExpand: getStoredBoolean('player_bar_click_to_expand', false),
    showSystemBars: getStoredBoolean('show_system_bars', false),
    confirmOnExit: getStoredBoolean('confirm_on_exit', true),
    showOpenPanelCloseButton: getStoredBoolean('show_open_panel_close_button', true),
    setTransparentPlayerBackgroundFromSystem: (enabled) => {
        setStoredBoolean('transparent_player_background', enabled);
        set({ transparentPlayerBackground: enabled });
    },
    handleTogglePlayerPageNativeBlur: (enable) => {
        setStoredBoolean('enable_player_page_native_blur', enable);
        set({ enablePlayerPageNativeBlur: enable });
        if (window.electron?.saveSettings) {
            void window.electron.saveSettings('enable_player_page_native_blur', enable);
        }
    },
    handleToggleAutoHidePlayerChrome: (enabled: boolean) => {
        localStorage.setItem('auto_hide_player_chrome', enabled ? 'true' : 'false');
        set({ autoHidePlayerChrome: enabled });
    },
    handleToggleAutoHideCursorWithPlayerChrome: (enable) => {
        setStoredBoolean('auto_hide_cursor_with_player_chrome', enable);
        set({ autoHideCursorWithPlayerChrome: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'cursorAutoHideOn' : 'cursorAutoHideOff')),
        });
    },
    handleToggleHideCursorWhenIdle: (enable) => {
        setStoredBoolean('hide_cursor_when_idle', enable);
        set({ hideCursorWhenIdle: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'cursorIdleHideOn' : 'cursorIdleHideOff')),
        });
    },
    handleTogglePlayerDoubleTapGesture: (enable) => {
        setStoredBoolean('enable_player_double_tap_gesture', enable);
        set({ enablePlayerDoubleTapGesture: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'doubleTapGestureOn' : 'doubleTapGestureOff')),
        });
    },
    handleTogglePlayerLongPressQueue: (enable) => {
        setStoredBoolean('enable_player_long_press_queue', enable);
        set({ enablePlayerLongPressQueue: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'longPressQueueOn' : 'longPressQueueOff')),
        });
    },
    handleSetPanelHandleOffsetXPx: (px) => {
        const next = clampPanelHandleOffset(px, PANEL_HANDLE_OFFSET_X_MIN, PANEL_HANDLE_OFFSET_X_MAX);
        if (typeof window !== 'undefined') {
            localStorage.setItem('panel_handle_offset_x_px', String(next));
        }
        set({ panelHandleOffsetXPx: next });
    },
    handleSetPanelHandleOffsetYPx: (px) => {
        const next = clampPanelHandleOffset(px, PANEL_HANDLE_OFFSET_Y_MIN, PANEL_HANDLE_OFFSET_Y_MAX);
        if (typeof window !== 'undefined') {
            localStorage.setItem('panel_handle_offset_y_px', String(next));
        }
        set({ panelHandleOffsetYPx: next });
    },
    handleToggleExpandedTrackSwitchButtons: (enable) => {
        setStoredBoolean('show_expanded_track_switch_buttons', enable);
        set({ showExpandedTrackSwitchButtons: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'expandedSwitchButtonsOn' : 'expandedSwitchButtonsOff')),
        });
    },
    handleSetPlayerBarWidthPx: (px) => {
        const next = clampPlayerBarSize(px, PLAYER_BAR_WIDTH_MAX);
        if (typeof window !== 'undefined') {
            localStorage.setItem('player_bar_width_px', String(next));
        }
        set({ playerBarWidthPx: next });
    },
    handleSetPlayerBarHeightPx: (px) => {
        const next = clampPlayerBarSize(px, PLAYER_BAR_HEIGHT_MAX);
        if (typeof window !== 'undefined') {
            localStorage.setItem('player_bar_height_px', String(next));
        }
        set({ playerBarHeightPx: next });
    },
    handleSetPlayerBarRadiusPx: (px) => {
        const next = clampPlayerBarSize(px, PLAYER_BAR_RADIUS_MAX);
        if (typeof window !== 'undefined') {
            localStorage.setItem('player_bar_radius_px', String(next));
        }
        set({ playerBarRadiusPx: next });
    },
    handleToggleTitleTrackArrows: (enable) => {
        setStoredBoolean('show_title_track_arrows', enable);
        set({ showTitleTrackArrows: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'titleTrackArrowsOn' : 'titleTrackArrowsOff')),
        });
    },
    handleTogglePlayerBarClickToExpand: (enable) => {
        setStoredBoolean('player_bar_click_to_expand', enable);
        set({ playerBarClickToExpand: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'barClickToExpandOn' : 'barClickToExpandOff')),
        });
    },
    handleToggleConfirmOnExit: (enable) => {
        setStoredBoolean('confirm_on_exit', enable);
        set({ confirmOnExit: enable });
    },
    handleToggleSystemBars: (enable) => {
        setStoredBoolean('show_system_bars', enable);
        set({ showSystemBars: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'systemBarsOn' : 'systemBarsOff')),
        });
    },
    handleToggleHidePlayerProgressBar: (enable) => {
        setStoredBoolean('hide_player_progress_bar', enable);
        set({ hidePlayerProgressBar: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'progressBarHidden' : 'progressBarShown')),
        });
    },
    handleSetPlayerBottomBarOffset: (offsetPx) => {
        const next = Number.isFinite(offsetPx)
            ? Math.max(PLAYER_BOTTOM_BAR_BASE_OFFSET_PX, Math.round(offsetPx))
            : PLAYER_BOTTOM_BAR_BASE_OFFSET_PX;
        if (typeof window !== 'undefined') {
            localStorage.setItem(PLAYER_BOTTOM_BAR_OFFSET_STORAGE_KEY, String(next));
        }
        set({ playerBottomBarOffset: next });
    },
    handleSetPlayerControlSlot: (slot, actionId) => {
        if (!isPlayerControlSlotActionId(actionId)) {
            return;
        }
        const key = slot === 'primary'
            ? PLAYER_CONTROL_SLOT_PRIMARY_STORAGE_KEY
            : PLAYER_CONTROL_SLOT_SECONDARY_STORAGE_KEY;
        if (typeof window !== 'undefined') {
            localStorage.setItem(key, actionId);
        }
        set(slot === 'primary'
            ? { playerControlSlotPrimary: actionId }
            : { playerControlSlotSecondary: actionId });
    },
    handleToggleAlwaysShowPlayerBackButton: (enable) => {
        setStoredBoolean('always_show_player_back_button', enable);
        set({ alwaysShowPlayerBackButton: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'playerBackButtonAlwaysShown' : 'playerBackButtonAutoHidden')),
        });
    },
    handleToggleAlwaysShowTrackSwitchButtons: (enable) => {
        setStoredBoolean('always_show_track_switch_buttons', enable);
        set({ alwaysShowTrackSwitchButtons: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'trackSwitchButtonsAlwaysShown' : 'trackSwitchButtonsAutoHidden')),
        });
    },
    handleToggleAlwaysShowMainWindowTitlebar: (enable) => {
        setStoredBoolean('always_show_main_window_titlebar', enable);
        set({ alwaysShowMainWindowTitlebar: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'mainWindowTitlebarAlwaysShown' : 'mainWindowTitlebarAutoHidden')),
        });
    },
    handleToggleHideFullscreenButton: (enable) => {
        setStoredBoolean('hide_fullscreen_button', enable);
        set({ hideFullscreenButton: enable });
    },
    handleToggleNativeMacFullscreenButton: (enable) => {
        setStoredBoolean('use_native_mac_fullscreen_button', enable);
        set({ useNativeMacFullscreenButton: enable });
    },
    handleToggleHidePlayerRightPanelButton: (enable) => {
        setStoredBoolean('hide_player_right_panel_button', enable);
        set({ hidePlayerRightPanelButton: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'rightBtnHidden' : 'rightBtnShown')),
        });
    },
    handleToggleTransparentPlayerBackground: (enable) => {
        setStoredBoolean('transparent_player_background', enable);
        set({ transparentPlayerBackground: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'transparentBgOn' : 'transparentBgOff')),
        });
    },
    // Main-process guard fired the refusal (classic Windows wallpaper mode cannot present a
    // transparent wallpaper window): surface why the toggle did not take effect.
    handleWallpaperTransparentRefused: () => {
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.transparentBgWallpaperUnsupported'),
        });
    },
    handleToggleOpenPanelCloseButton: (enable) => {
        setStoredBoolean('show_open_panel_close_button', enable);
        set({ showOpenPanelCloseButton: enable });
        setStatusMessage({
            type: 'info',
            text: i18n.t('notifications.' + (enable ? 'panelCloseBtnShown' : 'panelCloseBtnHidden')),
        });
    },
}));

/**
 * The PlayerChromeSettings half of the former settings snapshot, for the surfaces that
 * legitimately edit this whole domain at once. Ordinary consumers select one field instead.
 */
export const selectPlayerChromeSettingsSnapshot = (state: PlayerChromeSettingsState) => ({
    hidePlayerProgressBar: state.hidePlayerProgressBar,
    playerBottomBarOffset: state.playerBottomBarOffset,
    playerControlSlotPrimary: state.playerControlSlotPrimary,
    playerControlSlotSecondary: state.playerControlSlotSecondary,
    hidePlayerRightPanelButton: state.hidePlayerRightPanelButton,
    alwaysShowPlayerBackButton: state.alwaysShowPlayerBackButton,
    alwaysShowTrackSwitchButtons: state.alwaysShowTrackSwitchButtons,
    alwaysShowMainWindowTitlebar: state.alwaysShowMainWindowTitlebar,
    hideFullscreenButton: state.hideFullscreenButton,
    useNativeMacFullscreenButton: state.useNativeMacFullscreenButton,
    transparentPlayerBackground: state.transparentPlayerBackground,
    enablePlayerPageNativeBlur: state.enablePlayerPageNativeBlur,
    autoHidePlayerChrome: state.autoHidePlayerChrome,
    autoHideCursorWithPlayerChrome: state.autoHideCursorWithPlayerChrome,
    hideCursorWhenIdle: state.hideCursorWhenIdle,
    enablePlayerDoubleTapGesture: state.enablePlayerDoubleTapGesture,
    enablePlayerLongPressQueue: state.enablePlayerLongPressQueue,
    panelHandleOffsetXPx: state.panelHandleOffsetXPx,
    panelHandleOffsetYPx: state.panelHandleOffsetYPx,
    showExpandedTrackSwitchButtons: state.showExpandedTrackSwitchButtons,
    playerBarWidthPx: state.playerBarWidthPx,
    playerBarHeightPx: state.playerBarHeightPx,
    playerBarRadiusPx: state.playerBarRadiusPx,
    showTitleTrackArrows: state.showTitleTrackArrows,
    playerBarClickToExpand: state.playerBarClickToExpand,
    showSystemBars: state.showSystemBars,
    confirmOnExit: state.confirmOnExit,
    showOpenPanelCloseButton: state.showOpenPanelCloseButton,
    handleToggleHidePlayerProgressBar: state.handleToggleHidePlayerProgressBar,
    handleSetPlayerBottomBarOffset: state.handleSetPlayerBottomBarOffset,
    handleSetPlayerControlSlot: state.handleSetPlayerControlSlot,
    handleToggleHidePlayerRightPanelButton: state.handleToggleHidePlayerRightPanelButton,
    handleToggleAlwaysShowPlayerBackButton: state.handleToggleAlwaysShowPlayerBackButton,
    handleToggleAlwaysShowTrackSwitchButtons: state.handleToggleAlwaysShowTrackSwitchButtons,
    handleToggleAlwaysShowMainWindowTitlebar: state.handleToggleAlwaysShowMainWindowTitlebar,
    handleToggleHideFullscreenButton: state.handleToggleHideFullscreenButton,
    handleToggleNativeMacFullscreenButton: state.handleToggleNativeMacFullscreenButton,
    handleToggleTransparentPlayerBackground: state.handleToggleTransparentPlayerBackground,
    setTransparentPlayerBackgroundFromSystem: state.setTransparentPlayerBackgroundFromSystem,
    handleTogglePlayerPageNativeBlur: state.handleTogglePlayerPageNativeBlur,
    handleToggleAutoHidePlayerChrome: state.handleToggleAutoHidePlayerChrome,
    handleToggleAutoHideCursorWithPlayerChrome: state.handleToggleAutoHideCursorWithPlayerChrome,
    handleToggleHideCursorWhenIdle: state.handleToggleHideCursorWhenIdle,
    handleTogglePlayerDoubleTapGesture: state.handleTogglePlayerDoubleTapGesture,
    handleTogglePlayerLongPressQueue: state.handleTogglePlayerLongPressQueue,
    handleSetPanelHandleOffsetXPx: state.handleSetPanelHandleOffsetXPx,
    handleSetPanelHandleOffsetYPx: state.handleSetPanelHandleOffsetYPx,
    handleToggleExpandedTrackSwitchButtons: state.handleToggleExpandedTrackSwitchButtons,
    handleSetPlayerBarWidthPx: state.handleSetPlayerBarWidthPx,
    handleSetPlayerBarHeightPx: state.handleSetPlayerBarHeightPx,
    handleSetPlayerBarRadiusPx: state.handleSetPlayerBarRadiusPx,
    handleToggleTitleTrackArrows: state.handleToggleTitleTrackArrows,
    handleTogglePlayerBarClickToExpand: state.handleTogglePlayerBarClickToExpand,
    handleToggleSystemBars: state.handleToggleSystemBars,
    handleToggleConfirmOnExit: state.handleToggleConfirmOnExit,
    handleToggleOpenPanelCloseButton: state.handleToggleOpenPanelCloseButton,
    handleWallpaperTransparentRefused: state.handleWallpaperTransparentRefused,
});
