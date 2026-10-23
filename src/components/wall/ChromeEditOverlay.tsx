// src/components/wall/ChromeEditOverlay.tsx
// 浮层编辑态：开启「拖动调整位置」后进入一个明确的编辑模式 ——
//   · 四颗按钮与信息条上下两部分外面各一个虚线框，拖框体改位置、拖右下角手柄改大小；
//   · 顶部一条细工具栏：网格线开关 / 取消 / 完成；
//   · 点选一个框后，框旁边显示它到屏幕四边的距离，底部出现贴边与居中；
//   · 取消回到打开编辑态时的样子，完成保留改动。
//
// 为什么用覆盖层而不是给每个按钮包一层 wrapper：这些控件分散在四五个组件里，
// 各自的定位方式还不一样（absolute、relative、fixed），包 wrapper 会改 DOM 结构，
// 很容易把 .lattice-tools 的弹性布局、或者 seam 的 overflow 裁切弄坏。
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlignCenterHorizontal, AlignCenterVertical, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowLeftToLine, ArrowRight, ArrowRightToLine, ArrowUp, ArrowUpToLine, Check, Contrast, Grid3x3, Undo2, X } from 'lucide-react';
import {
    useWallChromeOffsetStore,
    WALL_CHROME_EDIT_MASKS,
    WALL_CHROME_SCALE_MAX_PERCENT,
    WALL_CHROME_SCALE_MIN_PERCENT,
    type WallChromeEditMask,
    type WallChromeOffsetTarget,
    type WallChromeSizeTarget,
} from '../../stores/useWallChromeOffsetStore';
import { resolveChromeMargins, resolveChromeSnapDelta, type ChromeSnapTarget } from '../../utils/wallChromeSnap';

/** 一颗可编辑的浮层：找控件的选择器、它改哪一组偏移、哪一组大小。 */
type ChromeEditEntry = {
    id: string;
    /**
     * 控件的选择器。可以匹配多个元素 —— 那时框画成它们的**包围盒**，拖动整组一起走。
     *
     * 信息条的一「部分」本来就是一组（首页窄缝是账户入口 + 工具坞 + 展开尾巴，
     * 完整信息条是两排动作），实测反馈要的是「整个下部分一起动」。这些元素改的是
     * 同一组偏移、各自在 CSS 里读同一对变量，所以整组动不需要额外做联动。
     */
    selector: string;
    offsetTarget: WallChromeOffsetTarget;
    /** 有大小可调的才写；信息条上下两部分与顶部提示只挪不缩放。 */
    sizeTarget?: WallChromeSizeTarget;
    labelKey: string;
};

