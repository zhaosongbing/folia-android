// src/stores/useWallChromeOffsetStore.ts
// 界面上几组「浮层按钮」的位置与大小：左上角返回、右下角定位、右下角工具、信息条上部分、
// 右上角思索按钮、顶部状态提示。
//
// 为什么单独开一个 store：这些值是跨界面共享的 —— 主页、bravais 集合页、Lattice、播放页
// 用的是同一批按钮（或同一个视觉位置），放进任何一面墙的「外观」配置里都会让语义变糊。
//
// 位置单位 px，默认 0 = 与改动前完全一致；大小用百分比，默认 100 = 原尺寸。
// 位置上限 ±120：再大就把按钮推出屏幕，而这里的目的只是微调（避开刘海、避开底栏、躲开手指）。
// 大小范围 80–180%：小于 80% 按钮点不准，大于 180% 会盖住旁边的控件。
//
// 大小只有一档：四颗按钮（返回 / 定位 / 工具 / 思索）共用同一个百分比。
// 实测反馈：四颗各调各的，用户记不住哪颗调过、调多少，「统一比例」才是可用的心智模型；
// 基准尺寸不同（40/40/48/48）带来的视觉差异保留，比例统一。

import { create } from 'zustand';

/** 可调位置的浮层。播放页的返回按钮共用 `wallBack`，不单列。 */
export type WallChromeOffsetTarget =
    | 'wallBack'
    | 'wallLocate'
    | 'wallTools'
    | 'seamHead'
    | 'seamDock'
    | 'ponder'
    | 'statusToast';

/** 可调大小的按钮。四颗共用同一档比例，这个类型保留给设置项与测试引用。 */
export type WallChromeSizeTarget = 'wallBack' | 'wallLocate' | 'wallTools' | 'ponder';

export type WallChromeOffsetAxis = 'x' | 'y';
export type WallChromeOffset = { x: number; y: number };

export const WALL_CHROME_OFFSET_TARGETS: readonly WallChromeOffsetTarget[] = [
    'wallBack',
    'wallLocate',
    'wallTools',
    'seamHead',
    'seamDock',
    'ponder',
    'statusToast',
];

export const WALL_CHROME_SIZE_TARGETS: readonly WallChromeSizeTarget[] = [
    'wallBack',
    'wallLocate',
    'wallTools',
    'ponder',
];

/** 单轴位移的存储上限。
 *  故意给得比任何屏幕都大：拖动调整时按钮可以被放到屏幕内任意位置，
 *  真正把它挡在屏幕内的是拖动时按视口 clamp，不是这个数。
 *  这个上限只是防止存进一个离谱的值（比如拖拽事件错乱时的天文数字）。 */
export const WALL_CHROME_OFFSET_MAX_PX = 2000;
/** 设置里滑块的范围。比存储上限小：滑块负责微调，大跨度摆放交给拖动。 */
export const WALL_CHROME_OFFSET_SLIDER_MAX_PX = 600;
/** 缩放百分比的上下限与默认值。 */
export const WALL_CHROME_SCALE_MIN_PERCENT = 80;
export const WALL_CHROME_SCALE_MAX_PERCENT = 180;
export const WALL_CHROME_SCALE_DEFAULT_PERCENT = 100;

const VISIBLE_PREFIX = 'wall_chrome_visible';
/** 编辑模式的存储键。v2：换键即换默认值 —— 老键存着的 1 不再被读，
 *  0.7.21.19 起默认开启这件事对已经存过值的用户也一并作废（实测反馈：默认开着太扰民）。 */
const EDIT_MODE_KEY = 'wall_chrome_edit_mode_v2';

const OFFSET_PREFIX = 'wall_chrome_offset';
/** 四颗按钮共用的缩放。v2 同理：老的每颗各一个键整体作废，统一到这一档。 */
const SCALE_KEY = 'wall_chrome_scale_v2';

const offsetKey = (target: WallChromeOffsetTarget, axis: WallChromeOffsetAxis) =>
    `${OFFSET_PREFIX}_${target}_${axis}`;

const clampOffset = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(-WALL_CHROME_OFFSET_MAX_PX, Math.min(WALL_CHROME_OFFSET_MAX_PX, Math.round(value)));
};

const clampScale = (value: number): number => {
    if (!Number.isFinite(value)) return WALL_CHROME_SCALE_DEFAULT_PERCENT;
    return Math.max(
        WALL_CHROME_SCALE_MIN_PERCENT,
        Math.min(WALL_CHROME_SCALE_MAX_PERCENT, Math.round(value)),
    );
};

const readNumber = (key: string): number | null => {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(key);
        if (raw === null) return null;
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

const writeNumber = (key: string, value: number): void => {
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // 存储写不进去（隐私模式）时至少让本次会话生效
    }
};

const readOffset = (target: WallChromeOffsetTarget, axis: WallChromeOffsetAxis): number =>
    clampOffset(readNumber(offsetKey(target, axis)) ?? 0);

const readScale = (): number =>
    clampScale(readNumber(SCALE_KEY) ?? WALL_CHROME_SCALE_DEFAULT_PERCENT);

const readVisible = (key: string): boolean => {
    const stored = readNumber(`${VISIBLE_PREFIX}_${key}`);
    // 没存过就是默认显示
    return stored === null ? true : stored === 1;
};

const writeVisible = (key: string, show: boolean): void => {
    writeNumber(`${VISIBLE_PREFIX}_${key}`, show ? 1 : 0);
};

