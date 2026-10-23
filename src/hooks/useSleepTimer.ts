import { useEffect, useRef } from 'react';
import { PlayerState } from '../types';
import { runSleepTimerExpiryAction } from './sleepTimerExpiry';
import { useSleepTimerStore } from '../stores/useSleepTimerStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import i18n from '../i18n/config';

// src/hooks/useSleepTimer.ts
// 定时关闭的倒计时。到点只有一个出口：`expire`。它由三条路进来 —— 每秒的 tick、页面重新可见
// （visibilitychange）、窗口重新获得焦点 —— 因为 Android 的 WebView 在后台会把定时器冻住甚至清掉，
// 只靠 tick 的话「锁屏听着睡着」这种最典型的用法永远等不到到点。

type UseSleepTimerState = {
    enabled: boolean;
    hours: number;
    minutes: number;
    onExpireFallback: () => void;
};

const TICK_MS = 1000;

export const useSleepTimer = ({ enabled, hours, minutes, onExpireFallback }: UseSleepTimerState) => {
    const onExpireFallbackRef = useRef(onExpireFallback);
    const activationId = useSleepTimerStore(state => state.sleepTimerActivationId);

    useEffect(() => {
        onExpireFallbackRef.current = onExpireFallback;
    }, [onExpireFallback]);

    useEffect(() => {
        if (!enabled || (hours === 0 && minutes === 0)) {
            useSleepTimerStore.setState({ sleepTimerDeadlineMs: null });
            return;
        }

        const totalMs = (hours * 3600 + minutes * 60) * 1000;
        const deadline = Date.now() + totalMs;
        useSleepTimerStore.setState({ sleepTimerDeadlineMs: deadline });

        /** 到点：这一次的定时用完就结束，不会执行第二遍。 */
        const expire = () => {
            // 「播完整首歌」：还有歌在放就交给播放结束那一刻，不在这里打断。
            const playing = usePlaybackStore.getState().playerState === PlayerState.PLAYING;
            const holdsForTrackEnd = useSleepTimerStore.getState().sleepTimerCloseMode === 'after-track' && playing;
            if (holdsForTrackEnd) {
                useSleepTimerStore.setState({
                    sleepTimerEnabled: false,
                    sleepTimerDeadlineMs: null,
                    sleepTimerHoldsForTrackEnd: true,
                });
                setStatusMessage({ type: 'info', text: i18n.t('notifications.sleepTimerAfterTrackArmed') });
                return;
            }

            useSleepTimerStore.setState({
                sleepTimerEnabled: false,
                sleepTimerDeadlineMs: null,
                sleepTimerHoldsForTrackEnd: false,
            });

            void runSleepTimerExpiryAction({
                quitApp: window.electron?.quitApp,
                onFallback: () => onExpireFallbackRef.current(),
            });
        };

        const timer = window.setInterval(() => {
            if (Date.now() >= deadline) {
                window.clearInterval(timer);
                expire();
            }
        }, TICK_MS);

        // 后台回来立刻核一次：被冻住的定时器可能在到点之后才第一次醒来，那时不能再等下一秒。
        const checkAfterResume = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
            if (Date.now() < deadline) return;
            window.clearInterval(timer);
            expire();
        };
        document.addEventListener('visibilitychange', checkAfterResume);
        window.addEventListener('focus', checkAfterResume);

        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', checkAfterResume);
            window.removeEventListener('focus', checkAfterResume);
            useSleepTimerStore.setState({ sleepTimerDeadlineMs: null });
        };
    }, [activationId, enabled, hours, minutes]);
};
