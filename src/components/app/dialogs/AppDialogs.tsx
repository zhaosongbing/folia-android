import React, { useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
    // 顶部提示的纵向基准（原 top-[30px]），可在此基础上叠加用户偏移。
    const toastOffset = useWallChromeOffsetStore(state => state.offsets.statusToast);
    // 编辑态里提示多半不在屏幕上（它是短暂的），画一个同尺寸的占位，
    // 否则这个位置永远没法调 —— 用户要能看见框、拖动它，提示来的时候才落在那儿。
    const editMode = useWallChromeOffsetStore(state => state.chromeEditMode);
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
                // 编辑态里把这一层降到编辑覆盖层（z-400）下面：否则提示占位的胶囊盖住虚线框，
                // 指针落在胶囊上，框就拖不动了。平时仍是 z-210（要压住墙面与面板）。
                <div
                    className={`pointer-events-none fixed inset-x-0 ${editMode ? 'z-[120]' : 'z-[210]'} grid justify-items-center px-4`}
                    style={statusToastStyle}
                >
                    <AnimatePresence>
                        {statusToast && <StatusToast key={statusToast.toastKey} toast={statusToast} />}
                        {!statusToast && editMode && (
                            // 占位与真提示共用 .status-toast 的外观，但不可交互：拖动由编辑态的虚线框负责。
                            // pointer-events 用 inline 写死 —— .status-toast 自己的 auto 会盖掉 class。
                            <div
                                key="status-toast-edit-slot"
                                data-status-toast-slot=""
                                className="status-toast is-calm is-open"
                                style={{ pointerEvents: 'none' }}
                                aria-hidden
                            >
                                <div className="status-toast-line">{t('options.wallChromeTargetToast')}</div>
                            </div>
                        )}
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
