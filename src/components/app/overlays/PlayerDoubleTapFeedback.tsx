// src/components/app/overlays/PlayerDoubleTapFeedback.tsx
// 播放页手势的落点反馈：双击分区、长按待命、长按后滑动的方向，都在落点闪一下。
//
// 为什么不用 statusMessage 弹文案：切歌本身已经有整屏歌词/封面的变化作为反馈，
// 再在底部弹一条「已切到下一首」既遮挡内容又重复；播放/暂停同理。落点图标能同时
// 回答「我点的是哪个区」和「这个区做了什么」，且不占版面。
//
// armed 那一帧是必需的：长按成立到滑动之间有 450ms 以上的等待，没有反馈的话
// 用户不知道自己已经进入「可以滑了」的状态，会以为手势没响应。

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Circle, Command, ListMusic, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { DoubleTapZone } from '../playback/doubleTapGesture';

/** 反馈的三种来历：双击分区、长按待命、长按后滑动。 */
export type PlayerGestureCueKind = 'zone' | 'armed' | 'slide';

export type PlayerDoubleTapCue = {
    /** 递增 id：连续触发时让 AnimatePresence 按新的一帧重新播动画 */
    id: number;
    kind: PlayerGestureCueKind;
    /** kind 为 'zone' 时的分区 */
    zone?: DoubleTapZone;
    /** kind 为 'slide' 时的方向 */
    direction?: 'left' | 'right';
    /** 视口坐标，图标以它为中心 */
    x: number;
    y: number;
    /** 动作前的播放状态：中区据此显示「将要变成」的图标 */
    playing: boolean;
};

const CUE_SIZE = 64;

const PlayerDoubleTapFeedback: React.FC<{ cue: PlayerDoubleTapCue | null }> = ({ cue }) => (
    <AnimatePresence>
        {cue && (
            <motion.div
                key={cue.id}
                aria-hidden
                data-player-double-tap-feedback={cue.kind === 'zone' ? cue.zone : cue.kind}
                initial={{ opacity: 0, scale: 0.75 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.1 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="pointer-events-none fixed z-[55] flex items-center justify-center rounded-full bg-black/45 text-white shadow-lg backdrop-blur-md"
                style={{
                    width: CUE_SIZE,
                    height: CUE_SIZE,
                    left: cue.x - CUE_SIZE / 2,
                    top: cue.y - CUE_SIZE / 2,
                }}
            >
                {cue.kind === 'zone' && cue.zone === 'prev' && <SkipBack size={26} strokeWidth={2.2} />}
                {cue.kind === 'zone' && cue.zone === 'next' && <SkipForward size={26} strokeWidth={2.2} />}
                {cue.kind === 'zone' && cue.zone === 'toggle' && (cue.playing
                    ? <Pause size={26} strokeWidth={2.2} />
                    : <Play size={26} strokeWidth={2.2} />)}
                {/* 长按待命：空心圆环，表示「按住成功了，现在可以滑」 */}
                {cue.kind === 'armed' && <Circle size={26} strokeWidth={2.2} />}
                {cue.kind === 'slide' && cue.direction === 'left' && <Command size={24} strokeWidth={2.2} />}
                {cue.kind === 'slide' && cue.direction === 'right' && <ListMusic size={24} strokeWidth={2.2} />}
            </motion.div>
        )}
    </AnimatePresence>
);

export default PlayerDoubleTapFeedback;
