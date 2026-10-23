import React from 'react';
import { motion, useTransform } from 'framer-motion';
import { scaledPx, useWallChromeOffsetStore } from '../../../stores/useWallChromeOffsetStore';
import { usePlayerBottomBarBottomPx } from '../../../hooks/usePlayerBottomBarBottomPx';

// src/components/app/playing-song-locator/LocateFloatingSlot.tsx
// 定位按钮的独立锚点。
//
// 在这之前，定位按钮是作为动作按钮的 `above` 插槽渲染的 —— 也就是和工具按钮同处一条
// 竖向弹性列（.lattice-tools.has-above / GridListSearchButton 的 flex-col）。
// 那条列的整体位移来自工具按钮自己的偏移（负 margin），于是「拖工具，定位跟着跑」。
// 两者本来是两组独立设置，视觉上却捆在一起。
//
// 现在把定位按钮挪进这个 fixed 槽：它有自己的默认位置（右下角、工具按钮正上方 12px），
// 自己的偏移（wallLocate），与工具按钮互不影响。默认位置按「工具按钮的默认几何」写死，
// 不读工具按钮的实时位置 —— 读了就又绑回去了。
//
// 底距跟着播放器底栏抬升走，与工具按钮用同一个 hook、同一个基准值，所以两者始终对齐。

type LocateFloatingSlotProps = {
    children: React.ReactNode;
};

/** 工具按钮的基准边长：四颗按钮默认一样大（40）。 */
const TOOLS_BASE_SIZE_PX = 40;
/** 定位按钮与工具按钮之间的固定间距，沿用 has-above 那条列的 12px。 */
const LOCATE_GAP_PX = 12;
/** 右下角基准内距：窄屏 16、宽屏 24，与 .lattice-tools 的媒体查询一致。 */
const BASE_INSET_PX = 16;

export const LocateFloatingSlot: React.FC<LocateFloatingSlotProps> = ({ children }) => {
    // 与工具按钮同一个底距来源：底栏抬起来时两者一起抬，不会一个贴底一个悬空。
    // 这个 hook 给的是 MotionValue（底栏高度是动画量），所以用 useTransform 叠高度与间距，
    // 不能直接相加数字。
    const bottomPx = usePlayerBottomBarBottomPx(BASE_INSET_PX);
    const scale = useWallChromeOffsetStore(state => state.scale);
    const toolsHeight = scaledPx(TOOLS_BASE_SIZE_PX, scale);
    const slotBottom = useTransform(bottomPx, value => value + toolsHeight + LOCATE_GAP_PX);
    return (
        <motion.div
            className="pointer-events-none fixed right-4 z-[60] md:right-6"
            data-locate-slot=""
            style={{ bottom: slotBottom }}
        >
            <div className="pointer-events-auto">{children}</div>
        </motion.div>
    );
};

export default LocateFloatingSlot;
