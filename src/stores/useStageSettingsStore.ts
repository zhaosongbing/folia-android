// src/stores/useStageSettingsStore.ts
// Stage / OBS / PlayerCap outputs: which external surfaces are enabled, how PlayerCap is
// addressed, and the now-playing pill's presentation.
//
// Split out of useSettingsUiStore.

import { create } from 'zustand';
import { getStoredBoolean, getStoredString, setStoredBoolean } from './storagePrimitives';
import { setStatusMessage } from './useStatusMessageStore';
import i18n from '../i18n/config';

export type StageTrackPillMode = 'auto' | 'always' | 'never';

// OBS overlay theme mode for the copied web OBS URL (default 'builtin' — per-song follow):
//   'static'  – bake the current theme into cfg (the original behavior; frozen in OBS).
//   'builtin' – bake no theme; the overlay derives a per-song builtin palette from the cover.
//   'ai'      – like 'builtin', plus the overlay regenerates an AI theme per song (opt-in).
const readStoredWebObsThemeMode = (): 'static' | 'builtin' | 'ai' => {
    if (typeof window === 'undefined') return 'builtin';
    const value = localStorage.getItem('web_obs_theme_mode') || 'builtin';
    return value === 'static' || value === 'ai' ? value : 'builtin';
};

const readStoredStageTrackPillMode = (): StageTrackPillMode => {
    if (typeof window === 'undefined') {
        return 'auto';
    }

    const saved = localStorage.getItem('stage_track_pill_mode');
    return saved === 'always' || saved === 'never' ? saved : 'auto';
};

const readStoredStageTrackPillTimeoutSec = (): number => {
    if (typeof window === 'undefined') {
        return 10;
    }

    const saved = Number(localStorage.getItem('stage_track_pill_timeout_sec'));
    return Number.isFinite(saved) && saved >= 3 && saved <= 60 ? Math.round(saved) : 10;
};

/** 歌曲信息卡片高度（px）：56 = 紧凑，60 = 原尺寸，112 = 大号。 */
export const STAGE_TRACK_PILL_HEIGHT_MIN = 56;
export const STAGE_TRACK_PILL_HEIGHT_MAX = 112;
export const STAGE_TRACK_PILL_HEIGHT_DEFAULT = 60;
/** 上面三个档位所对应的「原尺寸」：卡片内部各项都按 height / 60 等比缩放。 */
export const STAGE_TRACK_PILL_HEIGHT_BASE = STAGE_TRACK_PILL_HEIGHT_DEFAULT;

const clampStageTrackPillHeight = (value: number): number => {
    if (!Number.isFinite(value)) return STAGE_TRACK_PILL_HEIGHT_DEFAULT;
    return Math.max(
        STAGE_TRACK_PILL_HEIGHT_MIN,
        Math.min(STAGE_TRACK_PILL_HEIGHT_MAX, Math.round(value)),
    );
};

const readStoredStageTrackPillHeightPx = (): number => {
    if (typeof window === 'undefined') {
        return STAGE_TRACK_PILL_HEIGHT_DEFAULT;
    }

    const saved = Number(localStorage.getItem('stage_track_pill_height_px'));
    return Number.isFinite(saved) ? clampStageTrackPillHeight(saved) : STAGE_TRACK_PILL_HEIGHT_DEFAULT;
};

/**
 * 卡片位置偏移（px），约定「默认 0 = 原来靠左下、与控制栏同基线的位置」：
 * - 水平正值向右，负值向左（最小 -24，正好贴到屏幕左缘，因为默认左距就是 24px）；
 * - 垂直正值向上（bottom 变大），负值向下。
 * 上限取得比较宽，是为了大屏上能把卡片挪到右侧或上方；越界一律钳回区间。
 */
export const STAGE_TRACK_PILL_OFFSET_X_MIN = -24;
export const STAGE_TRACK_PILL_OFFSET_X_MAX = 400;
export const STAGE_TRACK_PILL_OFFSET_Y_MIN = -120;
export const STAGE_TRACK_PILL_OFFSET_Y_MAX = 480;
export const STAGE_TRACK_PILL_OFFSET_DEFAULT = 0;

const clampOffset = (value: number, min: number, max: number): number => {
    if (!Number.isFinite(value)) return STAGE_TRACK_PILL_OFFSET_DEFAULT;
    return Math.max(min, Math.min(max, Math.round(value)));
};

const readStoredStageTrackPillOffset = (key: string, min: number, max: number): number => {
    if (typeof window === 'undefined') return STAGE_TRACK_PILL_OFFSET_DEFAULT;
    const saved = Number(localStorage.getItem(key));
    return Number.isFinite(saved) ? clampOffset(saved, min, max) : STAGE_TRACK_PILL_OFFSET_DEFAULT;
};

