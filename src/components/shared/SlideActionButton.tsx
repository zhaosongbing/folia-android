import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

// src/components/shared/SlideActionButton.tsx
// The player-style round action button with a second action on a slide: tap the button for
// the primary action, or drag it along its track to reach the one waiting at the far end.
//
// Lifted out of GridListSearchButton so the poster wall could carry the same control. Only the
// mechanics live here — the gesture, the track and the drag feedback. Where the button sits, what
// its two ends do and how the destination is chosen stay with each caller, because those are the
// parts that genuinely differ between a grid and the wall.
//
// 滑轨方向可换（实测反馈：工具按钮的滑轨要能改成上下左右）：轨道往哪边伸、按钮贴容器的哪条边、
// 填充条从哪边往哪边长、手势看 X 还是 Y、触发动画往哪个方向飞 —— 全部由 direction 推出来，
// 不再写死「向左」。

/** How far the button must travel before the slide fires, and how far it can be dragged at all. */
const TRIGGER_DISTANCE = 36;
const MAX_DRAG = 44;

/** 轨道伸出去的方向。按钮总在轨道靠容器的那一端，远端是滑动的目的地。 */
export type SlideDirection = 'left' | 'right' | 'up' | 'down';

type SlideGeometry = {
    /** 轨道（长两格）的绝对定位与尺寸。 */
    track: React.CSSProperties;
    /** 按钮贴住容器的那条边。 */
    button: React.CSSProperties;
    /** 填充条：锚在按钮那一端，尺寸由拖动量决定。 */
    fill: React.CSSProperties;
    /** 轨道远端的图标与它的浮动方向。 */
    iconFloat: { x: number[]; y: number[] } | null;
    /** 手势主轴。 */
    axis: 'x' | 'y';
    /** 主轴上的正向：左 / 上为 -1，右 / 下为 +1。 */
    sign: 1 | -1;
};

const resolveGeometry = (direction: SlideDirection, sizePx: number): SlideGeometry => {
    const long = sizePx * 2;
    switch (direction) {
        case 'right':
            return {
                track: { left: 0, top: 0, width: long, height: sizePx },
                button: { left: 0, top: 0 },
                fill: { left: 0, top: 0, bottom: 0, width: sizePx },
                iconFloat: { x: [0, 4, 0], y: [0, 0, 0] },
                axis: 'x',
                sign: 1,
            };
        case 'up':
            return {
                track: { left: 0, bottom: 0, width: sizePx, height: long },
                button: { left: 0, bottom: 0 },
                fill: { left: 0, right: 0, bottom: 0, height: sizePx },
                iconFloat: { x: [0, 0, 0], y: [0, -4, 0] },
                axis: 'y',
                sign: -1,
            };
        case 'down':
            return {
                track: { left: 0, top: 0, width: sizePx, height: long },
                button: { left: 0, top: 0 },
                fill: { left: 0, right: 0, top: 0, height: sizePx },
                iconFloat: { x: [0, 0, 0], y: [0, 4, 0] },
                axis: 'y',
                sign: 1,
            };
        case 'left':
        default:
            return {
                track: { right: 0, top: 0, width: long, height: sizePx },
                button: { right: 0, top: 0 },
                fill: { right: 0, top: 0, bottom: 0, width: sizePx },
                iconFloat: { x: [0, -4, 0], y: [0, 0, 0] },
                axis: 'x',
                sign: -1,
            };
    }
};