const ENTRIES: readonly ChromeEditEntry[] = [
    { id: 'wallBack', selector: '.lattice-back, .folia-player-back', offsetTarget: 'wallBack', sizeTarget: 'wallBack', labelKey: 'options.wallChromeTargetBack' },
    { id: 'wallLocate', selector: '[data-grid-locate]', offsetTarget: 'wallLocate', sizeTarget: 'wallLocate', labelKey: 'options.wallChromeTargetLocate' },
    { id: 'wallTools', selector: '.lattice-tools', offsetTarget: 'wallTools', sizeTarget: 'wallTools', labelKey: 'options.wallChromeTargetTools' },
    { id: 'ponder', selector: '[data-testid="page-ponder-touch-button"]', offsetTarget: 'ponder', sizeTarget: 'ponder', labelKey: 'options.wallChromeTargetPonder' },
    // 信息条上部分：首页窄缝的 home-head（标题 + 竖排页签）、完整信息条 / 面板 / 搜索 / 海报页的 crumbs。
    // 这些元素由组件自己标 data-seam-part，CSS 按这个标记位移（见 bravais.css）。
    { id: 'seamHead', selector: '.bravais-seam-content [data-seam-part="head"]', offsetTarget: 'seamHead', labelKey: 'options.wallChromeTargetSeamHead' },
    // 信息条下部分：整组一起框、一起拖。
    { id: 'seamDock', selector: '.bravais-seam-content [data-seam-part="dock"]', offsetTarget: 'seamDock', labelKey: 'options.wallChromeTargetSeamDock' },
    // 顶部提示：平时不一定在屏幕上（提示是短暂的），所以编辑态里 AppDialogs 会画一个占位，
    // 占位与真提示同一个选择器组 —— 没提示的时候也能把它挪到想要的位置。
    { id: 'statusToast', selector: '[data-status-toast-slot], .status-toast', offsetTarget: 'statusToast', labelKey: 'options.wallChromeTargetToast' },
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

/** 贴边 / 居中。图标 + 文字标题：412px 的屏幕上六个动作只放得下图标，
 *  名字进 title 与 aria-label（长按可看到，读屏也读得到）。 */
const SNAP_ACTIONS: ReadonlyArray<{ target: ChromeSnapTarget; labelKey: string; icon: typeof ArrowLeftToLine }> = [
    { target: 'left', labelKey: 'options.wallChromeSnapLeft', icon: ArrowLeftToLine },
    { target: 'top', labelKey: 'options.wallChromeSnapTop', icon: ArrowUpToLine },
    { target: 'right', labelKey: 'options.wallChromeSnapRight', icon: ArrowRightToLine },
    { target: 'bottom', labelKey: 'options.wallChromeSnapBottom', icon: ArrowDownToLine },
    { target: 'centerX', labelKey: 'options.wallChromeSnapCenterX', icon: AlignCenterHorizontal },
    { target: 'centerY', labelKey: 'options.wallChromeSnapCenterY', icon: AlignCenterVertical },
];

/**
 * 像素级微调：每次 1px，按住不放先等 400ms 再每 60ms 走一格。
 * 拖动只能粗放到「差不多」，对齐两颗按钮的边、或者把它摆到网格线上，需要的是键盘方向键那样的步进。
 */
const NUDGE_ACTIONS: ReadonlyArray<{ dx: number; dy: number; labelKey: string; icon: typeof ArrowLeft }> = [
    { dx: -1, dy: 0, labelKey: 'options.wallChromeNudgeLeft', icon: ArrowLeft },
    { dx: 0, dy: -1, labelKey: 'options.wallChromeNudgeUp', icon: ArrowUp },
    { dx: 0, dy: 1, labelKey: 'options.wallChromeNudgeDown', icon: ArrowDown },
    { dx: 1, dy: 0, labelKey: 'options.wallChromeNudgeRight', icon: ArrowRight },
];

/** 蒙层的样子：压一层底色，让浮层的边界从背景里浮出来。 */
const MASK_STYLES: Record<WallChromeEditMask, React.CSSProperties> = {
    none: { backgroundColor: 'transparent' },
    black: { backgroundColor: 'rgba(0, 0, 0, 0.55)' },
    white: { backgroundColor: 'rgba(255, 255, 255, 0.62)' },
    gray: { backgroundColor: 'rgba(128, 128, 128, 0.55)' },
};

const MASK_LABEL_KEYS: Record<WallChromeEditMask, string> = {
    none: 'options.wallChromeMaskNone',
    black: 'options.wallChromeMaskBlack',
    white: 'options.wallChromeMaskWhite',
    gray: 'options.wallChromeMaskGray',
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * 一个条目此刻的框：它匹配到的所有元素的包围盒。
 *
 * 一个条目匹配多个元素是常态（信息条的一「部分」本身就是一组）。翻牌的那一瞬新旧两套内容
 * 同时在文档里 —— 旧的那套标了 data-bravais-seam-leaving，跳过它，否则框会忽然撑到
 * 「两套内容合起来」那么大，看着像抖动。
 */
const measureEntry = (entry: ChromeEditEntry): Box | null => {
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    const elements = document.querySelectorAll(entry.selector);
    for (const element of elements) {
        if (element.closest('[data-bravais-seam-leaving]')) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) continue;
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
    }
    if (!Number.isFinite(left) || !Number.isFinite(top) || right - left < 1 || bottom - top < 1) return null;
    return { id: entry.id, left, top, width: right - left, height: bottom - top };
};

const ChromeEditOverlay: React.FC = () => {
    const { t } = useTranslation();
    const editMode = useWallChromeOffsetStore(state => state.chromeEditMode);
    const gridOn = useWallChromeOffsetStore(state => state.chromeEditGrid);
    const mask = useWallChromeOffsetStore(state => state.chromeEditMask);
    const offsets = useWallChromeOffsetStore(state => state.offsets);
    const scale = useWallChromeOffsetStore(state => state.scale);
    const setOffset = useWallChromeOffsetStore(state => state.handleSetOffset);
    const setScale = useWallChromeOffsetStore(state => state.handleSetScale);
    const setGrid = useWallChromeOffsetStore(state => state.handleSetChromeEditGrid);
    const setMask = useWallChromeOffsetStore(state => state.handleSetChromeEditMask);
    const setEditMode = useWallChromeOffsetStore(state => state.handleSetChromeEditMode);
    const cancelEdit = useWallChromeOffsetStore(state => state.handleCancelChromeEdit);

    const [boxes, setBoxes] = useState<Box[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const dragRef = useRef<DragState | null>(null);
    /** 像素微调的长按连发：延时启动与连发两个定时器。 */
    const nudgeTimersRef = useRef<{ delay: number | null; repeat: number | null }>({ delay: null, repeat: null });
    const [viewport, setViewport] = useState(() => ({
        width: typeof window === 'undefined' ? 0 : window.innerWidth,
        height: typeof window === 'undefined' ? 0 : window.innerHeight,
    }));

    // 编辑态开启时持续测量这几颗控件的位置。用 rAF 而不是事件监听：
    // 位置变化的原因很多（别的动画、视口变化、播放状态、缝翻牌），逐条列会漏，
    // 而编辑态是临时的，一帧一次的 getBoundingClientRect 代价可以接受。
    useEffect(() => {
        if (!editMode) {
            setBoxes([]);
            setSelectedId(null);
            return undefined;
        }
        let frame = 0;
        const measure = () => {
            const next: Box[] = [];
            for (const entry of ENTRIES) {
                const box = measureEntry(entry);
                if (box) next.push(box);
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
            if (window.innerWidth !== viewport.width || window.innerHeight !== viewport.height) {
                setViewport({ width: window.innerWidth, height: window.innerHeight });
            }
            frame = window.requestAnimationFrame(measure);
        };
        frame = window.requestAnimationFrame(measure);
        return () => window.cancelAnimationFrame(frame);
    }, [editMode, offsets, scale, viewport.height, viewport.width]);

    const entryById = useCallback((id: string) => ENTRIES.find(entry => entry.id === id), []);
    const selectedBox = useMemo(
        () => (selectedId ? boxes.find(box => box.id === selectedId) ?? null : null),
        [boxes, selectedId],
    );
    const selectedMargins = selectedBox ? resolveChromeMargins(selectedBox, viewport) : null;

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
        setSelectedId(entryId);
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

    // 贴边 / 居中：按选框当前矩形算位移，叠到这一组自己的偏移上。
    const snapSelected = useCallback((snapTarget: ChromeSnapTarget) => {
        const box = selectedId ? boxes.find(item => item.id === selectedId) : null;
        if (!box) return;
        const entry = entryById(box.id);
        if (!entry) return;
        const delta = resolveChromeSnapDelta(snapTarget, box, {
            width: window.innerWidth,
            height: window.innerHeight,
        });
        const current = offsets[entry.offsetTarget];
        if (delta.dx !== 0) setOffset(entry.offsetTarget, 'x', current.x + delta.dx);
        if (delta.dy !== 0) setOffset(entry.offsetTarget, 'y', current.y + delta.dy);
        // 框体立刻落到新位置，避免等下一帧测量时标签与框错位。
        setBoxes(previous => previous.map(item => (
            item.id === box.id
                ? { ...item, left: item.left + delta.dx, top: item.top + delta.dy }
                : item
        )));
    }, [boxes, entryById, offsets, selectedId, setOffset]);

    // —— 像素微调 ——
    // 每次 1px。读的是 store 的当前值而不是这次渲染闭包里的 offsets：
    // 长按连发时闭包是旧的，连加的会是同一个基准，按钮会「一顿一顿」或者根本不动。
    const applyNudge = useCallback((entryId: string, dx: number, dy: number) => {
        const entry = ENTRIES.find(item => item.id === entryId);
        if (!entry) return;
        const state = useWallChromeOffsetStore.getState();
        const current = state.offsets[entry.offsetTarget];
        if (dx !== 0) state.handleSetOffset(entry.offsetTarget, 'x', current.x + dx);
        if (dy !== 0) state.handleSetOffset(entry.offsetTarget, 'y', current.y + dy);
        setBoxes(previous => previous.map(box => (
            box.id === entryId ? { ...box, left: box.left + dx, top: box.top + dy } : box
        )));
    }, []);

    const clearNudgeTimers = useCallback(() => {
        if (nudgeTimersRef.current.delay !== null) {
            window.clearTimeout(nudgeTimersRef.current.delay);
            nudgeTimersRef.current.delay = null;
        }
        if (nudgeTimersRef.current.repeat !== null) {
            window.clearInterval(nudgeTimersRef.current.repeat);
            nudgeTimersRef.current.repeat = null;
        }
    }, []);

    const startNudge = useCallback((entryId: string, dx: number, dy: number) => {
        clearNudgeTimers();
        applyNudge(entryId, dx, dy);
        // 第一下立刻走一格；按住 400ms 后开始连发，每 60ms 一格（约 16px/s，够快又不飘）。
        nudgeTimersRef.current.delay = window.setTimeout(() => {
            nudgeTimersRef.current.delay = null;
            nudgeTimersRef.current.repeat = window.setInterval(() => applyNudge(entryId, dx, dy), 60);
        }, 400);
    }, [applyNudge, clearNudgeTimers]);

    // 退出编辑态或卸载时把连发停掉，否则定时器会在后台一直写偏移。
    useEffect(() => {
        if (!editMode) clearNudgeTimers();
        return clearNudgeTimers;
    }, [clearNudgeTimers, editMode]);

    if (!editMode || boxes.length === 0) return null;

    return (
        <div className="pointer-events-none fixed inset-0 z-[400]" data-chrome-edit-overlay>
            {/* 背景蒙层：黑 / 白 / 灰三档（外加「无」）。压在墙与缝之上、选框之下，
                按钮与背景的边界从封面的颜色里浮出来，贴边与对齐时才好判断。 */}
            {mask !== 'none' && (
                <div aria-hidden data-chrome-edit-mask={mask} className="absolute inset-0" style={MASK_STYLES[mask]} />
            )}

            {/* 对齐网格：20px 细格 + 100px 粗格，编辑态专用，可开关。放在蒙层之上、选框之下。 */}
            {gridOn && (
                <div
                    aria-hidden
                    className="absolute inset-0 opacity-60"
                    data-chrome-edit-grid
                    style={{
                        backgroundImage: [
                            'linear-gradient(to right, color-mix(in srgb, var(--text-accent) 26%, transparent) 1px, transparent 1px)',
                            'linear-gradient(to bottom, color-mix(in srgb, var(--text-accent) 26%, transparent) 1px, transparent 1px)',
                            'linear-gradient(to right, color-mix(in srgb, var(--text-accent) 12%, transparent) 1px, transparent 1px)',
                            'linear-gradient(to bottom, color-mix(in srgb, var(--text-accent) 12%, transparent) 1px, transparent 1px)',
                        ].join(','),
                        backgroundSize: '100px 100px, 100px 100px, 20px 20px, 20px 20px',
                    }}
                />
            )}

            {boxes.map(box => {
                const entry = entryById(box.id);
                if (!entry) return null;
                const isActive = activeId === box.id;
                const isSelected = selectedId === box.id;
                const handlers = {
                    onPointerMove: onDragMove,
                    onPointerUp: endDrag,
                    onPointerCancel: endDrag,
                };
                return (
                    <div key={box.id}>
                        {/* 框体：拖动改位置。touch-action:none 见文件头注释 —— 触屏上不写会被原生滚动抢走指针。 */}
                        <div
                            className={`pointer-events-auto absolute cursor-move rounded-full border-2 border-dashed transition-colors ${
                                isActive || isSelected
                                    ? 'border-[var(--text-accent)]'
                                    : 'border-[color-mix(in_srgb,var(--text-primary)_45%,transparent)]'
                            }`}
                            style={{ left: box.left - 6, top: box.top - 6, width: box.width + 12, height: box.height + 12, touchAction: 'none' }}
                            onPointerDown={event => startDrag(event, box.id, 'move')}
                            onPointerMove={handlers.onPointerMove}
                            onPointerUp={handlers.onPointerUp}
                            onPointerCancel={handlers.onPointerCancel}
                            title={t(entry.labelKey)}
                        >
                            <span className={`absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] leading-4 ${
                                isActive || isSelected
                                    ? 'bg-[var(--text-accent)] text-[var(--text-on-accent,#fff)]'
                                    : 'bg-[color-mix(in_srgb,var(--bg-color,#0b0b0c)_78%,transparent)] text-[color:var(--text-primary)]'
                            }`}
                            >
                                {t(entry.labelKey)}
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

            {/* 边距读数与工具栏合成一块：412px 宽的手机上，读数跟着框跑到屏幕底部会和
                贴边条撞在一起（实测截图里糊成一团）。放在工具栏第二行，任何位置都不会打架，
                拖动时数字照样实时跳。 */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-2" style={{ paddingTop: 'max(6px, env(safe-area-inset-top))' }}>
                <div
                    className="pointer-events-auto flex max-w-full flex-col items-stretch gap-1 rounded-2xl border border-[color-mix(in_srgb,var(--text-primary)_18%,transparent)] bg-[color-mix(in_srgb,var(--bg-color,#0b0b0c)_78%,transparent)] px-1.5 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur"
                    data-chrome-edit-toolbar
                >
                    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <button
                            type="button"
                            className={`flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium transition-colors ${
                                gridOn
                                    ? 'bg-[var(--text-accent)] text-[var(--text-on-accent,#fff)]'
                                    : 'text-[color:var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]'
                            }`}
                            aria-pressed={gridOn}
                            onClick={() => setGrid(!gridOn)}
                            title={t('options.wallChromeEditGridDesc')}
                        >
                            <Grid3x3 size={14} aria-hidden />
                            {t('options.wallChromeEditGrid')}
                        </button>
                        {/* 蒙层：点一下循环 无 → 黑 → 白 → 灰 → 无。
                            只在编辑态生效，退出编辑就没了，所以不必给「关掉」另留一个控件。 */}
                        <button
                            type="button"
                            className={`flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium transition-colors ${
                                mask === 'none'
                                    ? 'text-[color:var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]'
                                    : 'bg-[color-mix(in_srgb,var(--text-primary)_16%,transparent)] text-[color:var(--text-primary)]'
                            }`}
                            onClick={() => {
                                const index = WALL_CHROME_EDIT_MASKS.indexOf(mask);
                                setMask(WALL_CHROME_EDIT_MASKS[(index + 1) % WALL_CHROME_EDIT_MASKS.length]);
                            }}
                            title={t('options.wallChromeEditMaskDesc')}
                            aria-label={`${t('options.wallChromeEditMask')} ${t(MASK_LABEL_KEYS[mask])}`}
                        >
                            <Contrast size={14} aria-hidden />
                            {t('options.wallChromeEditMask')}
                            <span className="opacity-60">{t(MASK_LABEL_KEYS[mask])}</span>
                        </button>
                        <span className="mx-0.5 h-5 w-px shrink-0 bg-[color-mix(in_srgb,var(--text-primary)_18%,transparent)]" aria-hidden />
                        <button
                            type="button"
                            className="flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium text-[color:var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)]"
                            onClick={cancelEdit}
                        >
                            <Undo2 size={14} aria-hidden />
                            {t('options.wallChromeEditCancel')}
                        </button>
                        <button
                            type="button"
                            className="flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--text-accent)] px-3 text-[12px] font-semibold text-[var(--text-on-accent,#fff)]"
                            onClick={() => setEditMode(false)}
                        >
                            <Check size={14} aria-hidden />
                            {t('options.wallChromeEditDone')}
                        </button>
                    </div>
                    {selectedBox && selectedMargins && (
                        <div
                            className="flex items-center justify-center gap-1.5 whitespace-nowrap px-1 text-[10.5px] leading-4 tabular-nums text-[color:color-mix(in_srgb,var(--text-primary)_72%,transparent)]"
                            data-chrome-edit-margins
                        >
                            <span className="font-semibold text-[var(--text-accent)]">
                                {t(entryById(selectedBox.id)?.labelKey ?? 'options.wallChromeEditDragHint')}
                            </span>
                            <span>{t('options.wallChromeMargins', {
                                left: selectedMargins.left,
                                top: selectedMargins.top,
                                right: selectedMargins.right,
                                bottom: selectedMargins.bottom,
                            })}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* 底部条：选中后两行 —— 上行是像素微调（1px 一格，按住连发），
                下行是贴边 / 居中 / 取消选中。抬到 76px 以上，不压住右下角的工具与定位
                （它们贴底 16–56px）。没选中时只剩一句提示。 */}
            <div
                className="pointer-events-auto absolute bottom-[76px] left-1/2 flex max-w-[94vw] -translate-x-1/2 flex-col items-stretch gap-1 whitespace-nowrap rounded-2xl border border-[color-mix(in_srgb,var(--text-primary)_16%,transparent)] bg-[color-mix(in_srgb,var(--bg-color,#0b0b0c)_74%,transparent)] px-1.5 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.4)] backdrop-blur"
                data-chrome-edit-actions
            >
                {selectedBox ? (
                    <>
                        <div className="flex items-center justify-center gap-0.5" data-chrome-edit-nudge>
                            <span className="pl-1 pr-0.5 text-[10px] leading-4 text-[color:color-mix(in_srgb,var(--text-primary)_60%,transparent)]">
                                {t('options.wallChromeEditNudge')}
                            </span>
                            {NUDGE_ACTIONS.map(action => {
                                const Icon = action.icon;
                                const label = t(action.labelKey);
                                return (
                                    <button
                                        key={action.labelKey}
                                        type="button"
                                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] active:bg-[color-mix(in_srgb,var(--text-primary)_20%,transparent)]"
                                        style={{ touchAction: 'none' }}
                                        // 按下即走一格，按住连发；抬起 / 移出 / 取消都停。
                                        onPointerDown={event => {
                                            event.preventDefault();
                                            event.currentTarget.setPointerCapture?.(event.pointerId);
                                            startNudge(selectedBox.id, action.dx, action.dy);
                                        }}
                                        onPointerUp={clearNudgeTimers}
                                        onPointerCancel={clearNudgeTimers}
                                        onPointerLeave={clearNudgeTimers}
                                        aria-label={label}
                                        title={label}
                                    >
                                        <Icon size={16} aria-hidden />
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center justify-center gap-0.5">
                            {SNAP_ACTIONS.map(action => {
                            const Icon = action.icon;
                            const label = t(action.labelKey);
                            return (
                                <button
                                    key={action.target}
                                    type="button"
                                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[color:var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)]"
                                    onClick={() => snapSelected(action.target)}
                                    aria-label={label}
                                    title={label}
                                >
                                    <Icon size={17} aria-hidden />
                                </button>
                            );
                        })}
                        <span className="mx-0.5 h-5 w-px shrink-0 bg-[color-mix(in_srgb,var(--text-primary)_16%,transparent)]" aria-hidden />
                        <button
                            type="button"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[color:var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)]"
                            onClick={() => setSelectedId(null)}
                            aria-label={t('options.wallChromeEditDeselect')}
                            title={t('options.wallChromeEditDeselect')}
                        >
                            <X size={15} aria-hidden />
                        </button>
                        </div>
                    </>
                ) : (
                    <span className="px-2 py-1 text-[11.5px] text-[color:color-mix(in_srgb,var(--text-primary)_70%,transparent)]">
                        {t('options.wallChromeEditPickHint')}
                    </span>
                )}
            </div>
        </div>
    );
};

export default ChromeEditOverlay;
