import React, { useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MoonStar, SunMedium } from 'lucide-react';
import { Toggle } from '../../modal/settings/kit';
import { usePlayerChromeSettingsStore } from '../../../stores/usePlayerChromeSettingsStore';
import { useSleepTimerStore, type SleepTimerCloseMode } from '../../../stores/useSleepTimerStore';
import { GroupLine } from '../shell/GroupLine';
import { PanelRow } from '../shell/PanelRow';
import { Segments } from '../shell/Segments';
import { Stepper } from '../shell/Stepper';

// src/components/panelTab/controls/SleepSection.tsx
// 控制页里的「睡眠」一组：屏幕常亮、定时关闭（15/30/60/90 分钟快捷 + 自定义）、以及到点之后
// 是立刻停还是让当前这首放完。
//
// 常亮开关和设置里那一项是同一个 store 字段（keep_screen_on_while_playing），
// 所以在面板里开、在设置里看，两边一致。

const QUICK_MINUTES = [15, 30, 60, 90] as const;
const TOTAL_MINUTES_MAX = 999;

const CHIP_BASE = 'st-t-fast st-focus-inside inline-flex h-7 shrink-0 items-center justify-center rounded-lg px-2.5 text-xs transition-[background-color,color,box-shadow,scale] enabled:active:scale-[0.96]';

const formatCountdown = (ms: number): string => {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pad = (value: number) => String(value).padStart(2, '0');
    return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
};

const SleepSection: React.FC = () => {
    const { t } = useTranslation();
    const keepOnLabelId = useId();
    const timerLabelId = useId();

    const keepScreenOn = usePlayerChromeSettingsStore(state => state.keepScreenOnWhilePlaying);
    const handleToggleKeepScreenOn = usePlayerChromeSettingsStore(state => state.handleToggleKeepScreenOn);

    const enabled = useSleepTimerStore(state => state.sleepTimerEnabled);
    const hours = useSleepTimerStore(state => state.sleepTimerHours);
    const minutes = useSleepTimerStore(state => state.sleepTimerMinutes);
    const deadline = useSleepTimerStore(state => state.sleepTimerDeadlineMs);
    const closeMode = useSleepTimerStore(state => state.sleepTimerCloseMode);
    const holdsForTrackEnd = useSleepTimerStore(state => state.sleepTimerHoldsForTrackEnd);
    const handleToggleSleepTimer = useSleepTimerStore(state => state.handleToggleSleepTimer);
    const handleSetSleepTimerHours = useSleepTimerStore(state => state.handleSetSleepTimerHours);
    const handleSetSleepTimerMinutes = useSleepTimerStore(state => state.handleSetSleepTimerMinutes);
    const handleSetSleepTimerCloseMode = useSleepTimerStore(state => state.handleSetSleepTimerCloseMode);

    const totalMinutes = hours * 60 + minutes;

    // 倒计时每秒走一格；只有定时真的在走的时候才开这个计时器。
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled || deadline === null) return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [enabled, deadline]);

    const setTotalMinutes = (next: number) => {
        const clamped = Math.max(0, Math.min(TOTAL_MINUTES_MAX, Math.floor(next)));
        handleSetSleepTimerHours(Math.floor(clamped / 60));
        handleSetSleepTimerMinutes(clamped % 60);
    };

    const closeModeOptions = useMemo(() => ([
        { value: 'after-track' as SleepTimerCloseMode, label: t('panel.sleep.afterTrack') },
        { value: 'immediate' as SleepTimerCloseMode, label: t('panel.sleep.immediate') },
    ]), [t]);

    const timerHint = holdsForTrackEnd
        ? t('panel.sleep.afterTrackArmed')
        : enabled && deadline !== null
            ? t('panel.sleep.countdown', { time: formatCountdown(deadline - now) })
            : t('panel.sleep.offHint');

    return (
        <div>
            <GroupLine />

            {/* 常亮：一行一个开关，名字就是它的可读标签 */}
            <PanelRow
                label={(
                    <span id={keepOnLabelId} className="inline-flex items-center gap-1.5">
                        <SunMedium size={14} className="text-[color:var(--st-t3)]" />
                        {t('panel.sleep.keepScreenOn')}
                    </span>
                )}
                hint={t('panel.sleep.keepScreenOnHint')}
            >
                <Toggle
                    checked={keepScreenOn}
                    onChange={handleToggleKeepScreenOn}
                    labelledBy={keepOnLabelId}
                />
            </PanelRow>

            <PanelRow
                label={(
                    <span id={timerLabelId} className="inline-flex items-center gap-1.5">
                        <MoonStar size={14} className="text-[color:var(--st-t3)]" />
                        {t('panel.sleep.timer')}
                    </span>
                )}
                hint={timerHint}
            >
                <Toggle
                    checked={enabled}
                    onChange={handleToggleSleepTimer}
                    labelledBy={timerLabelId}
                />
            </PanelRow>

            {/* 快捷时长 + 自定义分钟数 */}
            <div className="flex min-h-11 flex-wrap items-center gap-1.5 px-1 py-1.5">
                {QUICK_MINUTES.map(option => {
                    const active = totalMinutes === option;
                    return (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setTotalMinutes(option)}
                            className={`${CHIP_BASE} ${active
                                ? 'bg-[var(--st-raise)] text-[color:var(--st-t1)] shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
                                : 'bg-[var(--st-fill)] text-[color:var(--st-t2)] enabled:hover:bg-[var(--st-fill2)] enabled:hover:text-[color:var(--st-t1)]'}`}
                        >
                            {t('panel.sleep.minutesShort', { count: option })}
                        </button>
                    );
                })}
                <span className="ml-auto flex items-center gap-1.5">
                    <span className="text-xs text-[color:var(--st-t3)]">{t('panel.sleep.custom')}</span>
                    <Stepper
                        value={totalMinutes}
                        onChange={setTotalMinutes}
                        step={5}
                        label={t('panel.sleep.customLabel')}
                        unit={t('panel.sleep.minutesUnit')}
                    />
                </span>
            </div>

            <PanelRow label={t('panel.sleep.closeMode')} hint={t('panel.sleep.closeModeHint')}>
                <Segments<SleepTimerCloseMode>
                    value={closeMode}
                    options={closeModeOptions}
                    onChange={handleSetSleepTimerCloseMode}
                    size="s"
                />
            </PanelRow>
        </div>
    );
};

export default SleepSection;
