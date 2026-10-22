// src/components/app/playback/usePlayerDoubleTapGesture.ts
// 把 doubleTapGesture.ts 的纯判定接到播放页根层的 pointer 事件上。
//
// 冲突处理（每条都对应播放页上真实存在的交互）：
// - 拖拽：按下到抬起的位移超过 TAP_MOVE_SLOP_PX 就不算点击，所以底部胶囊拖拽、
//   Monet 肖像拖拽不会被误判成双击。
// - 子元素已有交互（歌词行 seek、返回按钮、胶囊按钮）都自己 stopPropagation，
//   事件不会冒到根层，本 hook 收不到，天然不冲突。
// - 根层原有的 onClick（点空白关闭右侧面板）：双击的第二次 click 在这里被吞掉，
//   避免「双击暂停」之外再关一次面板。第一次 click 无法阻止——它在第二次按下之前
//   就已经发生了，这是浏览器事件模型的固有限制，不是可以绕过去的东西。
// - 全局 pointerdown 唤回控制栏（usePlayerChromeAutoHide）保持原状：双击时控制栏
//   出现是合理反馈，不属于需要压制的副作用。

import { useCallback, useEffect, useRef } from 'react';
import {
    isTapMovement,
    registerTap,
    zoneAtPoint,
    type DoubleTapZone,
    type TapRecord,
} from './doubleTapGesture';

export type PlayerDoubleTapHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
};

type UsePlayerDoubleTapGestureOptions = {
    /** 设置里的总开关；关掉时既不累积状态也不动作 */
    enabled: boolean;
    onPrev: () => void;
    onNext: () => void;
    onToggle: () => void;
    /** 区域反馈（图标提示），在动作之前调用，带上落点坐标 */
    onFeedback?: (zone: DoubleTapZone, clientX: number, clientY: number) => void;
};

/** 吞掉一次 click 的有效期：超过这个时间还没等到 click 就自动失效，避免吞掉用户后面真正的单击 */
const SWALLOW_CLICK_WINDOW_MS = 400;

export const usePlayerDoubleTapGesture = ({
    enabled,
    onPrev,
    onNext,
    onToggle,
    onFeedback,
}: UsePlayerDoubleTapGestureOptions): PlayerDoubleTapHandlers => {
    const lastTapRef = useRef<TapRecord | null>(null);
    const downRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
    const swallowClickRef = useRef(false);
    const swallowTimerRef = useRef<number | null>(null);

    const clearSwallowTimer = useCallback(() => {
        if (swallowTimerRef.current !== null) {
            window.clearTimeout(swallowTimerRef.current);
            swallowTimerRef.current = null;
        }
    }, []);

    useEffect(() => () => {
        clearSwallowTimer();
    }, [clearSwallowTimer]);

    // 开关关掉时把半截状态清干净：否则关掉再打开，会拿旧的第一次点击去凑双击。
    useEffect(() => {
        if (enabled) return;
        lastTapRef.current = null;
        downRef.current = null;
        swallowClickRef.current = false;
        clearSwallowTimer();
    }, [enabled, clearSwallowTimer]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!enabled) return;
        // 多指的第二根手指、鼠标右键/中键都不参与
        if (!event.isPrimary) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        downRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    }, [enabled]);

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const down = downRef.current;
        downRef.current = null;
        if (!enabled || !down || down.pointerId !== event.pointerId) return;
        // 位移过大 = 拖拽，不参与双击计数
        if (!isTapMovement(down, { x: event.clientX, y: event.clientY })) {
            lastTapRef.current = null;
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const zone = zoneAtPoint(event.clientX, rect);
        const result = registerTap(lastTapRef.current, {
            time: event.timeStamp,
            x: event.clientX,
            y: event.clientY,
            zone,
        });
        lastTapRef.current = result.next;
        if (!result.triggered) return;

        // 双击成立：吞掉紧接着的这次 click，然后按区域执行动作
        swallowClickRef.current = true;
        clearSwallowTimer();
        swallowTimerRef.current = window.setTimeout(() => {
            swallowClickRef.current = false;
            swallowTimerRef.current = null;
        }, SWALLOW_CLICK_WINDOW_MS);

        onFeedback?.(result.zone, event.clientX, event.clientY);
        if (result.zone === 'prev') {
            onPrev();
        } else if (result.zone === 'next') {
            onNext();
        } else {
            onToggle();
        }
    }, [clearSwallowTimer, enabled, onFeedback, onNext, onPrev, onToggle]);

    const handlePointerCancel = useCallback(() => {
        downRef.current = null;
    }, []);

    const handleClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
        if (!swallowClickRef.current) return;
        swallowClickRef.current = false;
        clearSwallowTimer();
        // capture 阶段拦住，根层 onClick 与它上面任何冒泡处理器都不会跑
        event.stopPropagation();
        event.preventDefault();
    }, [clearSwallowTimer]);

    return {
        onPointerDown: handlePointerDown,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onClickCapture: handleClickCapture,
    };
};
