// src/components/app/playback/longPressGesture.ts
// 播放页长按手势的纯判定逻辑。
//
// 长按和双击共用同一层 surface，所以这里最重要的一条是避让：进入双击序列后，
// 长按定时器不能启动，否则「双击切歌」会先弹出一个播放列表。
// 位移容差直接复用单击那一套（TAP_MOVE_SLOP_PX = 12px）：「按住不动」和「点一下」
// 对抖动的容忍度是同一种量级，分成两个常量只会让它们悄悄漂移。
//
// 长按成立之后还能再滑：向左打开命令面板，向右打开播放列表。判据和右侧按钮那条
// 滑动手势保持同一个口径（阈值 36px、横向须大于纵向 1.2 倍），两条手势的手感才一致。

/** 按住多久算长按。工程里 keyboard hold 用 400ms（ponderHoldProgress.ts），指针长按略放宽到 450ms。 */
export const LONG_PRESS_DURATION_MS = 450;
/**
 * 与上一次按下的间隔小于这个值，就认为处在双击序列里，不启动长按。
 * 双击窗口是 320ms，这里取 500ms 是为了把「慢手用户的第二次点击」也算进去。
 */
export const LONG_PRESS_AVOID_DOUBLE_TAP_MS = 500;
/** 长按成立后，横向拖够这么远即算一次滑动手势。与右侧按钮的滑动触发阈值取同一个数。 */
export const LONG_PRESS_SLIDE_TRIGGER_PX = 36;

/** 滑动手势的方向。 */
export type LongPressSlideDirection = 'left' | 'right';

/**
 * 这次按下该不该启动长按定时器。
 * `previousDownAt` 是上一次按下的时间戳，还没有则为 null（第一次按下必然启动）。
 */
export const shouldStartLongPressOnDown = (
    previousDownAt: number | null,
    now: number,
): boolean => (
    previousDownAt === null || now - previousDownAt > LONG_PRESS_AVOID_DOUBLE_TAP_MS
);

/**
 * 把一次位移解析成滑动手势方向，够不着阈值或斜着拖都返回 null。
 *
 * 横向占优的判据是 `|dx| > |dy| * 1.2`，和右侧按钮的左滑判定同源：斜着拖不算横向滑动，
 * 两条手势用同一个判据，才不会出现「往左下拖开命令面板、往右上滑开列表」这种割裂感。
 */
export const resolveLongPressSlide = (
    deltaX: number,
    deltaY: number,
): LongPressSlideDirection | null => {
    if (Math.abs(deltaX) < LONG_PRESS_SLIDE_TRIGGER_PX) return null;
    if (Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return null;
    return deltaX < 0 ? 'left' : 'right';
};