export type StageSettingsState = {
    enableNowPlayingStage: boolean;
    // PlayerCap lyrics source (third stage source) config. enablePlayerCapStage is Web-only (Electron uses stageStatus.source).
    enablePlayerCapStage: boolean;
    playerCapHost: string;
    playerCapPlayer: string;
    playerCapTimeBasis: 'timestamp' | 'play_time';
    playerCapSticky: boolean;
    // Theme mode baked into the copied web OBS URL (static burn-in vs per-song dynamic; see readStoredWebObsThemeMode).
    webObsThemeMode: 'static' | 'builtin' | 'ai';
    /** 歌词页左下角曲目卡片显示模式：auto=显示一段时间后隐藏，always=常驻，never=不显示 */
    stageTrackPillMode: StageTrackPillMode;
    /** auto 模式下的显示时长（秒），3-60 */
    stageTrackPillTimeoutSec: number;
    /** 歌曲信息卡片高度（px）：56-112，卡片内封面与字号按它等比缩放 */
    stageTrackPillHeightPx: number;
    /** 卡片水平偏移（px）：0 = 默认靠左位置，正值向右 */
    stageTrackPillOffsetXPx: number;
    /** 卡片垂直偏移（px）：0 = 默认底距，正值向上 */
    stageTrackPillOffsetYPx: number;
    stageTrackPillOnHome: boolean;
    /** OBS 浏览器源有客户端连接时，主窗口是否继续渲染重动画（默认 false = 主窗口切到 still） */
    obsKeepMainWindowAnimation: boolean;
    // Web stage-source tri-state mutually-exclusive selection: null disables, else one of 'now-playing' or 'playercap'. Electron uses stageStatus.source.
    setWebStageSource: (source: 'now-playing' | 'playercap' | null) => void;
    setPlayerCapHost: (host: string) => void;
    setPlayerCapPlayer: (player: string) => void;
    setPlayerCapTimeBasis: (basis: 'timestamp' | 'play_time') => void;
    setPlayerCapSticky: (sticky: boolean) => void;
    setWebObsThemeMode: (mode: 'static' | 'builtin' | 'ai') => void;
    handleSetStageTrackPillMode: (mode: StageTrackPillMode) => void;
    handleSetStageTrackPillTimeoutSec: (sec: number) => void;
    handleSetStageTrackPillHeightPx: (px: number) => void;
    handleSetStageTrackPillOffsetXPx: (px: number) => void;
    handleSetStageTrackPillOffsetYPx: (px: number) => void;
    handleToggleStageTrackPillOnHome: (enable: boolean) => void;
    handleToggleObsKeepMainWindowAnimation: (enable: boolean) => void;
};

