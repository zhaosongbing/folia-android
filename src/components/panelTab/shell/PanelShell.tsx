import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useTransform, type MotionStyle } from 'framer-motion';
import type { Theme } from '../../../types';
import { usePlayerBottomBarBottomPx } from '../../../hooks/usePlayerBottomBarBottomPx';
import { usePlayerOverlayObstacle } from '../../../hooks/usePlayerOverlayLayout';
import { kitTransition, useKitReducedMotion } from '../../modal/settings/kit/motion';
import { panelTokens } from './panelTheme';
import { FOLDED_PX } from './SongHeader';
import { useMeasuredSize } from './useMeasuredSize';

// src/components/panelTab/shell/PanelShell.tsx
// The frame of the playing page's panel: where it sits, the glass surface, and how tall it is. The
// surface stands wholly above the round handle and grows out of it. From top to bottom it holds the
// song (the header), the open tab (which scrolls inside when the window is short) and the tab row,
// which stays at the bottom edge. Each tab gets the height its content needs: the content is
// measured, and the surface follows with the kit's motion, upward from the tab row. The open
// surface is in the way of a mod's player layout (usePlayerOverlayObstacle) and says so as it moves.

/** The handle's height and the gap above it: how far the surface's bottom edge is above the handle's. */
const HANDLE_ROOM_PX = 60;
/** Under the surface when no handle is drawn below it. */
const BARE_GAP_PX = 8;
/** What stays free between the surface and the top of the window. */
const TOP_MARGIN_PX = 56;
const PADDING_PX = 12;
const DOCK_HEIGHT_PX = 36;
const DOCK_GAP_PX = 12;
/** Above the open tab: the gap, the hairline, and the gap under it. */
const BODY_TOP_PX = { gap: 12, line: 1, under: 8 } as const;
/** The surface's own width, mirrored from the class below: the anchor clamp needs it. */
const PANEL_WIDTH_PX = 360;
/** 锚点到面板的距离：像菜单那样偏开手指一点，别让面板边缘贴着落点。 */
const ANCHOR_GAP_PX = 12;
/** 贴边时留给屏幕的距离。 */
const ANCHOR_EDGE_MARGIN_PX = 8;

/**
 * 锚点模式下面板从哪一侧展开。
 *
 * 比较锚点左右的剩余空间：右侧放得下就往右展开（面板左缘 = 锚点 + 间距），
 * 左侧放得下就往左展开（面板右缘 = 锚点 − 间距），两侧都放不下时贴更宽的那一侧并允许
 * 被外层 max-w 收敛。这样无论长按点在屏幕哪个位置，面板都朝着宽的一侧打开，
 * 不会出现「长按在最左边，面板却飞到最右边」。
 */
const resolveAnchoredPanelLayout = (
    anchor: { x: number; y: number },
): { left: number; align: 'start' | 'end' } => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    const roomOnRight = viewportWidth - anchor.x;
    const roomOnLeft = anchor.x;
    const fitsRight = roomOnRight >= PANEL_WIDTH_PX + ANCHOR_GAP_PX + ANCHOR_EDGE_MARGIN_PX;
    const fitsLeft = roomOnLeft >= PANEL_WIDTH_PX + ANCHOR_GAP_PX + ANCHOR_EDGE_MARGIN_PX;

    if (fitsRight || (!fitsLeft && roomOnRight >= roomOnLeft)) {
        const left = anchor.x + ANCHOR_GAP_PX;
        return {
            left: Math.max(
                ANCHOR_EDGE_MARGIN_PX,
                Math.min(left, Math.max(ANCHOR_EDGE_MARGIN_PX, viewportWidth - PANEL_WIDTH_PX - ANCHOR_EDGE_MARGIN_PX)),
            ),
            align: 'start',
        };
    }

    const left = anchor.x - ANCHOR_GAP_PX - PANEL_WIDTH_PX;
    return {
        left: Math.max(ANCHOR_EDGE_MARGIN_PX, left),
        align: 'end',
    };
};

