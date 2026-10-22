// src/components/modal/ExitConfirmDialog.tsx
// 返回键的二次确认：从播放界面按返回时，先问一次再走，避免手滑退出。
//
// 配色用全站变量（--bg-color / --text-primary），不用设置弹窗那套 --st-*：
// 后者只在其 Provider 内定义，拿不到就会在浅色模式下变成「浅底浅字」。

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

type ExitConfirmDialogProps = {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

const ExitConfirmDialog: React.FC<ExitConfirmDialogProps> = ({ open, onConfirm, onCancel }) => {
    const { t } = useTranslation();

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.16 }}
                    className="fixed inset-0 z-[215] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        onClick={event => event.stopPropagation()}
                        role="alertdialog"
                        aria-modal="true"
                        className="w-full max-w-xs overflow-hidden rounded-2xl bg-[var(--bg-color)] p-5 text-[color:var(--text-primary)] shadow-[0_20px_60px_rgba(0,0,0,0.45)] ring-1 ring-[color-mix(in_srgb,var(--text-primary)_14%,transparent)]"
                    >
                        <h2 className="text-[15px] font-semibold leading-6">{t('appExit.title')}</h2>
                        <p className="mt-1.5 text-[13px] leading-5 text-[color:color-mix(in_srgb,var(--text-primary)_62%,transparent)]">
                            {t('appExit.message')}
                        </p>
                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="rounded-lg px-3 py-2 text-[13px] text-[color:color-mix(in_srgb,var(--text-primary)_70%,transparent)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
                            >
                                {t('appExit.cancel')}
                            </button>
                            <button
                                type="button"
                                onClick={onConfirm}
                                className="rounded-lg bg-[var(--text-primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--bg-color)] transition-opacity hover:opacity-90"
                            >
                                {t('appExit.confirm')}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ExitConfirmDialog;
