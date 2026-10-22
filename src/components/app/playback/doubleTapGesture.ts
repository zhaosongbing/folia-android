// src/components/app/playback/doubleTapGesture.ts
// 播放页双击手势的纯判定逻辑：区域划分、双击状态机。
//
// 之所以不直接用 DOM 的 dblclick / React 的 onDoubleClick：
// 1. 那个事件不带「两次点击是否落在同一区域」的概念，跨区域连点会被当成一次双击；
// 2. 拿不到可用于抑制单击副作用的时机（播放页根层已有「点一下关闭右侧面板」的 onClick）；
// 3. 双击窗口在触摸屏上比浏览器默认的 500ms 更该收紧，避免和换歌节奏打架。
//
// 本文件不碰 DOM、不读 React，全部是可单测的纯函数。

/** 双击落点所属的操作区。 */
export type DoubleTapZone = 'prev' | 'toggle' | 'next';

/**
 * 区域划分（按点击位置在播放页宽度上的比例 x/width）：
 *
 *   左区 [0, 0.30)      → 上一首
 *   中区 [0.30, 0.70]   → 播放 / 暂停
 *   右区 (0.70, 1]      → 下一首
 *
 * 边界归属：0.30 归中区，0.70 也归中区 —— 判定用严格小于 / 严格大于，
 * 所以左中、中右两条交界线各自只有一个归属，不会出现「同一点命中两个区」。
 */
export const DOUBLE_TAP_LEFT_RATIO = 0.3;
export const DOUBLE_TAP_RIGHT_RATIO = 0.7;

/** 两次点击的最大间隔。浏览器默认 dblclick 窗口约 500ms，触摸上收紧到 320ms。 */
export const DOUBLE_TAP_WINDOW_MS = 320;
/** 两次点击落点允许的最大偏差，超过就不算同一次双击。 */
export const DOUBLE_TAP_SLOP_PX = 44;
/** 单次点击内部允许的最大位移，超过就当作拖拽而不是点击。 */
export const TAP_MOVE_SLOP_PX = 12;

/** 把比例映射到区域；NaN / 负宽度等异常一律按中区处理（最无害的一档）。 */
export const resolveDoubleTapZone = (ratio: number): DoubleTapZone => {
    if (!Number.isFinite(ratio)) return 'toggle';
    if (ratio < DOUBLE_TAP_LEFT_RATIO) return 'prev';
    if (ratio > DOUBLE_TAP_RIGHT_RATIO) return 'next';
    return 'toggle';
};

/** 把视口坐标 + 元素矩形换算成区域。宽度为 0（未布局）时按中区。 */
export const zoneAtPoint = (
    clientX: number,
    rect: { left: number; width: number },
): DoubleTapZone => {
    if (!Number.isFinite(clientX) || !Number.isFinite(rect.left) || !(rect.width > 0)) {
        return 'toggle';
    }
    return resolveDoubleTapZone((clientX - rect.left) / rect.width);
};

/** 一次已完成的点击（按下到抬起位移在容差内）。 */
export type TapRecord = {
    /** 事件时间戳，单位与 performance.now 一致 */
    time: number;
    x: number;
    y: number;
    zone: DoubleTapZone;
};

export type RegisterTapResult = {
    /** 本次点击是否凑成了双击 */
    triggered: boolean;
    /** 双击成立时该执行的区域；未成立时是本次点击自身所属区域 */
    zone: DoubleTapZone;
    /** 下一次点击要比对的上一条记录；双击成立后清空，避免三连击再触发一次 */
    next: TapRecord | null;
};

/**
 * 双击状态机：把已记录的上一次点击和本次点击比对。
 *
 * 四道条件同时满足才算双击：
 * 1. 间隔不超过 DOUBLE_TAP_WINDOW_MS；
 * 2. 横向偏差不超过 DOUBLE_TAP_SLOP_PX；
 * 3. 纵向偏差不超过 DOUBLE_TAP_SLOP_PX；
 * 4. **两次点击在同一区域** —— 跨区域连点不算双击，并把本次当作新的第一次，
 *    这样用户在交界线附近误触时，不会莫名其妙地切歌。
 */
export const registerTap = (
    last: TapRecord | null,
    current: TapRecord,
): RegisterTapResult => {
    if (last) {
        const withinTime = current.time - last.time <= DOUBLE_TAP_WINDOW_MS;
        const withinX = Math.abs(current.x - last.x) <= DOUBLE_TAP_SLOP_PX;
        const withinY = Math.abs(current.y - last.y) <= DOUBLE_TAP_SLOP_PX;
        const sameZone = last.zone === current.zone;
        if (withinTime && withinX && withinY && sameZone) {
            return { triggered: true, zone: current.zone, next: null };
        }
    }
    return { triggered: false, zone: current.zone, next: current };
};

/** 按下到抬起的位移是否仍在「这算一次点击」的范围内。 */
export const isTapMovement = (
    from: { x: number; y: number },
    to: { x: number; y: number },
): boolean => Math.hypot(to.x - from.x, to.y - from.y) <= TAP_MOVE_SLOP_PX;