type PanelShellProps = {
    isOpen: boolean;
    /** The round button stays under the open surface (a setting can take it away): the surface stands above it. */
    hasHandle: boolean;
    /** The cover tab is open: the header is the whole panel and there is no tab body. */
    isCover: boolean;
    /** Names the open tab: a new value brings its body in and measures it. */
    tabKey: string;
    theme: Theme;
    isDaylight: boolean;
    /** The song. It may use --pn-room, the height it can take on the cover tab, and 100cqw, the surface's inner width. */
    header: React.ReactNode;
    /** The tab row. */
    dock: React.ReactNode;
    /** The round button that opens and closes the panel. */
    handle: React.ReactNode;
    /** The open tab's body. It may use --pn-tab-room, the height it can take before it scrolls here. */
    children: React.ReactNode;
    /**
     * 长按入口的展开锚点（视口坐标）。给了它面板就不再贴右缘，改从长按点附近展开；
     * 把手、命令面板、快捷键这些入口都不传，保持原来的贴右行为。
     */
    anchor?: { x: number; y: number } | null;
};

type PanelSurfaceProps = Omit<PanelShellProps, 'isOpen' | 'handle'> & {
    /** Registers the surface as an obstacle of the player layout. */
    layoutRef: (element: HTMLElement | null) => void;
    /** Tells the player layout that the surface moved. */
    onLayoutUpdate: () => void;
};

const PanelSurface: React.FC<PanelSurfaceProps> = ({ hasHandle, isCover, tabKey, theme, isDaylight, header, dock, children, layoutRef, onLayoutUpdate, anchor }) => {
    const reduced = useKitReducedMotion();
    const bottomBarBottomPx = usePlayerBottomBarBottomPx();
    // What is under the surface: the handle, or a small gap. A variable, so the two heights below follow it at once.
    const underPx = hasHandle ? HANDLE_ROOM_PX : BARE_GAP_PX;
    // 锚点模式下高度从锚点的 top 往下算，而不是从底部基线往上算。
    const anchoredTopPx = anchor ? Math.max(8, anchor.y) : 0;
    // 展开原点跟着实际那一侧走：往右展开时从左上角长出，往左展开时从右上角长出。
    const anchoredLayout = anchor ? resolveAnchoredPanelLayout(anchor) : null;
    // Never taller than the window allows, wherever the bottom bar's baseline has been lifted to.
    const maxHeight = useTransform(
        bottomBarBottomPx,
        bottom => (anchor
            ? `calc(100dvh - ${anchoredTopPx}px - 24px)`
            : `calc(100dvh - var(--pn-under) - ${bottom + TOP_MARGIN_PX}px)`),
    );
    const headerRoom = useTransform(
        bottomBarBottomPx,
        bottom => (anchor
            ? `calc(100dvh - ${anchoredTopPx}px - ${2 * PADDING_PX + DOCK_GAP_PX + DOCK_HEIGHT_PX}px)`
            : `calc(100dvh - var(--pn-under) - ${bottom + TOP_MARGIN_PX + 2 * PADDING_PX + DOCK_GAP_PX + DOCK_HEIGHT_PX}px)`),
    );
    const scrollRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const content = useMeasuredSize(contentRef, tabKey);
    // The surface takes the size of its tab while it is still closed: nothing inside it moves
    // until it has been painted once.
    const [isStill, setIsStill] = useState(true);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setIsStill(false));
        return () => cancelAnimationFrame(frame);
    }, []);
    // A new tab starts at its top.
    useLayoutEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
    }, [tabKey]);

    const bodyHeight = isCover ? 0 : BODY_TOP_PX.gap + BODY_TOP_PX.line + BODY_TOP_PX.under + content.height;
    // Where the surface comes from and goes back to: a little smaller, toward the handle.
    const away = { opacity: 0, scale: 0.92 };

    return (
        <motion.div
            ref={layoutRef}
            onUpdate={onLayoutUpdate}
            initial={away}
            animate={{ opacity: 1, scale: 1, transition: kitTransition('unfold', reduced) }}
            exit={{ ...away, transition: kitTransition('move', reduced) }}
            data-testid="unified-panel-surface"
            data-still={isStill || undefined}
            className="st-window pointer-events-auto @container hide-scrollbar flex w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto overflow-x-hidden rounded-[20px] bg-[var(--pn-glass)] text-[color:var(--st-t1)] shadow-[var(--pn-shadow)] backdrop-blur-[40px] backdrop-saturate-[1.3] [&[data-still]_*]:transition-none"
            style={{
                ...panelTokens(isDaylight, theme, reduced),
                '--pn-under': `${underPx}px`,
                '--pn-room': headerRoom,
                // What is left of that room under the song's one line and the hairline: a tab with a
                // list of its own ends the list there, so the list scrolls and the tab does not.
                '--pn-tab-room': `calc(var(--pn-room) - ${FOLDED_PX + BODY_TOP_PX.gap + BODY_TOP_PX.line + BODY_TOP_PX.under}px)`,
                // The tab's body shrinks and scrolls first. Only a window too short for the cover
                // tab's least height makes the surface itself scroll, so the tab row stays in reach.
                maxHeight,
                padding: PADDING_PX,
                marginBottom: underPx,
                // The centre of the handle, at the surface's right end. 锚点模式改从落点那一侧长出。
                transformOrigin: anchoredLayout
                    ? (anchoredLayout.align === 'end' ? 'calc(100% - 12px) 0' : '12px 0')
                    : `calc(100% - 24px) calc(100% + ${underPx - 24}px)`,
            } as MotionStyle}
        >
            {header}

            {/* As wide as the surface, so the scrollbar (the kit's, as wide as the padding) lies in the surface's own padding. */}
            <div
                className="st-t-unfold flex min-h-0 shrink flex-col overflow-hidden transition-[height]"
                style={{ height: bodyHeight, marginInline: -PADDING_PX }}
            >
                <div
                    className="h-px shrink-0 bg-[var(--st-line)]"
                    style={{ marginTop: BODY_TOP_PX.gap, marginInline: PADDING_PX }}
                />
                {/* The tab scrolls here when the window is short. */}
                <div
                    ref={scrollRef}
                    className="st-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
                    style={{ paddingTop: BODY_TOP_PX.under, paddingLeft: PADDING_PX }}
                >
                    <div ref={contentRef} key={tabKey} className="st-page-in">
                        {children}
                    </div>
                </div>
            </div>

            <div className="shrink-0" style={{ height: DOCK_HEIGHT_PX, marginTop: DOCK_GAP_PX }}>
                {dock}
            </div>
        </motion.div>
    );
};