export interface SlideActionButtonProps {
    icon: LucideIcon;
    /** Tooltip for the button itself, naming what a tap does. */
    title: string;
    onActivate: () => void;
    slideIcon: LucideIcon;
    /** Tooltip at the far end of the track, naming where the slide goes. */
    slideTitle: string;
    onSlide: () => void;
    isDaylight: boolean;
    accentColor: string;
    /** 拖满时按钮变成强调色底，上面图标的颜色（缺省白色；强调色可能本身就很浅，例如墙面工具按钮读 --text-on-accent）。 */
    accentForeground?: string;
    disabled?: boolean;
    /**
     * 按钮直径（px）。缺省 48，与改动前一致。
     * 轨道宽度、填充宽度、图标都按它等比缩放 —— 只改容器会让轨道和按钮对不上。
     */
    sizePx?: number;
    /**
     * 不「探头」：不自带 translate-x-1/2 与淡出，整颗按钮待在自己的盒子里。
     *
     * 默认行为是「半个身子缩在下面那颗按钮后面，悬停才滑出来」—— 那是给网格右下角
     * 那种叠在动作按钮上方的次级按钮用的。墙面右下角的工具按钮是独立的一颗，
     * 套用这套平移会让它溢出屏幕右边几个像素（也点不准），编辑态量的是容器盒子，
     * 于是虚线框与按钮错开半个身位。
     */
    noPeek?: boolean;
    /** 滑轨往哪边伸。缺省 left，与改动前一致。 */
    direction?: SlideDirection;
}

