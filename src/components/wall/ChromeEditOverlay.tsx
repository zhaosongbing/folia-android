// src/components/wall/ChromeEditOverlay.tsx
// 浮层位置的手动调整层：开启「拖动调整位置」后，在四颗可调按钮与信息条上下两部分外面画一个虚线框，
// 拖框体改位置、拖右下角手柄改大小。
//
// 为什么用覆盖层而不是给每个按钮包一层 wrapper：这些控件分散在四五个组件里，
// 各自的定位方式还不一样（absolute、relative、flex item），包 wrapper 会改 DOM 结构，
// 很容易把 .lattice-tools 的 has-above 弹性布局、或者 seam 的 overflow 裁切弄坏。
// 覆盖层只读位置、不改结构，退出编辑态就整体消失，不影响正常使用。
//
// 与播放页控制栏的定位模式同一套交互：按下记录起点 → setPointerCapture → 移动只写 store →
// 松手结束。位移是相对位移，控件此刻在哪不影响计算。
//
// 跟手（实测反馈「不顺畅、不跟手」的三处修法）：
// 1) 手柄上 touch-action:none —— 触屏上不写这个，浏览器的滚动手势会抢走指针，
//    拖动被原生滚动打断（墙本身还是可拖的无限拼贴，更容易抢）。
// 2) 拖动中立刻把框体挪到算好的位置，不等下一帧测量 —— 测量是 rAF 驱动的，
//    只写 store 会让框体晚一帧才跟上手指。
// 3) 框体上的过渡只留颜色（transition-colors），不碰位置属性。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useWallChromeOffsetStore,
    WALL_CHROME_SCALE_MAX_PERCENT,
    WALL_CHROME_SCALE_MIN_PERCENT,
    type WallChromeOffsetTarget,
    type WallChromeSizeTarget,
} from '../../stores/useWallChromeOffsetStore';

/** 一颗可编辑的浮层：找控件的选择器、它改哪一组偏移、哪一组大小。 */
type ChromeEditEntry = {
    id: string;
    /**
     * 控件的选择器；匹配不到就跳过（那颗没在渲染）。可以写多个（逗号分隔），
     * 取文档顺序里第一个 —— 缝在翻牌时新旧两套内容会同时存在一瞬，取旧的也无妨，
     * 下一帧测量就换过来了。
     */
    selector: string;
    offsetTarget: WallChromeOffsetTarget;
    /** 有大小可调的才写；信息条上下两部分只挪不缩放。 */
    sizeTarget?: WallChromeSizeTarget;
    labelKey: string;
};

const ENTRIES: readonly ChromeEditEntry[] = [
    { id: 'wallBack', selector: '.lattice-back, .folia-player-back', offsetTarget: 'wallBack', sizeTarget: 'wallBack', labelKey: 'options.wallBackOffsetX' },
    { id: 'wallLocate', selector: '[data-grid-locate]', offsetTarget: 'wallLocate', sizeTarget: 'wallLocate', labelKey: 'options.wallLocateOffsetX' },
    { id: 'wallTools', selector: '.lattice-tools', offsetTarget: 'wallTools', sizeTarget: 'wallTools', labelKey: 'options.wallToolsOffsetX' },
    { id: 'ponder', selector: '[data-testid="page-ponder-touch-button"]', offsetTarget: 'ponder', sizeTarget: 'ponder', labelKey: 'options.ponderOffsetX' },
    // 信息条上部分：首页窄缝的 home-head、完整信息条 / 面板 / 海报页的 crumbs 是同一组设置（seamHead）。
    { id: 'seamHead', selector: '.bravais-seam-content .bravais-seam-home-head, .bravais-seam-content .bravais-seam-crumbs', offsetTarget: 'seamHead', labelKey: 'options.seamHeadOffsetX' },
    // 信息条下部分：首页的工具坞、完整信息条的动作行、海报页的底部是同一组设置（seamDock）。
    { id: 'seamDock', selector: '.bravais-seam-content .bravais-seam-dock, .bravais-seam-content .bravais-seam-actions, .bravais-seam-content .bravais-poster-bottom', offsetTarget: 'seamDock', labelKey: 'options.seamDockOffsetX' },
];

