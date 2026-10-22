// src/components/modal/AppUpdateDialog.tsx
// 「发现新版本」弹窗：版本对比、更新日志、前往下载。
//
// 为什么更新日志用纯文本而不是 Markdown 渲染：release 正文里值得看的就是列表项，
// formatReleaseNotes 已经把标记符号去掉；为一个弹窗引一个 Markdown 渲染库，
// 体积和 XSS 面都不划算。保留换行 + 等宽滚动就够读。

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, Loader2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatReleaseNotes } from '../../services/appUpdate';
import type { AppUpdateInfo } from '../../services/appUpdate';
import { canDownloadUpdateInApp, downloadAndInstallUpdate } from '../../services/appUpdateDownload';

type AppUpdateDialogProps = {
    info: AppUpdateInfo | null;
    onDownload: (url: string) => void;
    /** 稍后再说：关掉但不跳过，下次启动还会提示 */
    onLater: () => void;
    /** 跳过这个版本：以后不再为它弹窗 */
    onSkip: (version: string) => void;
};

type DownloadState =
    | { status: 'idle' }
    | { status: 'downloading'; percent: number }
    | { status: 'installing' }
    | { status: 'error'; message: string };

const AppUpdateDialog: React.FC<AppUpdateDialogProps> = ({ info, onDownload, onLater, onSkip }) => {
    const { t } = useTranslation();
    const notes = info ? formatReleaseNotes(info.releaseNotes) : '';
    // 应用内下载的状态：进度、正在交给安装器、失败原因
    const [download, setDownload] = useState<DownloadState>({ status: 'idle' });

    const startDownload = async () => {
        if (!info) return;
        const url = info.downloadUrl ?? info.releaseUrl;
        if (!url) return;

        // 浏览器预览没有原生壳：退回打开链接（老行为）
        if (!canDownloadUpdateInApp() || !info.downloadUrl) {
            onDownload(url);
            return;
        }

        setDownload({ status: 'downloading', percent: 0 });
        try {
            await downloadAndInstallUpdate(info.downloadUrl, info.latestVersion, progress => {
                setDownload({ status: 'downloading', percent: progress.percent });
            });
            // 下载完插件已经拉起系统安装器，这里只负责把按钮状态切过去
            setDownload({ status: 'installing' });
        } catch (error) {
            setDownload({
                status: 'error',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };

    // 换了一个版本要继续下载时，状态要归零
    React.useEffect(() => {
        setDownload({ status: 'idle' });
    }, [info?.latestVersion]);

    return (
        <AnimatePresence>
            {info && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
                    onClick={onLater}
                    data-testid="app-update-dialog"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 4 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        onClick={event => event.stopPropagation()}
                        // 与设置弹窗、退出确认框一致的弹窗标记：返回键的处理据此判断「还有弹窗开着」
                        role="dialog"
                        aria-modal="true"
                        className="flex max-h-[min(80dvh,620px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-[var(--bg-color)] text-[color:var(--text-primary)] shadow-[0_24px_70px_rgba(0,0,0,0.45)] ring-1 ring-[color-mix(in_srgb,var(--text-primary)_14%,transparent)]"
                    >
                        <div className="flex items-start justify-between gap-3 px-5 pt-5">
                            <div className="min-w-0">
                                <h2 className="text-base font-semibold leading-6">{t('appUpdate.title')}</h2>
                                <p className="mt-1 text-[13px] leading-5 text-[color:color-mix(in_srgb,var(--text-primary)_62%,transparent)]">
                                    {t('appUpdate.versionLine', {
                                        current: info.currentVersion,
                                        latest: info.latestVersion,
                                    })}
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label={t('appUpdate.later')}
                                onClick={onLater}
                                className="st-focus-inside -mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:color-mix(in_srgb,var(--text-primary)_62%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5">
                            {notes ? (
                                <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-[22px] text-[color:var(--text-primary)]">
                                    {notes}
                                </pre>
                            ) : (
                                <p className="text-[13px] leading-5 text-[color:color-mix(in_srgb,var(--text-primary)_62%,transparent)]">{t('appUpdate.noNotes')}</p>
                            )}
                        </div>

                        {download.status === 'downloading' && (
                            <div className="px-5">
                                <div className="h-1 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text-primary)_14%,transparent)]">
                                    <div
                                        className="h-full rounded-full bg-[var(--text-primary)] transition-[width] duration-200"
                                        style={{ width: `${Math.max(2, download.percent)}%` }}
                                    />
                                </div>
                            </div>
                        )}
                        {download.status === 'error' && (
                            <p className="px-5 text-[12px] leading-5 text-[#e5484d]">
                                {t('appUpdate.downloadFailed')}
                            </p>
                        )}

                        <div className="flex items-center justify-end gap-2 px-5 py-4">
                            <button
                                type="button"
                                onClick={() => onSkip(info.latestVersion)}
                                className="st-focus-inside rounded-lg px-3 py-2 text-[13px] text-[color:color-mix(in_srgb,var(--text-primary)_62%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
                            >
                                {t('appUpdate.skipVersion')}
                            </button>
                            <button
                                type="button"
                                onClick={onLater}
                                className="st-focus-inside rounded-lg px-3 py-2 text-[13px] text-[color:color-mix(in_srgb,var(--text-primary)_62%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
                            >
                                {t('appUpdate.later')}
                            </button>
                            <button
                                type="button"
                                onClick={() => void startDownload()}
                                disabled={download.status === 'downloading' || download.status === 'installing'}
                                className="st-focus-inside flex min-w-[104px] items-center justify-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--bg-color)] transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-70"
                            >
                                {download.status === 'downloading' ? (
                                    <>
                                        <Loader2 size={15} className="animate-spin" />
                                        {t('appUpdate.downloading', { percent: download.percent })}
                                    </>
                                ) : download.status === 'installing' ? (
                                    <>
                                        <Loader2 size={15} className="animate-spin" />
                                        {t('appUpdate.installing')}
                                    </>
                                ) : (
                                    <>
                                        <Download size={15} />
                                        {info.downloadUrl ? t('appUpdate.download') : t('appUpdate.openReleasePage')}
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AppUpdateDialog;
