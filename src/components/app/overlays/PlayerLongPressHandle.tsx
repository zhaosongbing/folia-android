// src/components/app/overlays/PlayerLongPressHandle.tsx
// 播放页长按手势的落点控件：长按成立后在手指位置浮出一条滑轨，中间是可拖动的按钮，
// 两端各一个目标图标（左＝命令面板，右＝播放列表）。往哪边滑，哪边的图标就亮起来。
//
// 为什么做成滑轨而不是「一个按钮 + 两个箭头」：箭头只能提示方向，不能告诉用户「滑到哪儿才算」。
// 右侧那个面板把手早就是这么做的（滑轨 + 跟手 + 目标图标），同一套视觉语言，用户不用学两遍。
//
// 这个控件不接指针事件（pointer-events-none）：滑动判定仍在播放页根层的 pointermove 里做，
// 手指从按下到滑动全程没离开屏幕，事件不会流经这个节点。位移通过 MotionValue 传进来，
// 每帧更新走 framer 的合成层，不触发 React 重渲染。

import React from 'react';
import { AnimatePresence, motion, useTransform, type MotionValue } from 'framer-motion';
import { Command, ListMusic } from 'lucide-react';

/** 滑块直径。 */
const KNOB_SIZE = 48;
/** 滑轨总宽：滑块向左右各能移动 (TRACK_WIDTH - KNOB_SIZE) / 2 = 60px。 */
const TRACK_WIDTH = 168;
const TRACK_HEIGHT = KNOB_SIZE;
/** 与 longPressGesture.ts 的触发阈值一致：滑到 36px 时对应图标达到最亮。 */
const TRIGGER_PX = 36;

type PlayerLongPressHandleProps = {
    position: { x: number; y: number } | null;
    /** 当前手指相对落点的水平位移（px），由 App 的 pointermove 喂进来 */
    slideX: MotionValue<number>;
};

const PlayerLongPressHandle: React.FC<PlayerLongPressHandleProps> = ({ position, slideX }) => {
    // 滑块跟手，但不许滑出滑轨
    const knobX = useTransform(slideX, value => {
        const limit = (TRACK_WIDTH - KNOB_SIZE) / 2;
        return Math.max(-limit, Math.min(limit, value));
    });
    // 两端图标随位移变亮：静止时 0.4，滑到触发阈值时 1
    const leftGlow = useTransform(slideX, [-TRIGGER_PX, 0], [1, 0.4]);
    const rightGlow = useTransform(slideX, [0, TRIGGER_PX], [0.4, 1]);
    // 滑过阈值时图标轻微放大，给一个「松手就生效」的确认
    const leftScale = useTransform(slideX, [-TRIGGER_PX - 8, -TRIGGER_PX], [1.15, 1]);
    const rightScale = useTransform(slideX, [TRIGGER_PX, TRIGGER_PX + 8], [1, 1.15]);

    return (
        <AnimatePresence>
            {position && (
                <motion.div
                    aria-hidden
                    data-player-long-press-handle
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="pointer-events-none fixed z-[56] flex items-center justify-center rounded-full bg-black/25 backdrop-blur-sm"
                    style={{
                        width: TRACK_WIDTH,
                        height: TRACK_HEIGHT,
                        left: position.x - TRACK_WIDTH / 2,
                        top: position.y - TRACK_HEIGHT / 2,
                    }}
                >
                    {/* 左端：命令面板 */}
                    <motion.div
                        className="absolute flex items-center justify-center text-white"
                        style={{ left: 14, opacity: leftGlow, scale: leftScale }}
                    >
                        <Command size={20} strokeWidth={2.2} />
                    </motion.div>
                    {/* 右端：播放列表 */}
                    <motion.div
                        className="absolute flex items-center justify-center text-white"
                        style={{ right: 14, opacity: rightGlow, scale: rightScale }}
                    >
                        <ListMusic size={20} strokeWidth={2.2} />
                    </motion.div>
                    {/* 滑块 */}
                    <motion.div
                        className="absolute flex items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-md"
                        style={{ width: KNOB_SIZE, height: KNOB_SIZE, x: knobX }}
                    >
                        <span className="text-[11px] font-semibold tracking-wide">滑动</span>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default PlayerLongPressHandle;
