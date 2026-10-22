// src/components/app/playback/usePlayerLongPressGesture.ts
// 把 longPressGesture.ts 的判定接到播放页根层的 pointer 事件上。
//
// 手势分三档（长按成立是后两档的前提，fix10 起长按本身不再直接打开任何东西）：
//   1. 按住不动                → onArmed：在落点浮现一个可滑的按钮，等用户决定
//   2. 按住后向左滑过阈值      → onSlideLeft：打开命令面板
//   3. 按住后向右滑过阈值      → onSlideRight：在落点打开播放列表
// 松手时如果一次都没滑成（onCancel），调用方把那个浮现的按钮收掉，不执行任何动作。
//
// 为什么长按成立时只浮现按钮、不立即打开列表：立即打开的话，用户接着向左滑
// 就会出现「播放列表和命令面板同时开着」，两个浮层互相打架。等一拍做判定，
// 同一次长按只会落在一个动作上。
//
// 与双击手势（usePlayerDoubleTapGesture）共用同一层 surface，两者的分工：
// - 双击走「两次快速点击」，长按走「按住不动 450ms」；
// - 长按在 pointerdown 时若发现自己在双击序列里（距上次按下 < 500ms）就不启动，
//   所以双击永远不会误弹出播放列表；
// - 长按一旦触发（fired），随后的 pointerup 会产生一次 click —— 播放页根层的
//   onClick 是「点空白关闭面板」，不吞掉它就会刚弹出列表又立刻关上，所以这里
//   用和双击同一套 capture 阶段吞 click 的办法。

import { useCallback, useEffect, useRef } from 'react';
import { isTapMovement } from './doubleTapGesture';
import { LONG_PRESS_DURATION_MS, resolveLongPressSlide, shouldStartLongPressOnDown } from './longPressGesture';

export type PlayerLongPressHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
    /** 透出滑动回调，方便调用方在不重包 hook 的情况下追加自己的反馈逻辑 */
    onSlideLeft?: (clientX: number, clientY: number) => void;
    onSlideRight?: (clientX: number, clientY: number) => void;
};

type UsePlayerLongPressGestureOptions = {
    enabled: boolean;
    /** 长按成立后一次都没滑成，松手时调用：调用方此时应收起浮现的按钮 */
    onCancel: () => void;
    /** 长按成立后向左滑：打开命令面板 */
    onSlideLeft?: (clientX: number, clientY: number) => void;
    /** 长按成立后向右滑：打开播放列表 */
    onSlideRight?: (clientX: number, clientY: number) => void;
    /** 长按刚成立（还没滑）：把落点交给调用方去浮出滑轨 */
    onArmed?: (clientX: number, clientY: number) => void;
    /** 待命期间每次移动都会回调当前水平位移，滑轨据此跟手（传 MotionValue.set 即可，不必 setState） */
    onSlideProgress?: (deltaX: number) => void;
};

/** 吞掉一次 click 的有效期：超过还没等到 click 就自动失效，避免吞掉用户后面真正的单击 */
const SWALLOW_CLICK_WINDOW_MS = 400;

