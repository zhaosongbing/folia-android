import React, { useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import LyricMatchDialog from '../../modal/lyric-match/LyricMatchDialog';
import UnavailableReplacementDialog from '../../modal/UnavailableReplacementDialog';
import SettingsModal from '../../modal/SettingsModal';
import ConfirmDialog from '../../shared/ConfirmDialog';
import type { AppDialogsModel } from './buildAppDialogsModel';
import { StatusToast } from './StatusToast';
import { countRender } from '../../../dev/renderCount';
import { useWallChromeOffsetStore } from '../../../stores/useWallChromeOffsetStore';

// Centralized app-level dialog and toast renderer for the player shell.
type AppDialogsProps = {
    model: AppDialogsModel;
};

const AppDialogs: React.FC<AppDialogsProps> = ({ model }) => {
    // 顶部提示的纵向基准（原 top-[30px]），可在此基础上叠加用户偏移。
    const toastOffset = useWallChromeOffsetStore(state => state.offsets.statusToast);
    const statusToastStyle: React.CSSProperties = {
        top: 30 + toastOffset.y,
        transform: toastOffset.x !== 0 ? `translateX(${toastOffset.x}px)` : undefined,
    };
    countRender('AppDialogs');
    const { statusToast, lyricMatchDialog, unavailableReplacementDialog, settingsDialog, wallpaperEntryConfirmDialog } = model;
    // The settings window is the largest tree the app mounts at a click. Read deferred, it is
    // rendered in slices between frames rather than in the click's own task, which held every frame
    // (the panel closing, the picture) until all of it was built. Closing is not deferred: the
    // window leaves with the click.
    const isSettingsShown = useDeferredValue(settingsDialog != null);

    return (
        <>
            {createPortal(
                // 顶部提示的位置可调：top 在 30px 基准上叠纵向偏移，水平用 translateX 推。
                // 用 translateX 而不是改 left：容器是 inset-x-0（左右都贴边）的 grid，
                // translateX 只挪内容，不会破坏 justify-items-center 的居中。
                <div
                    className="pointer-events-none fixed inset-x-0 z-[210] grid justify-items-center px-4"
                    style={statusToastStyle}
                >
                    <AnimatePresence>
                        {statusToast && <StatusToast key={statusToast.toastKey} toast={statusToast} />}
                    </AnimatePresence>
                </div>,
                document.body,
            )}

            {lyricMatchDialog && <LyricMatchDialog {...lyricMatchDialog} />}
            {unavailableReplacementDialog && <UnavailableReplacementDialog {...unavailableReplacementDialog} />}
            {wallpaperEntryConfirmDialog && <ConfirmDialog {...wallpaperEntryConfirmDialog} />}
            <AnimatePresence>
                {isSettingsShown && settingsDialog && <SettingsModal {...settingsDialog} />}
            </AnimatePresence>
        </>
    );
};

export default React.memo(AppDialogs);
