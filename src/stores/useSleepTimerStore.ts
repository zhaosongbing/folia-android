// src/stores/useSleepTimerStore.ts
// The sleep timer: the configured duration plus the armed deadline.
//
// Split out of useSettingsUiStore. The deadline and activation id are runtime state rather than
// settings, which is precisely why they no longer sit in the settings snapshot.

import { create } from 'zustand';
import i18n from '../i18n/config';
import { setStatusMessage } from './useStatusMessageStore';

export const SLEEP_TIMER_HOURS_STORAGE_KEY = 'sleep_timer_hours';

export const SLEEP_TIMER_MINUTES_STORAGE_KEY = 'sleep_timer_minutes';

export const SLEEP_TIMER_CLOSE_MODE_STORAGE_KEY = 'sleep_timer_close_mode';

/** 没设时长就打开定时关闭时用的时长（分钟）。 */
export const DEFAULT_SLEEP_TIMER_MINUTES = 15;

/**
 * 到点之后怎么关：
 * - `immediate`：立刻停下（老行为）。
 * - `after-track`：让正在放的这首放完，再停。放完才关是听歌场景里更常见的期待，
 *   不然一首歌被拦腰截断。
 */
export type SleepTimerCloseMode = 'immediate' | 'after-track';

const SLEEP_TIMER_CLOSE_MODES: readonly SleepTimerCloseMode[] = ['immediate', 'after-track'];

const readStoredSleepTimerCloseMode = (): SleepTimerCloseMode => {
    if (typeof window === 'undefined') {
        return 'immediate';
    }

    const saved = localStorage.getItem(SLEEP_TIMER_CLOSE_MODE_STORAGE_KEY);
    return SLEEP_TIMER_CLOSE_MODES.includes(saved as SleepTimerCloseMode)
        ? saved as SleepTimerCloseMode
        : 'immediate';
};

const readStoredSleepTimerPart = (key: string, max: number): number => {
    if (typeof window === 'undefined') {
        return 0;
    }

    const saved = Number(localStorage.getItem(key));
    return Number.isInteger(saved) && saved >= 0 && saved <= max ? saved : 0;
};

const readStoredSleepTimerHours = () => readStoredSleepTimerPart(SLEEP_TIMER_HOURS_STORAGE_KEY, 999);

const readStoredSleepTimerMinutes = () => readStoredSleepTimerPart(SLEEP_TIMER_MINUTES_STORAGE_KEY, 59);