export const useStageSettingsStore = create<StageSettingsState>((set, get) => ({
    enableNowPlayingStage: getStoredBoolean('enable_now_playing_stage', false),
    enablePlayerCapStage: getStoredBoolean('enable_playercap_stage', false),
    playerCapHost: getStoredString('playercap_host', 'localhost:8765'),
    playerCapPlayer: getStoredString('playercap_player', ''),
    playerCapTimeBasis: getStoredString('playercap_time_basis', 'play_time') === 'timestamp' ? 'timestamp' : 'play_time',
    playerCapSticky: getStoredBoolean('playercap_sticky', true),
    webObsThemeMode: readStoredWebObsThemeMode(),
    stageTrackPillMode: readStoredStageTrackPillMode(),
    stageTrackPillTimeoutSec: readStoredStageTrackPillTimeoutSec(),
    stageTrackPillHeightPx: readStoredStageTrackPillHeightPx(),
    stageTrackPillOffsetXPx: readStoredStageTrackPillOffset(
        'stage_track_pill_offset_x_px',
        STAGE_TRACK_PILL_OFFSET_X_MIN,
        STAGE_TRACK_PILL_OFFSET_X_MAX,
    ),
    stageTrackPillOffsetYPx: readStoredStageTrackPillOffset(
        'stage_track_pill_offset_y_px',
        STAGE_TRACK_PILL_OFFSET_Y_MIN,
        STAGE_TRACK_PILL_OFFSET_Y_MAX,
    ),
    stageTrackPillOnHome: getStoredBoolean('stage_track_pill_on_home', false),
    obsKeepMainWindowAnimation: getStoredBoolean('obs_keep_main_window_animation', false),
    setWebStageSource: (source) => {
        const wasEnabled = get().enableNowPlayingStage || get().enablePlayerCapStage;
        const enableNowPlaying = source === 'now-playing';
        const enablePlayerCap = source === 'playercap';
        setStoredBoolean('enable_now_playing_stage', enableNowPlaying);
        setStoredBoolean('enable_playercap_stage', enablePlayerCap);
        set({ enableNowPlayingStage: enableNowPlaying, enablePlayerCapStage: enablePlayerCap });
        const nowEnabled = enableNowPlaying || enablePlayerCap;
        // Only notify on the enable/disable transition; switching between the two sources is silent. On disable, the controller's stageSource→null reactive effect handles teardown automatically.
        if (wasEnabled !== nowEnabled) {
            setStatusMessage({
                type: 'info',
                text: i18n.t('notifications.' + (nowEnabled ? 'stageModeOn' : 'stageModeOff')),
            });
        }
    },
    setPlayerCapHost: (host) => {
        localStorage.setItem('playercap_host', host);
        set({ playerCapHost: host });
    },
    setPlayerCapPlayer: (player) => {
        localStorage.setItem('playercap_player', player);
        set({ playerCapPlayer: player });
    },
    setPlayerCapTimeBasis: (basis) => {
        localStorage.setItem('playercap_time_basis', basis);
        set({ playerCapTimeBasis: basis });
    },
    setPlayerCapSticky: (sticky) => {
        setStoredBoolean('playercap_sticky', sticky);
        set({ playerCapSticky: sticky });
    },
    setWebObsThemeMode: (mode) => {
        if (typeof window !== 'undefined') localStorage.setItem('web_obs_theme_mode', mode);
        set({ webObsThemeMode: mode });
    },
    handleSetStageTrackPillMode: (mode) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('stage_track_pill_mode', mode);
        }
        set({ stageTrackPillMode: mode });
    },
    handleSetStageTrackPillTimeoutSec: (sec) => {
        const next = Math.max(3, Math.min(60, Math.round(sec)));
        if (typeof window !== 'undefined') {
            localStorage.setItem('stage_track_pill_timeout_sec', String(next));
        }
        set({ stageTrackPillTimeoutSec: next });
    },
    handleSetStageTrackPillHeightPx: (px) => {
        const next = clampStageTrackPillHeight(px);
        if (typeof window !== 'undefined') {
            localStorage.setItem('stage_track_pill_height_px', String(next));
        }
        set({ stageTrackPillHeightPx: next });
    },
    handleSetStageTrackPillOffsetXPx: (px) => {
        const next = clampOffset(px, STAGE_TRACK_PILL_OFFSET_X_MIN, STAGE_TRACK_PILL_OFFSET_X_MAX);
        if (typeof window !== 'undefined') {
            localStorage.setItem('stage_track_pill_offset_x_px', String(next));
        }
        set({ stageTrackPillOffsetXPx: next });
    },
    handleSetStageTrackPillOffsetYPx: (px) => {
        const next = clampOffset(px, STAGE_TRACK_PILL_OFFSET_Y_MIN, STAGE_TRACK_PILL_OFFSET_Y_MAX);
        if (typeof window !== 'undefined') {
            localStorage.setItem('stage_track_pill_offset_y_px', String(next));
        }
        set({ stageTrackPillOffsetYPx: next });
    },
    handleToggleStageTrackPillOnHome: (enable) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('stage_track_pill_on_home', String(enable));
        }
        set({ stageTrackPillOnHome: enable });
    },
    handleToggleObsKeepMainWindowAnimation: (enable) => {
        setStoredBoolean('obs_keep_main_window_animation', enable);
        set({ obsKeepMainWindowAnimation: enable });
    },
}));

/**
 * The StageSettings half of the former settings snapshot, for the surfaces that
 * legitimately edit this whole domain at once. Ordinary consumers select one field instead.
 */
export const selectStageSettingsSnapshot = (state: StageSettingsState) => ({
    enableNowPlayingStage: state.enableNowPlayingStage,
    enablePlayerCapStage: state.enablePlayerCapStage,
    playerCapHost: state.playerCapHost,
    playerCapPlayer: state.playerCapPlayer,
    playerCapTimeBasis: state.playerCapTimeBasis,
    playerCapSticky: state.playerCapSticky,
    webObsThemeMode: state.webObsThemeMode,
    stageTrackPillMode: state.stageTrackPillMode,
    stageTrackPillTimeoutSec: state.stageTrackPillTimeoutSec,
    stageTrackPillHeightPx: state.stageTrackPillHeightPx,
    stageTrackPillOffsetXPx: state.stageTrackPillOffsetXPx,
    stageTrackPillOffsetYPx: state.stageTrackPillOffsetYPx,
    stageTrackPillOnHome: state.stageTrackPillOnHome,
    obsKeepMainWindowAnimation: state.obsKeepMainWindowAnimation,
    setWebStageSource: state.setWebStageSource,
    setPlayerCapHost: state.setPlayerCapHost,
    setPlayerCapPlayer: state.setPlayerCapPlayer,
    setPlayerCapTimeBasis: state.setPlayerCapTimeBasis,
    setPlayerCapSticky: state.setPlayerCapSticky,
    setWebObsThemeMode: state.setWebObsThemeMode,
    handleSetStageTrackPillMode: state.handleSetStageTrackPillMode,
    handleSetStageTrackPillTimeoutSec: state.handleSetStageTrackPillTimeoutSec,
    handleSetStageTrackPillHeightPx: state.handleSetStageTrackPillHeightPx,
    handleSetStageTrackPillOffsetXPx: state.handleSetStageTrackPillOffsetXPx,
    handleSetStageTrackPillOffsetYPx: state.handleSetStageTrackPillOffsetYPx,
    handleToggleStageTrackPillOnHome: state.handleToggleStageTrackPillOnHome,
    handleToggleObsKeepMainWindowAnimation: state.handleToggleObsKeepMainWindowAnimation,
});