const PanelShell: React.FC<PanelShellProps> = ({ isOpen, handle, anchor, ...surface }) => {
    const bottomBarBottomPx = usePlayerBottomBarBottomPx();
    const { ref: layoutRef, invalidate: invalidateLayout } = usePlayerOverlayObstacle('player-panel', 'panel');
    // 关面板时 App 会立刻清掉 anchor（见 useAppViewStore.setIsPanelOpen），而面板还有一段退场动画。
    // 这里把「本次打开用的锚点」留到退场结束，否则动画进行中 wrapper 会从长按位置跳回右侧 ——
    // 就是关列表时在屏幕右边闪一下的那个现象。
    const [layoutAnchor, setLayoutAnchor] = useState(anchor);
    useEffect(() => {
        if (isOpen) setLayoutAnchor(anchor);
    }, [isOpen, anchor]);
    const anchorForLayout = isOpen ? anchor : layoutAnchor;
    const anchored = Boolean(anchorForLayout);
    // 锚点落在哪一侧展开：比较锚点左右的剩余空间，谁放得下面板就往哪侧展开。
    // 原来的做法是无条件往右展开再内收，锚点靠近左缘时面板会被压成贴右，看起来「没跟着手指」。
    const anchoredLayout = anchorForLayout ? resolveAnchoredPanelLayout(anchorForLayout) : null;

    return (
        <motion.div
            // 锚点模式：从锚点向宽的那一侧展开（间距 12px，贴边时内收 8px不出屏）。
            // 非锚点模式保持原来的 bottom 基线。
            style={anchoredLayout
                ? { left: anchoredLayout.left, top: Math.max(8, anchorForLayout!.y) }
                : { bottom: bottomBarBottomPx }}
            onUpdate={invalidateLayout}
            className={`absolute z-[60] flex flex-col pointer-events-none ${anchoredLayout ? (anchoredLayout.align === 'end' ? 'items-end' : 'items-start') : 'right-0 items-end'}`}
            onClick={(e) => e.stopPropagation()}
        >
            <div className={anchoredLayout ? (anchoredLayout.align === 'end' ? 'pr-4 md:pr-8' : '') : 'pr-4 md:pr-8'}>
                <AnimatePresence>
                    {isOpen && <PanelSurface {...surface} anchor={anchorForLayout} layoutRef={layoutRef} onLayoutUpdate={invalidateLayout} />}
                </AnimatePresence>
            </div>

            {handle}
        </motion.div>
    );
};

export default PanelShell;
