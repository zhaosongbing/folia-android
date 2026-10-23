import { useEffect, useRef } from 'react';
import { PlayerState } from '../types';
import { runSleepTimerExpiryAction } from './sleepTimerExpiry';
import { useSleepTimerStore } from '../stores/useSleepTimerStore';
import { usePlaybackStore } from '../stores/usePlaybackStore';
import { setStatusMessage } from '../stores/useStatusMessageStore';
import i18n from '../i18n/config';

// src/hooks/useSleepTimer.ts

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
        const timer = window.setInterval(() => {
            if (Date.now() >= deadline) {
                window.clearInterval(timer);

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
            }
        }, TICK_MS);

        return () => {
            window.clearInterval(timer);
            useSleepTimerStore.setState({ sleepTimerDeadlineMs: null });
        };
    }, [activationId, enabled, hours, minutes]);
};