export const usePlayerLongPressGesture = ({
    enabled,
    onCancel,
    onSlideLeft,
    onSlideRight,
    onArmed,
    onSlideProgress,
}: UsePlayerLongPressGestureOptions): PlayerLongPressHandlers => {
    const lastDownAtRef = useRef<number | null>(null);
    const timerRef = useRef<number | null>(null);
    const downRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
    const firedRef = useRef(false);
    /** 长按成立后是否已经滑出过一次手势：一次长按只认一个方向 */
    const slideTriggeredRef = useRef(false);
    const swallowClickRef = useRef(false);
    const swallowTimerRef = useRef<number | null>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const clearSwallowTimer = useCallback(() => {
        if (swallowTimerRef.current !== null) {
            window.clearTimeout(swallowTimerRef.current);
            swallowTimerRef.current = null;
        }
    }, []);

    useEffect(() => () => {
        clearTimer();
        clearSwallowTimer();
    }, [clearTimer, clearSwallowTimer]);

    // 关掉开关时把半截状态清干净，否则再打开时会拿旧的按下时间去避让
    useEffect(() => {
        if (enabled) return;
        lastDownAtRef.current = null;
        downRef.current = null;
        firedRef.current = false;
        slideTriggeredRef.current = false;
        clearTimer();
        swallowClickRef.current = false;
        clearSwallowTimer();
    }, [enabled, clearTimer, clearSwallowTimer]);

    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!enabled) return;
        if (!event.isPrimary) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        const now = event.timeStamp;
        const previousDownAt = lastDownAtRef.current;
        lastDownAtRef.current = now;

        // 双击序列里不启动长按：否则双击切歌会先弹一次播放列表
        if (!shouldStartLongPressOnDown(previousDownAt, now)) {
            downRef.current = null;
            clearTimer();
            return;
        }

        downRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        firedRef.current = false;
        slideTriggeredRef.current = false;
        clearTimer();

        // 把指针捕获到这个节点上：手指移动时 target 会变（滑轨、图标、别的浮层都在播放下方），
        // 不捕获的话 pointermove 会改派给新 target、pointerup 也可能落在别处，
        // 表现就是「滑轨亮了但滑不动、松手也不收」。
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // 老 WebView 可能不支持，捕获失败不影响后续判定
        }
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            const down = downRef.current;
            if (!down) return;
            firedRef.current = true;
            // 只进入 armed 状态，动作等 pointerup（不滑）或 pointermove（滑）时再落
            onArmed?.(down.x, down.y);
        }, LONG_PRESS_DURATION_MS);
    }, [clearTimer, enabled, onArmed]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const down = downRef.current;
        if (!down || down.pointerId !== event.pointerId) return;

        // 长按还没成立：位移超过单击容差就是拖拽/滑动，长按作废（口径和单击同一个常量）
        if (!firedRef.current) {
            if (!isTapMovement(down, { x: event.clientX, y: event.clientY })) {
                downRef.current = null;
                clearTimer();
            }
            return;
        }

        // 长按已成立：先把位移报给滑轨（跟手），再判方向
        if (slideTriggeredRef.current) return;
        onSlideProgress?.(event.clientX - down.x);
        const direction = resolveLongPressSlide(event.clientX - down.x, event.clientY - down.y);
        if (!direction) return;

        slideTriggeredRef.current = true;
        clearTimer();
        if (direction === 'left') {
            onSlideLeft?.(down.x, down.y);
        } else {
            onSlideRight?.(down.x, down.y);
        }
    }, [clearTimer, onSlideLeft, onSlideProgress, onSlideRight]);

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const down = downRef.current;
        const fired = firedRef.current;
        const slid = slideTriggeredRef.current;
        downRef.current = null;
        firedRef.current = false;
        slideTriggeredRef.current = false;
        clearTimer();
        if (!enabled || !down || down.pointerId !== event.pointerId || !fired) return;

        // 长按成立过（滑动了或者原地松手）：吞掉这次 click。
        // 滑动的那次在 move 里已经执行了动作，松手的这次才打开播放列表。
        swallowClickRef.current = true;
        clearSwallowTimer();
        swallowTimerRef.current = window.setTimeout(() => {
            swallowClickRef.current = false;
            swallowTimerRef.current = null;
        }, SWALLOW_CLICK_WINDOW_MS);

        // 没滑成：这一次长按就此作废，由调用方收起浮现的按钮
        if (!slid) {
            onCancel();
        }
    }, [clearTimer, clearSwallowTimer, enabled, onCancel]);

    // pointercancel 必须也走 onCancel：长按成立后系统可能因为页面滚动、手势识别、
    // 来电等原因取消这个指针，此后不会再有任何 pointerup —— 不在这里收尾，
    // 滑轨就会永远留在屏幕上，而且滑不动（因为后续 move 也不来了）。
    const handlePointerCancel = useCallback(() => {
        const wasFired = firedRef.current;
        downRef.current = null;
        firedRef.current = false;
        slideTriggeredRef.current = false;
        clearTimer();
        if (wasFired) onCancel();
    }, [clearTimer, onCancel]);

    const handleClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
        if (!swallowClickRef.current) return;
        swallowClickRef.current = false;
        clearSwallowTimer();
        event.stopPropagation();
        event.preventDefault();
    }, [clearSwallowTimer]);

    return {
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerUp,
        onPointerCancel: handlePointerCancel,
        onClickCapture: handleClickCapture,
        onSlideLeft,
        onSlideRight,
    };
};
