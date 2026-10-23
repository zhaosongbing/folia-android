import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { formatWorldTransform, snapToDevicePixel, type WallView, type WallViewCenter } from '../../../components/wall/wallView';
import { computeBravaisFrame, posterSafeArea, withTilt } from './bravaisFrame';

// src/library/suites/bravais/useBravaisFrame.ts
// stage 每帧要写的那几样（相机、缝的锚点与动画中的开口、缝内容的排版宽度、是否折叠）放在一个可变的 ref 里，
// 相机与缝的动画只改它再调 renderFrame：直接写两个世界层的 transform、缝的位置与宽度、缝内容的透明度、
// 边缘标签的显隐与侧别，不经过 React（frontend-runtime-guardrails：拖动、补间期间没有逐帧 setState）。

export type BravaisFrameState = {
    view: WallView | null;
    center: WallViewCenter;
    anchorX: number | null;
    openWidth: number;
    /** 开口正在补间去的宽度（不补间时等于 openWidth）：开口张开途中给聚焦卡的相机让位按张开后的缝算。 */
    targetOpenWidth: number;
    contentWidth: number;
    hidden: boolean;
    /** 歌手海报：开口贴着视口边也不收窄（bravaisFrame 的 poster）。 */
    poster: boolean;
    /** 整层此刻的倾斜角（度；补间中逐帧变）。 */
    tiltDeg: number;
};

export type BravaisFrameRefs = {
    left: RefObject<HTMLDivElement | null>;
    right: RefObject<HTMLDivElement | null>;
    seam: RefObject<HTMLDivElement | null>;
    seamContent: RefObject<HTMLDivElement | null>;
    tab: RefObject<HTMLButtonElement | null>;
};

export const useBravaisFrame = (refs: BravaisFrameRefs) => {
    const stateRef = useRef<BravaisFrameState>({
        view: null,
        center: { x: 0, y: 0 },
        anchorX: null,
        openWidth: 0,
        targetOpenWidth: 0,
        contentWidth: 0,
        hidden: false,
        poster: false,
        tiltDeg: 0,
    });
    /**
     * 上一次写进 DOM 的那几个值。拖动时一帧一帧地重画，绝大多数帧里缝的宽度与位置其实没变
     * （相机在动、缝在世界里没动），重复写同样的 transform 只是白白让浏览器重新解析一遍样式。
     */
    const writtenRef = useRef({ left: '', right: '', seam: '', width: '' });
    /** 缝正在动（宽度或位置刚变过）：停下来 140ms 之后清掉。 */
    const movingTimerRef = useRef<number | null>(null);

    useEffect(() => () => {
        if (movingTimerRef.current !== null) window.clearTimeout(movingTimerRef.current);
    }, []);

    const renderFrame = useCallback(() => {
        const state = stateRef.current;
        if (!state.view) return;
        const frame = computeBravaisFrame({
            center: state.center,
            view: state.view,
            anchorX: state.anchorX,
            openWidth: state.openWidth,
            contentWidth: state.contentWidth,
            hidden: state.hidden,
            poster: state.poster,
            tiltDeg: state.tiltDeg,
        });
        const { left, right, seam, seamContent, tab } = refs;
        const written = writtenRef.current;
        const leftTransform = withTilt(formatWorldTransform(frame.left.x, frame.left.y, frame.scale), frame.tilt);
        if (left.current && written.left !== leftTransform) {
            left.current.style.transform = leftTransform;
            written.left = leftTransform;
        }
        const rightTransform = withTilt(formatWorldTransform(frame.right.x, frame.right.y, frame.scale), frame.tilt);
        if (right.current && written.right !== rightTransform) {
            right.current.style.transform = rightTransform;
            written.right = rightTransform;
        }
        const seamElement = seam.current;
        if (seamElement) {
            // 缝与两半墙同一层：倾斜时一起转（缝的 transform-origin 对准屏幕原点，见 bravais.css / bravaisPoster.css）。
            // 位移与宽度都吸附到整设备像素，理由与世界层同一份（wallView 的 snapToDevicePixel）：
            // 缝里的文字与列表本来就在小数位移下每帧重新栅格化，看着就是发虚、偶尔闪一下。
            const seamShift = snapToDevicePixel(frame.seam.x - frame.seam.width / 2);
            const seamTransform = withTilt(`translate3d(${seamShift}px, 0, 0)`, frame.tilt);
            const seamWidth = `${Math.max(0, snapToDevicePixel(frame.seam.width))}px`;
            const seamMoving = written.seam !== seamTransform || written.width !== seamWidth;
            if (seamMoving) {
                if (written.seam !== seamTransform) {
                    seamElement.style.transform = seamTransform;
                    written.seam = seamTransform;
                }
                if (written.width !== seamWidth) {
                    seamElement.style.width = seamWidth;
                    written.width = seamWidth;
                }
                // 缝在变尺寸/位置时先不画它的 backdrop-filter（见 bravais.css 里那条规则）：18px 的高斯模糊
                // 每帧都要按新尺寸重采一次背后的画面，Android 的 WebView 顶不住，看起来就是拖动时偶尔闪、抖。
                seamElement.dataset.bravaisMoving = '1';
                if (movingTimerRef.current !== null) window.clearTimeout(movingTimerRef.current);
                movingTimerRef.current = window.setTimeout(() => {
                    movingTimerRef.current = null;
                    if (seamElement.dataset.bravaisMoving) delete seamElement.dataset.bravaisMoving;
                }, 140);
            }
            const visibility = frame.seam.visible ? 'visible' : 'hidden';
            if (seamElement.style.visibility !== visibility) seamElement.style.visibility = visibility;
        }
        const contentElement = seamContent.current;
        if (contentElement) {
            contentElement.style.opacity = String(frame.contentOpacity);
            // 海报跟着倾斜时四个角会转出屏幕：内容缩进安全区（posterSafeArea，按落定的海报宽度算，拖动时不变）。
            const safe = state.poster
                ? posterSafeArea({ width: state.targetOpenWidth, height: state.view.height, deg: frame.tilt.deg })
                : { scale: 1, offsetY: 0 };
            contentElement.style.setProperty('--bravais-poster-safe-scale', safe.scale.toFixed(4));
            contentElement.style.setProperty('--bravais-poster-safe-y', `${safe.offsetY.toFixed(1)}px`);
        }
        const tabElement = tab.current;
        if (tabElement) {
            const display = frame.tab.visible ? '' : 'none';
            if (tabElement.style.display !== display) tabElement.style.display = display;
            if (tabElement.dataset.side !== frame.tab.side) tabElement.dataset.side = frame.tab.side;
        }
    }, [refs]);

    return { stateRef, renderFrame };
};