/** 编辑模式默认关闭：没存过就是 false，存过才按存的值。 */
const readEditMode = (): boolean => {
    const stored = readNumber(EDIT_MODE_KEY);
    return stored === 1;
};

const readAllOffsets = (): Record<WallChromeOffsetTarget, WallChromeOffset> => ({
    wallBack: { x: readOffset('wallBack', 'x'), y: readOffset('wallBack', 'y') },
    wallLocate: { x: readOffset('wallLocate', 'x'), y: readOffset('wallLocate', 'y') },
    wallTools: { x: readOffset('wallTools', 'x'), y: readOffset('wallTools', 'y') },
    seamHead: { x: readOffset('seamHead', 'x'), y: readOffset('seamHead', 'y') },
    seamDock: { x: readOffset('seamDock', 'x'), y: readOffset('seamDock', 'y') },
    ponder: { x: readOffset('ponder', 'x'), y: readOffset('ponder', 'y') },
    statusToast: { x: readOffset('statusToast', 'x'), y: readOffset('statusToast', 'y') },
});


type WallChromeOffsetStoreState = {
    offsets: Record<WallChromeOffsetTarget, WallChromeOffset>;
    /** 四颗可缩放按钮共用的比例（百分比）。 */
    scale: number;
    /** 右下角定位按钮是否显示（主页 / bravais / Lattice 共用）。默认显示。 */
    showLocateButton: boolean;
    /** 右下角工具按钮是否显示。默认显示。 */
    showToolsButton: boolean;
    /**
     * 浮层位置的手动调整模式。开启后四颗按钮与信息条上下两部分外围出现可拖动的框：
     * 拖框体改位置，拖右下角的手柄改大小。与播放页控制栏的定位模式同一套交互。
     * 默认关闭（实测反馈：默认开着容易误触）。
     */
    chromeEditMode: boolean;
    handleSetOffset: (target: WallChromeOffsetTarget, axis: WallChromeOffsetAxis, value: number) => void;
    handleToggleLocateButton: (show: boolean) => void;
    handleToggleToolsButton: (show: boolean) => void;
    handleSetChromeEditMode: (enabled: boolean) => void;
    /** 设置四颗按钮共用的比例。 */
    handleSetScale: (percent: number) => void;
    /** 把某一组（不传就是全部）的位置恢复成默认。 */
    handleResetOffset: (target?: WallChromeOffsetTarget) => void;
    /** 把四颗按钮的大小恢复成 100%。 */
    handleResetScale: () => void;
};

export const useWallChromeOffsetStore = create<WallChromeOffsetStoreState>((set, get) => ({
    offsets: readAllOffsets(),
    scale: readScale(),
    showLocateButton: readVisible('locate'),
    showToolsButton: readVisible('tools'),
    chromeEditMode: readEditMode(),
    handleSetOffset: (target, axis, value) => {
        const clamped = clampOffset(value);
        writeNumber(offsetKey(target, axis), clamped);
        if (get().offsets[target][axis] === clamped) return;
        set(state => ({
            offsets: { ...state.offsets, [target]: { ...state.offsets[target], [axis]: clamped } },
        }));
    },
    handleSetScale: (percent) => {
        const clamped = clampScale(percent);
        writeNumber(SCALE_KEY, clamped);
        if (get().scale === clamped) return;
        set({ scale: clamped });
    },
    handleToggleLocateButton: (show) => {
        writeVisible('locate', show);
        set({ showLocateButton: show });
    },
    handleToggleToolsButton: (show) => {
        writeVisible('tools', show);
        set({ showToolsButton: show });
    },
    handleSetChromeEditMode: (enabled) => {
        // 与 readEditMode 用同一把键（不带 visible 前缀）：读写的键不一致，
        // 开关就永远不会被记住 —— 刷新一次又回到默认值。
        writeNumber(EDIT_MODE_KEY, enabled ? 1 : 0);
        set({ chromeEditMode: enabled });
    },
    handleResetOffset: (target) => {
        const targets = target ? [target] : WALL_CHROME_OFFSET_TARGETS;
        for (const key of targets) {
            writeNumber(offsetKey(key, 'x'), 0);
            writeNumber(offsetKey(key, 'y'), 0);
        }
        set(state => {
            const next = { ...state.offsets };
            for (const key of targets) next[key] = { x: 0, y: 0 };
            return { offsets: next };
        });
    },
    handleResetScale: () => {
        writeNumber(SCALE_KEY, WALL_CHROME_SCALE_DEFAULT_PERCENT);
        if (get().scale === WALL_CHROME_SCALE_DEFAULT_PERCENT) return;
        set({ scale: WALL_CHROME_SCALE_DEFAULT_PERCENT });
    },
}));

/** 取某一组偏移；未设置过就是 0/0。给组件做 selector 用。 */
export const selectWallChromeOffset = (
    state: WallChromeOffsetStoreState,
    target: WallChromeOffsetTarget,
): WallChromeOffset => state.offsets[target];

/** 取四颗按钮共用的缩放；未设置过就是 100。 */
export const selectWallChromeScale = (
    state: WallChromeOffsetStoreState,
): number => state.scale;

/** 把百分比换算成实际像素尺寸（四舍五入，避免亚像素导致的模糊）。 */
export const scaledPx = (basePx: number, percent: number): number =>
    Math.max(1, Math.round((basePx * percent) / 100));