export const SlideActionButton: React.FC<SlideActionButtonProps> = ({
    icon: Icon,
    title,
    onActivate,
    slideIcon: SlideIcon,
    slideTitle,
    onSlide,
    isDaylight,
    accentColor,
    sizePx = 48,
    accentForeground = '#ffffff',
    disabled = false,
    noPeek = false,
    direction = 'left',
}) => {
    const [showGuideLine, setShowGuideLine] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const gestureRef = useRef<{ startX: number; startY: number; triggered: boolean } | null>(null);
    const suppressClickRef = useRef(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const trackEndIconRef = useRef<HTMLDivElement>(null);
    const trackFillRef = useRef<HTMLDivElement>(null);
    const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const geometry = resolveGeometry(direction, sizePx);
    // 探头只在水平方向成立（它是「缩在下面那颗按钮后面」），竖直方向一律不探头。
    const canPeek = !noPeek && (direction === 'left' || direction === 'right');
    const motionClass = showGuideLine || isDragging
        ? 'translate-x-0 opacity-100'
        : canPeek
            ? (direction === 'right'
                // 向右伸的轨道，按钮贴左缘：探头方向反过来。
                ? 'translate-x-[-50%] opacity-60 group-hover:translate-x-0 group-hover:opacity-100 md:translate-x-0 md:opacity-100'
                : 'translate-x-1/2 opacity-60 group-hover:translate-x-0 group-hover:opacity-100 md:translate-x-0 md:opacity-100 md:hover:scale-105')
            : 'translate-x-0 opacity-100';

    const setDestinationFeedback = (progress: number) => {
        const icon = trackEndIconRef.current;
        if (!icon) return;
        icon.style.opacity = String(0.35 + progress * 0.65);
        icon.style.transform = `scale(${1 + progress * 0.15}) rotate(${progress * 45}deg)`;
        icon.style.color = progress >= 1 ? accentColor : '';
    };

    const resetDestinationFeedback = () => {
        const icon = trackEndIconRef.current;
        if (!icon) return;
        icon.style.transition = 'opacity 150ms ease-out, transform 150ms ease-out, color 150ms ease-out';
        icon.style.opacity = '0.35';
        icon.style.transform = 'scale(1) rotate(0deg)';
        icon.style.color = '';
    };

    /** 把这次的拖动距离换成「沿主轴、朝滑动方向」的位移量（0..MAX_DRAG）。 */
    const travelOf = (primary: number) => Math.max(0, Math.min(MAX_DRAG, primary * geometry.sign));

    const setDragFeedback = (primary: number) => {
        const button = buttonRef.current;
        if (!button) return;
        const travel = travelOf(primary);
        const offset = travel * geometry.sign;
        const progress = Math.min(1, travel / TRIGGER_DISTANCE);
        button.style.transition = 'none';
        button.style.transform = geometry.axis === 'x' ? `translateX(${offset}px)` : `translateY(${offset}px)`;
        button.style.filter = `brightness(${1 + progress * 0.18})`;
        const primaryIcon = button.querySelector('svg');
        if (primaryIcon) {
            primaryIcon.style.transform = `rotate(${progress * -180}deg)`;
            primaryIcon.style.scale = String(1 - progress * 0.1);
        }
        if (progress >= 1) {
            button.style.backgroundColor = accentColor;
            button.style.color = accentForeground;
            button.style.boxShadow = `0 0 16px ${accentColor}66, 0 18px 42px rgba(0, 0, 0, ${0.24 + progress * 0.16})`;
        } else {
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.boxShadow = `0 18px 42px rgba(0, 0, 0, ${0.24 + progress * 0.16})`;
        }
        const fill = trackFillRef.current;
        if (fill) {
            fill.style.transition = 'none';
            // 填充条从按钮那一端往远端长：横向改宽度、纵向改高度。
            if (geometry.axis === 'x') {
                fill.style.width = `${sizePx + travel}px`;
            } else {
                fill.style.height = `${sizePx + travel}px`;
            }
            fill.style.backgroundColor = progress >= 1 ? accentColor : '';
            fill.style.opacity = progress >= 1 ? '0.35' : '';
        }
        if (trackEndIconRef.current) trackEndIconRef.current.style.transition = 'none';
        setDestinationFeedback(progress);
    };

    const resetDragFeedback = (mode: 'release' | 'trigger' = 'release', primary = 0) => {
        setIsDragging(false);
        const button = buttonRef.current;
        if (!button) return;
        const travel = travelOf(primary);
        const offset = travel * geometry.sign;
        const fill = trackFillRef.current;
        const destination = trackEndIconRef.current;
        const along = geometry.axis === 'x' ? 'translateX' : 'translateY';
        if (mode === 'trigger') {
            button.animate([
                { transform: `${along}(${offset}px) scale(1)`, opacity: '1', filter: 'brightness(1.18)' },
                { transform: `${along}(${offset + 44 * geometry.sign}px) scale(0.8)`, opacity: '0' },
            ], { duration: 250, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
            destination?.animate([
                { transform: 'scale(1.15) rotate(45deg)', opacity: '1' },
                { transform: `translate${geometry.axis === 'x' ? 'X' : 'Y'}(${30 * geometry.sign}px) scale(0.9) rotate(45deg)`, opacity: '0' },
            ], { duration: 250, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
            if (fill) {
                const from = sizePx + travel;
                const to = sizePx * 2;
                fill.animate(
                    geometry.axis === 'x'
                        ? [{ width: `${from}px`, opacity: '0.35' }, { width: `${to}px`, opacity: '0' }]
                        : [{ height: `${from}px`, opacity: '0.35' }, { height: `${to}px`, opacity: '0' }],
                    { duration: 250, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
                );
            }
        }
        resetDestinationFeedback();
        button.style.transition = mode === 'release' ? 'transform 160ms ease-out, filter 160ms ease-out, box-shadow 160ms ease-out, background-color 160ms ease-out, color 160ms ease-out' : '';
        button.style.transform = '';
        button.style.filter = '';
        button.style.boxShadow = '';
        button.style.backgroundColor = '';
        button.style.color = '';
        const primaryIcon = button.querySelector('svg');
        if (primaryIcon) {
            primaryIcon.style.transition = '';
            primaryIcon.style.transform = '';
            primaryIcon.style.scale = '';
        }
        if (fill) {
            fill.style.transition = '';
            if (geometry.axis === 'x') {
                fill.style.width = `${sizePx}px`;
                fill.style.height = '';
            } else {
                fill.style.height = `${sizePx}px`;
                fill.style.width = '';
            }
            fill.style.backgroundColor = '';
            fill.style.opacity = '';
        }
    };

    const clearGesture = () => {
        gestureRef.current = null;
        resetDragFeedback();
    };

    /** 轨道远端图标的位置：贴着轨道远端那一头居中。 */
    const iconPositionClass = (() => {
        switch (direction) {
            case 'right': return 'right-3.5 top-1/2 -translate-y-1/2';
            case 'up': return 'top-3.5 left-1/2 -translate-x-1/2';
            case 'down': return 'bottom-3.5 left-1/2 -translate-x-1/2';
            case 'left':
            default: return 'left-3.5 top-1/2 -translate-y-1/2';
        }
    })();

    return (
        <div
            className={`relative transition-all duration-300 transform ${motionClass}`}
            style={{ width: sizePx, height: sizePx }}
        >
            <div
                style={{ ...geometry.track, transition: 'opacity 200ms ease-out' }}
                className={`absolute rounded-full border pointer-events-none z-0 ${showGuideLine || isDragging ? 'opacity-100' : 'opacity-0'} ${isDaylight ? 'border-black/10 bg-black/5' : 'border-white/10 bg-white/5'}`}
            >
                <div
                    ref={trackFillRef}
                    style={geometry.fill}
                    className={`absolute rounded-full pointer-events-none ${isDaylight ? 'bg-black/10' : 'bg-white/10'}`}
                />
                <motion.div
                    className={`absolute w-3.5 h-3.5 pointer-events-none flex items-center justify-center ${iconPositionClass}`}
                    animate={showGuideLine && geometry.iconFloat
                        ? { x: geometry.iconFloat.x, y: geometry.iconFloat.y, opacity: [0.45, 0.85, 0.45] }
                        : { x: 0, y: 0, opacity: 0.45 }}
                    transition={showGuideLine ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : undefined}
                >
                    <div ref={trackEndIconRef} style={{ color: isDaylight ? '#000000' : '#ffffff' }} className="w-full h-full flex items-center justify-center" title={slideTitle}>
                        <SlideIcon size={14} />
                    </div>
                </motion.div>
            </div>
            <button
                ref={buttonRef}
                type="button"
                disabled={disabled}
                onPointerDown={(event) => {
                    if (disabled) return;
                    gestureRef.current = { startX: event.clientX, startY: event.clientY, triggered: false };
                    suppressClickRef.current = false;
                    setShowGuideLine(false);
                    setIsDragging(true);
                    setDragFeedback(0);
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={(event) => {
                    const gesture = gestureRef.current;
                    if (!gesture || gesture.triggered) return;
                    const deltaX = event.clientX - gesture.startX;
                    const deltaY = event.clientY - gesture.startY;
                    const primary = geometry.axis === 'x' ? deltaX : deltaY;
                    const secondary = geometry.axis === 'x' ? deltaY : deltaX;
                    setDragFeedback(primary);
                    // 主轴走够距离、且明确压过副轴，才算滑到位（斜着划不会误触）。
                    if (primary * geometry.sign >= TRIGGER_DISTANCE && Math.abs(primary) > Math.abs(secondary) * 1.2) {
                        gesture.triggered = true;
                        suppressClickRef.current = true;
                        event.preventDefault();
                        resetDragFeedback('trigger', primary);
                        onSlide();
                    }
                }}
                onPointerUp={clearGesture}
                onPointerCancel={clearGesture}
                onMouseEnter={() => { if (supportsHover) setShowGuideLine(true); }}
                onMouseLeave={() => { if (supportsHover) setShowGuideLine(false); }}
                onClick={(event) => {
                    if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                    onActivate();
                }}
                style={{ touchAction: 'none', width: sizePx, height: sizePx, ...geometry.button }}
                className={`rounded-full flex items-center justify-center transition-all duration-300 shadow-lg backdrop-blur-md transform border-none absolute z-10 disabled:opacity-40 disabled:cursor-default ${isDaylight ? 'bg-white/70 text-zinc-900' : 'bg-black/40 text-white'}`}
                title={title}
                aria-label={title}
            >
                <Icon size={Math.round((20 * sizePx) / 48)} />
            </button>
        </div>
    );
};
