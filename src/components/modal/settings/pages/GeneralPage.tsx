import React from 'react';
import { Capacitor } from '@capacitor/core';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import type { AppLanguagePreference } from '../../../../i18n/config';
import { useAudioSettingsStore } from '../../../../stores/useAudioSettingsStore';
import { usePlayerChromeSettingsStore } from '../../../../stores/usePlayerChromeSettingsStore';
import { useAppUpdateStore } from '../../../../stores/useAppUpdateStore';
import { selectPonderSettingsSnapshot, usePonderStore } from '../../../../stores/usePonderStore';
import { useSettingsModalStore, SETTINGS_BLUR_MAX_PX, SETTINGS_BLUR_MIN_PX, SETTINGS_FOLD_OPACITY_MAX_PERCENT, SETTINGS_FOLD_OPACITY_MIN_PERCENT, SETTINGS_OPACITY_MAX_PERCENT, SETTINGS_OPACITY_MIN_PERCENT } from '../../../../stores/useSettingsModalStore';
import { Button, FoldedGroup, Reveal, Row, Segmented, Select, Slider, Toggle, option, type SettingsGroupDef, type SettingsOptionDef } from '../kit';
import { FoundUpdateRow } from './FoundUpdateRow';
import { useSettingsPage } from './settingsPageContext';

// src/components/modal/settings/pages/GeneralPage.tsx
// The 通用 page: the interface language, what the app does when it starts and how its window
// buttons show, the desktop app's update check (with the new version, once one is found), and the
// hints of the Ponder tutorials.

const LANGUAGE: SettingsGroupDef = { id: 'languageSettings', titleKey: 'options.languageSettings' };
const LAUNCH: SettingsGroupDef = { id: 'labWindowAndTools', titleKey: 'options.settingsHeadingLaunch' };
const UPDATE: SettingsGroupDef = { id: 'updateCheck', titleKey: 'options.updateCheck', electronOnly: true };
const PONDER: SettingsGroupDef = { id: 'ponderHints', titleKey: 'options.ponderHints' };
/** 在线更新：两端都显示（桌面端有自己那套 electron-updater，这里走 GitHub Releases）。 */
const APP_UPDATE: SettingsGroupDef = { id: 'appUpdate', titleKey: 'options.appUpdateSection' };

const O = {
    language: option(LANGUAGE, 'appLanguage', 'options.appLanguage'),
    autoPlay: option(LAUNCH, 'autoPlayOnLaunch', 'options.autoPlayOnLaunch'),
    openPlayer: option(LAUNCH, 'openPlayerOnLaunch', 'options.openPlayerOnLaunch', { electronOnly: true }),
    titlebarButtons: option(LAUNCH, 'alwaysShowMainWindowTitlebar', 'options.alwaysShowMainWindowTitlebar'),
    systemBars: option(LAUNCH, 'showSystemBars', 'options.showSystemBars'),
    tabIndicator: option(LAUNCH, 'showTabIndicator', 'options.showTabIndicator'),
    settingsBlur: option(LAUNCH, 'settingsModalBlur', 'options.settingsModalBlur'),
    settingsOpacity: option(LAUNCH, 'settingsModalOpacity', 'options.settingsModalOpacity'),
    foldBlur: option(LAUNCH, 'settingsFoldBlur', 'options.settingsFoldBlur'),
    foldOpacity: option(LAUNCH, 'settingsFoldOpacity', 'options.settingsFoldOpacity'),
    confirmOnExit: option(LAUNCH, 'confirmOnExit', 'options.confirmOnExit'),
    updateCheck: option(UPDATE, 'enableUpdateCheck', 'options.enableUpdateCheck'),
    autoUpdate: option(UPDATE, 'enableAutoUpdate', 'options.enableAutoUpdate'),
    appUpdateOnLaunch: option(APP_UPDATE, 'enableAppUpdateCheck', 'options.enableAppUpdateCheck'),
    appUpdateChannel: option(APP_UPDATE, 'appUpdateChannel', 'options.appUpdateChannelLabel'),
    appUpdateNow: option(APP_UPDATE, 'checkAppUpdateNow', 'options.checkAppUpdateNow'),
    updateChannel: option(UPDATE, 'updateChannel', 'options.updateChannel'),
    ponderHints: option(PONDER, 'ponderHintVisibility', 'options.ponderHints'),
    ponderTouchButton: option(PONDER, 'ponderTouchButton', 'options.ponderTouchButton'),
};

export const OPTIONS: SettingsOptionDef[] = Object.values(O);

const GeneralPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { isElectron, viewProps } = useSettingsPage();
    const { openPlayerOnLaunch, onToggleOpenPlayerOnLaunch } = viewProps.desktop.preferences;
    const update = viewProps.desktop.model;
    const { electronSettings, updateStatus } = update;
    const languagePreference = useSettingsModalStore(state => state.appLanguagePreference);
    const setLanguagePreference = useSettingsModalStore(state => state.handleSetAppLanguagePreference);
    const autoPlay = useAudioSettingsStore(state => state.autoPlayOnLaunch);
    const setAutoPlay = useAudioSettingsStore(state => state.handleToggleAutoPlayOnLaunch);
    const titlebarButtons = usePlayerChromeSettingsStore(state => state.alwaysShowMainWindowTitlebar);
    const setTitlebarButtons = usePlayerChromeSettingsStore(state => state.handleToggleAlwaysShowMainWindowTitlebar);
    // 系统栏开关只在原生端有意义（浏览器里没有系统栏可显示）。
    const showSystemBars = usePlayerChromeSettingsStore(state => state.showSystemBars);
    const setShowSystemBars = usePlayerChromeSettingsStore(state => state.handleToggleSystemBars);
    // 设置弹窗自己的偏好（滑动指示线），放在设置 store 而不是播放页 chrome store
    const showTabIndicator = useSettingsModalStore(state => state.showTabIndicator);
    const setShowTabIndicator = useSettingsModalStore(state => state.setShowTabIndicator);
    // 设置弹窗的毛玻璃：模糊半径与面板不透明度（实测反馈）
    const settingsBlurPx = useSettingsModalStore(state => state.settingsBlurPx);
    const setSettingsBlurPx = useSettingsModalStore(state => state.setSettingsBlurPx);
    const settingsOpacityPercent = useSettingsModalStore(state => state.settingsOpacityPercent);
    const setSettingsOpacityPercent = useSettingsModalStore(state => state.setSettingsOpacityPercent);
    // 折叠组卡片自己的一份（与面板分开），调的时候这一组的卡片就在眼前。
    const settingsFoldBlurPx = useSettingsModalStore(state => state.settingsFoldBlurPx);
    const setSettingsFoldBlurPx = useSettingsModalStore(state => state.setSettingsFoldBlurPx);
    const settingsFoldOpacityPercent = useSettingsModalStore(state => state.settingsFoldOpacityPercent);
    const setSettingsFoldOpacityPercent = useSettingsModalStore(state => state.setSettingsFoldOpacityPercent);
    const confirmOnExit = usePlayerChromeSettingsStore(state => state.confirmOnExit);
    const setConfirmOnExit = usePlayerChromeSettingsStore(state => state.handleToggleConfirmOnExit);
    // 在线更新：开关、来源与最近一次检查结果都在这个 store 里，启动时的自动检查也读同一份。
    const appUpdate = useAppUpdateStore(useShallow(state => ({
        enableAppUpdateCheck: state.enableAppUpdateCheck,
        handleToggleAppUpdateCheck: state.handleToggleAppUpdateCheck,
        channel: state.channel,
        handleSetUpdateChannel: state.handleSetUpdateChannel,
        currentVersion: state.currentVersion,
        isChecking: state.isChecking,
        lastResult: state.lastResult,
        availableUpdate: state.availableUpdate,
        checkNow: state.checkNow,
    })));
    const channelLabel = (channel: typeof appUpdate.channel) => (
        channel === 'beta' ? t('options.appUpdateChannelBeta')
            : channel === 'dev' ? t('options.appUpdateChannelDev')
                : t('options.appUpdateChannelStable')
    );
    const appUpdateHint = (() => {
        if (appUpdate.isChecking) return t('appUpdate.checking');
        if (appUpdate.availableUpdate) {
            return t('appUpdate.availableHint', { version: appUpdate.availableUpdate.latestVersion });
        }
        if (appUpdate.lastResult === 'current') return t('appUpdate.upToDate', { version: appUpdate.currentVersion });
        if (appUpdate.lastResult === 'error') return t('appUpdate.checkFailed');
        return t('options.checkAppUpdateNowDesc');
    })();
    const ponder = usePonderStore(useShallow(selectPonderSettingsSnapshot));

    const resolvedLanguage = i18n.resolvedLanguage;
    const resolvedLanguageLabel = resolvedLanguage === 'zh-TW'
        ? t('options.appLanguageZhTW')
        : resolvedLanguage?.startsWith('zh')
            ? t('options.appLanguageZhCN')
            : resolvedLanguage === 'in' || resolvedLanguage?.startsWith('id') ? t('options.appLanguageInID') : t('options.appLanguageEnUS');

    const isInternalBuild = electronSettings.UPDATE_CHANNEL === 'internal';
    const autoUpdateSupported = Boolean(updateStatus?.autoUpdateSupported);

    return (
        <>
            <FoldedGroup def={LANGUAGE}>
                <Row
                    option={O.language}
                    hint={languagePreference === 'system' ? t('options.appLanguageSystemHint', { language: resolvedLanguageLabel }) : undefined}
                >
                    <Select<AppLanguagePreference>
                        value={languagePreference}
                        options={[
                            { value: 'system', label: t('options.appLanguageSystem') },
                            { value: 'zh-CN', label: t('options.appLanguageZhCN') },
                            { value: 'zh-TW', label: t('options.appLanguageZhTW') },
                            { value: 'en', label: t('options.appLanguageEnUS') },
                            { value: 'in', label: t('options.appLanguageInID') },
                        ]}
                        onChange={preference => void setLanguagePreference(preference)}
                    />
                </Row>
            </FoldedGroup>

            <FoldedGroup def={LAUNCH}>
                <Row option={O.autoPlay} hint={t('options.autoPlayOnLaunchDesc')} note={t('options.autoPlayOnLaunchDescSub')}>
                    <Toggle checked={autoPlay} onChange={setAutoPlay} />
                </Row>
                {isElectron && (
                    <Row option={O.openPlayer} note={t('options.openPlayerOnLaunchDesc')}>
                        <Toggle checked={openPlayerOnLaunch} onChange={onToggleOpenPlayerOnLaunch} />
                    </Row>
                )}
                <Row option={O.titlebarButtons} hint={t('options.alwaysShowMainWindowTitlebarDesc')}>
                    <Toggle checked={titlebarButtons} onChange={setTitlebarButtons} />
                </Row>
                {Capacitor.isNativePlatform() && (
                    <Row option={O.systemBars} note={t('options.showSystemBarsDesc')}>
                        <Toggle checked={showSystemBars} onChange={setShowSystemBars} />
                    </Row>
                )}
                {Capacitor.isNativePlatform() && (
                    <Row option={O.confirmOnExit} note={t('options.confirmOnExitDesc')}>
                        <Toggle checked={confirmOnExit} onChange={setConfirmOnExit} />
                    </Row>
                )}
                <Row option={O.tabIndicator} note={t('options.showTabIndicatorDesc')}>
                    <Toggle checked={showTabIndicator} onChange={setShowTabIndicator} />
                </Row>
                {/* 毛玻璃两项：模糊 0 = 纯色面板；不透明度同时作用于窗口与侧栏。
                    滑杆改的是「此刻预览」——弹窗本身就是设置窗口，拖一下就能看到效果。 */}
                <Row option={O.settingsBlur} note={t('options.settingsModalBlurDesc')}>
                    <Slider
                        value={settingsBlurPx}
                        min={SETTINGS_BLUR_MIN_PX}
                        max={SETTINGS_BLUR_MAX_PX}
                        onChange={setSettingsBlurPx}
                        format={value => (value === 0 ? t('options.settingsModalBlurOff') : `${value}px`)}
                    />
                </Row>
                <Row option={O.settingsOpacity} note={t('options.settingsModalOpacityDesc')}>
                    <Slider
                        value={settingsOpacityPercent}
                        min={SETTINGS_OPACITY_MIN_PERCENT}
                        max={SETTINGS_OPACITY_MAX_PERCENT}
                        onChange={setSettingsOpacityPercent}
                        format={value => `${value}%`}
                    />
                </Row>
                {/* 折叠组卡片：浮在面板上的第二层玻璃，单独一档。0 = 卡片不模糊（面板照旧）。 */}
                <Row option={O.foldBlur} note={t('options.settingsFoldBlurDesc')}>
                    <Slider
                        value={settingsFoldBlurPx}
                        min={SETTINGS_BLUR_MIN_PX}
                        max={SETTINGS_BLUR_MAX_PX}
                        onChange={setSettingsFoldBlurPx}
                        format={value => (value === 0 ? t('options.settingsModalBlurOff') : `${value}px`)}
                    />
                </Row>
                <Row option={O.foldOpacity} note={t('options.settingsFoldOpacityDesc')}>
                    <Slider
                        value={settingsFoldOpacityPercent}
                        min={SETTINGS_FOLD_OPACITY_MIN_PERCENT}
                        max={SETTINGS_FOLD_OPACITY_MAX_PERCENT}
                        onChange={setSettingsFoldOpacityPercent}
                        format={value => `${value}%`}
                    />
                </Row>
            </FoldedGroup>

            <FoldedGroup
                def={APP_UPDATE}
                summary={`${t('appUpdate.currentVersionShort', { version: appUpdate.currentVersion })} · ${channelLabel(appUpdate.channel)}`}
            >
                <Row option={O.appUpdateOnLaunch} hint={t('options.enableAppUpdateCheckDesc')}>
                    <Toggle checked={appUpdate.enableAppUpdateCheck} onChange={appUpdate.handleToggleAppUpdateCheck} />
                </Row>
                {/* 三条通道发在同一个仓库里，靠 tag 前缀区分：正式版 v…、内测版 beta-v…、测试版 dev-v…。
                    通道向下兼容（内测也会收到正式版的热修），所以这里不写「只看某一种」。 */}
                <Row option={O.appUpdateChannel} note={t('options.appUpdateChannelDesc')}>
                    <Segmented
                        value={appUpdate.channel}
                        options={[
                            { value: 'stable', label: t('options.appUpdateChannelStable') },
                            { value: 'beta', label: t('options.appUpdateChannelBeta') },
                            { value: 'dev', label: t('options.appUpdateChannelDev') },
                        ]}
                        onChange={appUpdate.handleSetUpdateChannel}
                    />
                </Row>
                <Row option={O.appUpdateNow} hint={appUpdateHint}>
                    <Button
                        variant="quiet"
                        icon={RefreshCw}
                        onClick={() => void appUpdate.checkNow(true)}
                        disabled={appUpdate.isChecking}
                    >
                        {appUpdate.isChecking ? t('appUpdate.checking') : t('appUpdate.checkNow')}
                    </Button>
                </Row>
            </FoldedGroup>

            {isElectron && (
                <FoldedGroup def={UPDATE} summary={update.updateBadgeLabel}>
                    {/* 折叠组没有标题行右侧的 action 位，「检查更新」改成内容区第一行；
                        标题行用 summary 显示当前状态。 */}
                    <Row>
                        <Button
                            variant="quiet"
                            icon={RefreshCw}
                            onClick={() => void update.onCheckForUpdates()}
                            disabled={!electronSettings.ENABLE_UPDATE_CHECK || !updateStatus?.updateCheckSupported || updateStatus?.status === 'checking'}
                        >
                            {update.updateBadgeLabel}
                        </Button>
                    </Row>
                    <FoundUpdateRow />
                    <Row
                        option={O.updateCheck}
                        hint={t(updateStatus?.updateCheckSupportReason === 'channel' ? 'options.updateUnsupportedChannel' : 'options.enableUpdateCheckDesc')}
                        disabled={!updateStatus?.updateCheckSupported}
                    >
                        <Toggle checked={electronSettings.ENABLE_UPDATE_CHECK} onChange={() => void update.onToggleUpdateCheck()} />
                    </Row>
                    <Reveal when={electronSettings.ENABLE_UPDATE_CHECK}>
                        {/* Kept in view where the app cannot update itself: the reason is under the label. */}
                        <Row
                            sub
                            option={O.autoUpdate}
                            hint={t(autoUpdateSupported
                                ? 'options.enableAutoUpdateDesc'
                                : updateStatus?.autoUpdateSupportReason === 'system' ? 'options.updateUnsupportedSystem' : 'options.manualUpdateOnlyDesc')}
                            disabled={!update.canEnableAutoUpdate}
                        >
                            <Toggle checked={electronSettings.ENABLE_AUTO_UPDATE && autoUpdateSupported} onChange={() => void update.onToggleAutoUpdate()} />
                        </Row>
                    </Reveal>
                    <Row option={O.updateChannel} disabled={isInternalBuild}>
                        <Select
                            value={electronSettings.UPDATE_CHANNEL}
                            options={isInternalBuild
                                ? [{ value: 'internal', label: t('options.updateChannelInternal') }]
                                : [
                                    { value: 'realeco', label: t('options.updateChannelRealeco') },
                                    { value: 'limo', label: t('options.updateChannelLimo') },
                                    { value: 'cielo', label: t('options.updateChannelCielo') },
                                ]}
                            onChange={channel => void update.onUpdateChannelChange(channel as 'realeco' | 'limo' | 'cielo')}
                        />
                    </Row>
                                    <p className="mx-1 mt-2 text-xs leading-[18px] text-[color:var(--st-t3)]">
                        {t(autoUpdateSupported ? 'options.autoUpdateGithubNotice' : 'options.updateCheckGithubNotice')}
                    </p>
</FoldedGroup>
            )}

            <FoldedGroup def={PONDER}>
                <Row option={O.ponderHints} hint={t('options.ponderHintsDesc')}>
                    <Segmented
                        value={ponder.ponderHintVisibility}
                        options={[
                            { value: 'always', label: t('options.ponderHintsAlways') },
                            { value: 'unseen', label: t('options.ponderHintsUnseen') },
                            { value: 'off', label: t('options.ponderHintsOff') },
                        ]}
                        onChange={ponder.setPonderHintVisibility}
                    />
                </Row>
                <Row option={O.ponderTouchButton} hint={t('options.ponderTouchButtonDesc')}>
                    <Toggle checked={ponder.showPonderTouchButton} onChange={ponder.setShowPonderTouchButton} />
                </Row>
            </FoldedGroup>
        </>
    );
};

export default GeneralPage;