export type SleepTimerState = {
    sleepTimerEnabled: boolean;
    sleepTimerHours: number;
    sleepTimerMinutes: number;
    sleepTimerDeadlineMs: number | null;
    sleepTimerActivationId: number;
    /** 到点之后怎么关：立刻停，还是让当前这首放完再停。 */
    sleepTimerCloseMode: SleepTimerCloseMode;
    /**
     * 时间已经到了、但选了「播完整首歌」：先挂起，等当前这首放完再真正停。
     * 只在这一小段时间里是真的，播放结束（或用户关掉定时）时清掉。
     */
    sleepTimerHoldsForTrackEnd: boolean;
    handleToggleSleepTimer: (enable: boolean) => void;
    handleSetSleepTimerHours: (hours: number) => void;
    handleSetSleepTimerMinutes: (minutes: number) => void;
    handleSetSleepTimerCloseMode: (mode: SleepTimerCloseMode) => void;
    handleSetSleepTimerHoldsForTrackEnd: (holds: boolean) => void;
};

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
    // A sleep timer is a one-shot action. Persist its preferred duration, never an armed state.
    sleepTimerEnabled: false,
    sleepTimerHours: readStoredSleepTimerHours(),
    sleepTimerMinutes: readStoredSleepTimerMinutes(),
    sleepTimerDeadlineMs: null,
    sleepTimerActivationId: 0,
    sleepTimerCloseMode: readStoredSleepTimerCloseMode(),
    sleepTimerHoldsForTrackEnd: false,
    handleToggleSleepTimer: (enable) => {
        // 打开时如果还没设时长，给一个默认的 15 分钟，而不是什么都不做。
        // 以前这里只弹一句「先设个时长」，可面板上的开关就在时长那一行的上面一行，
        // 很容易变成「点了开关没反应」——这一次的反馈就是这么来的。
        // 没设时长时补的那一句比「已开启」有用，就别被后面那句盖掉了。
        let usedDefaultDuration = false;
        if (enable && get().sleepTimerHours === 0 && get().sleepTimerMinutes === 0) {
            usedDefaultDuration = true;
            if (typeof window !== 'undefined') {
                localStorage.setItem(SLEEP_TIMER_HOURS_STORAGE_KEY, '0');
                localStorage.setItem(SLEEP_TIMER_MINUTES_STORAGE_KEY, String(DEFAULT_SLEEP_TIMER_MINUTES));
            }
            set({ sleepTimerHours: 0, sleepTimerMinutes: DEFAULT_SLEEP_TIMER_MINUTES });
        }
        set(state => ({
            sleepTimerEnabled: enable,
            // 关掉定时也把「等这首放完」的挂起一起取消，否则下一次播放结束还会莫名停下来。
            sleepTimerHoldsForTrackEnd: enable ? state.sleepTimerHoldsForTrackEnd : false,
            // Every explicit activation starts a fresh countdown, even when its duration is unchanged.
            sleepTimerActivationId: enable
                ? state.sleepTimerActivationId + 1
                : state.sleepTimerActivationId,
        }));
        setStatusMessage(usedDefaultDuration
            ? {
                type: 'info',
                text: i18n.t('notifications.sleepTimerDefaultDuration', { minutes: DEFAULT_SLEEP_TIMER_MINUTES }),
            }
            : {
                type: 'info',
                text: i18n.t('notifications.' + (enable ? 'sleepTimerOn' : 'sleepTimerOff')),
            });
    },
    handleSetSleepTimerHours: (hours) => {
        const clamped = Math.min(999, Math.max(0, Math.floor(hours) || 0));
        if (typeof window !== 'undefined') {
            localStorage.setItem(SLEEP_TIMER_HOURS_STORAGE_KEY, String(clamped));
        }
        set(state => ({
            sleepTimerHours: clamped,
            sleepTimerEnabled: clamped === 0 && state.sleepTimerMinutes === 0
                ? false
                : state.sleepTimerEnabled,
        }));
    },
    handleSetSleepTimerMinutes: (minutes) => {
        const clamped = Math.min(59, Math.max(0, Math.floor(minutes) || 0));
        if (typeof window !== 'undefined') {
            localStorage.setItem(SLEEP_TIMER_MINUTES_STORAGE_KEY, String(clamped));
        }
        set(state => ({
            sleepTimerMinutes: clamped,
            sleepTimerEnabled: state.sleepTimerHours === 0 && clamped === 0
                ? false
                : state.sleepTimerEnabled,
        }));
    },
    handleSetSleepTimerCloseMode: (mode) => {
        if (!SLEEP_TIMER_CLOSE_MODES.includes(mode)) return;
        if (typeof window !== 'undefined') {
            localStorage.setItem(SLEEP_TIMER_CLOSE_MODE_STORAGE_KEY, mode);
        }
        set({ sleepTimerCloseMode: mode });
    },
    handleSetSleepTimerHoldsForTrackEnd: (holds) => {
        set({ sleepTimerHoldsForTrackEnd: holds });
    },
}));

/**
 * The SleepTimer half of the former settings snapshot, for the surfaces that
 * legitimately edit this whole domain at once. Ordinary consumers select one field instead.
 */
export const selectSleepTimerSnapshot = (state: SleepTimerState) => ({
    sleepTimerEnabled: state.sleepTimerEnabled,
    sleepTimerHours: state.sleepTimerHours,
    sleepTimerMinutes: state.sleepTimerMinutes,
    sleepTimerDeadlineMs: state.sleepTimerDeadlineMs,
    sleepTimerActivationId: state.sleepTimerActivationId,
    sleepTimerCloseMode: state.sleepTimerCloseMode,
    sleepTimerHoldsForTrackEnd: state.sleepTimerHoldsForTrackEnd,
    handleToggleSleepTimer: state.handleToggleSleepTimer,
    handleSetSleepTimerHours: state.handleSetSleepTimerHours,
    handleSetSleepTimerMinutes: state.handleSetSleepTimerMinutes,
    handleSetSleepTimerCloseMode: state.handleSetSleepTimerCloseMode,
    handleSetSleepTimerHoldsForTrackEnd: state.handleSetSleepTimerHoldsForTrackEnd,
});
