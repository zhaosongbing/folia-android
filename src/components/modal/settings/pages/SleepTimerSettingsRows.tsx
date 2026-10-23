import React from 'react';
import { useTranslation } from 'react-i18next';
import { NumberField, Row, Segmented, Toggle, type SettingsOptionDef } from '../kit';
import { useSleepTimerStore, type SleepTimerCloseMode } from '../../../../stores/useSleepTimerStore';

// src/components/modal/settings/pages/SleepTimerSettingsRows.tsx
// 设置里「播放行为」组中的定时关闭：开关、时长（15/30/60/90 分钟或自定义）、到点之后的关闭方式。
// 和面板控制页那一组读写同一份 store，所以两边永远一致。

const QUICK_MINUTES = [15, 30, 60, 90] as const;
const TOTAL_MINUTES_MAX = 999;

type SleepTimerSettingsRowsProps = {
    options: {
        timer: SettingsOptionDef;
        duration: SettingsOptionDef;
        custom: SettingsOptionDef;
        mode: SettingsOptionDef;
    };
};

export const SleepTimerSettingsRows: React.FC<SleepTimerSettingsRowsProps> = ({ options }) => {
    const { t } = useTranslation();

    const enabled = useSleepTimerStore(state => state.sleepTimerEnabled);
    const hours = useSleepTimerStore(state => state.sleepTimerHours);
    const minutes = useSleepTimerStore(state => state.sleepTimerMinutes);
    const closeMode = useSleepTimerStore(state => state.sleepTimerCloseMode);
    const holdsForTrackEnd = useSleepTimerStore(state => state.sleepTimerHoldsForTrackEnd);
    const handleToggle = useSleepTimerStore(state => state.handleToggleSleepTimer);
    const handleSetHours = useSleepTimerStore(state => state.handleSetSleepTimerHours);
    const handleSetMinutes = useSleepTimerStore(state => state.handleSetSleepTimerMinutes);
    const handleSetCloseMode = useSleepTimerStore(state => state.handleSetSleepTimerCloseMode);

    const totalMinutes = hours * 60 + minutes;

    const setTotalMinutes = (next: number | null) => {
        const clamped = Math.max(0, Math.min(TOTAL_MINUTES_MAX, Math.floor(next ?? 0)));
        handleSetHours(Math.floor(clamped / 60));
        handleSetMinutes(clamped % 60);
    };

    return (
        <>
            <Row option={options.timer} hint={holdsForTrackEnd ? t('options.sleepTimerAfterTrackHint') : t('options.sleepTimerHint')}>
                <Toggle checked={enabled} onChange={handleToggle} />
            </Row>
            <Row option={options.duration} sub>
                <Segmented<string>
                    value={QUICK_MINUTES.includes(totalMinutes as typeof QUICK_MINUTES[number])
                        ? String(totalMinutes)
                        : 'custom'}
                    options={[
                        ...QUICK_MINUTES.map(option => ({ value: String(option), label: t('panel.sleep.minutesShort', { count: option }) })),
                        { value: 'custom', label: t('options.sleepTimerCustom') },
                    ]}
                    onChange={(value) => {
                        if (value !== 'custom') setTotalMinutes(Number(value));
                    }}
                />
            </Row>
            <Row option={options.custom} sub hint={t('options.sleepTimerCustomHint')}>
                <NumberField
                    value={totalMinutes}
                    onChange={setTotalMinutes}
                    min={0}
                    max={TOTAL_MINUTES_MAX}
                    step={5}
                />
            </Row>
            <Row option={options.mode} sub>
                <Segmented<SleepTimerCloseMode>
                    value={closeMode}
                    options={[
                        { value: 'after-track', label: t('panel.sleep.afterTrack') },
                        { value: 'immediate', label: t('panel.sleep.immediate') },
                    ]}
                    onChange={handleSetCloseMode}
                />
            </Row>
        </>
    );
};

export default SleepTimerSettingsRows;