type Box = { id: string; left: number; top: number; width: number; height: number };

/** 拖动中的状态：拖哪一颗、起点指针位置、起点偏移 / 起点百分比。 */
type DragState = {
    entryId: string;
    kind: 'move' | 'size';
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    startScale: number;
    /** 按下时框体的矩形：位移按「新位置 - 这个矩形」算，才能把控件限制在屏幕内。 */
    startRect: { left: number; top: number; width: number; height: number };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ChromeEditOverlay: React.FC = () => {
    const { t } = useTranslation();
    const editMode = useWallChromeOffsetStore(state => state.chromeEditMode);
    const offsets = useWallChromeOffsetStore(state => state.offsets);
    const scale = useWallChromeOffsetStore(state => state.scale);
    const setOffset = useWallChromeOffsetStore(state => state.handleSetOffset);
    const setScale = useWallChromeOffsetStore(state => state.handleSetScale);

    const [boxes, setBoxes] = useState<Box[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const dragRef = useRef<DragState | null>(null);

    // 编辑态开启时持续测量这几颗控件的位置。用 rAF 而不是事件监听：
    // 位置变化的原因很多（别的动画、视口变化、播放状态、缝翻牌），逐条列会漏，
    // 而编辑态是临时的，一帧一次的 getBoundingClientRect 代价可以接受。
    useEffect(() => {
        if (!editMode) {
            setBoxes([]);
            return undefined;
        }
        let frame = 0;
        const measure = () => {
            const next: Box[] = [];
            for (const entry of ENTRIES) {
                const element = document.querySelector(entry.selector);
                if (!element) continue;
                const rect = element.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) continue;
                next.push({
                    id: entry.id,
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                });
            }
            setBoxes(previous => {
                // 位置没变就不换引用，避免每帧重渲染
                if (previous.length === next.length
                    && previous.every((box, index) => {
                        const other = next[index];
                        return box.id === other.id
                            && Math.abs(box.left - other.left) < 0.5
                            && Math.abs(box.top - other.top) < 0.5
                            && Math.abs(box.width - other.width) < 0.5
                            && Math.abs(box.height - other.height) < 0.5;
                    })) {
                    return previous;
                }
                return next;
            });
            frame = window.requestAnimationFrame(measure);
        };
        frame = window.requestAnimationFrame(measure);
        return () => window.cancelAnimationFrame(frame);
    }, [editMode, offsets, scale]);

    const entryById = useCallback((id: string) => ENTRIES.find(entry => entry.id === id), []);

    const startDrag = useCallback((
        event: React.PointerEvent<HTMLElement>,
        entryId: string,
        kind: 'move' | 'size',
    ) => {
        const entry = entryById(entryId);
        if (!entry) return;
        const offset = offsets[entry.offsetTarget];
        const rect = event.currentTarget.getBoundingClientRect();
        dragRef.current = {
            entryId,
            kind,
            startX: event.clientX,
            startY: event.clientY,
            startOffsetX: offset.x,
            startOffsetY: offset.y,
            startScale: scale,
            startRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        };
        setActiveId(entryId);
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
    }, [entryById, offsets, scale]);

    const onDragMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const drag = dragRef.current;
        if (!drag) return;
        const entry = entryById(drag.entryId);
        if (!entry) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (drag.kind === 'move') {
            // 先算框体要去的左上角，并把它按在视口内；再反推偏移量。
            // 这样控件可以被拖到屏幕内任意位置，但永远拖不出去 —— 拖过头会停在边缘。
            const maxLeft = Math.max(0, window.innerWidth - drag.startRect.width);
            const maxTop = Math.max(0, window.innerHeight - drag.startRect.height);
            const nextLeft = clamp(drag.startRect.left + dx, 0, maxLeft);
            const nextTop = clamp(drag.startRect.top + dy, 0, maxTop);
            const shiftX = Math.round(nextLeft - drag.startRect.left);
            const shiftY = Math.round(nextTop - drag.startRect.top);
            setOffset(entry.offsetTarget, 'x', drag.startOffsetX + shiftX);
            setOffset(entry.offsetTarget, 'y', drag.startOffsetY + shiftY);
            // 框体立刻跟上：不等下一帧测量（测量是 rAF 驱动的，只写 store 会晚一帧）。
            // nextLeft/nextTop 就是框体新的绝对位置（框体与控件位移相同，都是 shift），
            // 直接写绝对值 —— 不能按 shift 累加，同一手势里第二次 move 会叠加上一次的量。
            setBoxes(previous => previous.map(box => (
                box.id === drag.entryId
                    ? { ...box, left: nextLeft, top: nextTop }
                    : box
            )));
            return;
        }
        if (!entry.sizeTarget) return;
        // 缩放取横向与纵向的较大者：单手拖动时两个方向不可能都精确，
        // 取大的那个更符合「我在把它拉大」的直觉。四颗按钮共用这一档比例。
        const nextScale = clamp(
            drag.startScale + Math.max(dx, dy),
            WALL_CHROME_SCALE_MIN_PERCENT,
            WALL_CHROME_SCALE_MAX_PERCENT,
        );
        setScale(nextScale);
    }, [entryById, setOffset, setScale]);

    const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!dragRef.current) return;
        dragRef.current = null;
        setActiveId(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }, []);

    if (!editMode || boxes.length === 0) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-[400]" data-chrome-edit-overlay>
            {boxes.map(box => {
                const entry = entryById(box.id);
                if (!entry) return null;
                const isActive = activeId === box.id;
                const handlers = {
                    onPointerMove: onDragMove,
                    onPointerUp: endDrag,
                    onPointerCancel: endDrag,
                };
                return (
                    <div key={box.id}>
                        {/* 框体：拖动改位置。touch-action:none 见文件头注释 —— 触屏上不写会被原生滚动抢走指针。 */}
                        <div
                            className={`pointer-events-auto absolute cursor-move rounded-full border-2 border-dashed transition-colors ${isActive ? 'border-[var(--text-accent)]' : 'border-[color-mix(in_srgb,var(--text-primary)_45%,transparent)]'}`}
                            style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12, touchAction: 'none' }}
                            onPointerDown={event => startDrag(event, box.id, 'move')}
                            onPointerMove={handlers.onPointerMove}
                            onPointerUp={handlers.onPointerUp}
                            onPointerCancel={handlers.onPointerCancel}
                            title={t(entry.labelKey)}
                        >
                            <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-[var(--text-accent)] px-1 text-[10px] leading-4 text-[var(--text-on-accent,#fff)]">
                                {t('options.wallChromeEditDragHint')}
                            </span>
                        </div>
                        {/* 右下角手柄：拖动改大小（四颗按钮共用的那一档比例）。 */}
                        {entry.sizeTarget && (
                            <div
                                className={`pointer-events-auto absolute cursor-nwse-resize rounded-full border-2 border-[var(--bg-color)] ${isActive ? 'bg-[var(--text-accent)]' : 'bg-[color-mix(in_srgb,var(--text-primary)_70%,transparent)]'}`}
                                style={{ left: box.left + box.width - 5, top: box.top + box.height - 5, width: 14, height: 14, touchAction: 'none' }}
                                onPointerDown={event => startDrag(event, box.id, 'size')}
                                onPointerMove={handlers.onPointerMove}
                                onPointerUp={handlers.onPointerUp}
                                onPointerCancel={handlers.onPointerCancel}
                                title={t('options.wallChromeEditSizeHint')}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ChromeEditOverlay;
