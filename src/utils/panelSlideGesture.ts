// src/utils/panelSlideGesture.ts
// 侧边面板切换按钮那个「向左滑打开命令面板」手势的几何常量。
//
// 抽出来只有一个理由：思索教程的场景脚本要照着这几个数演示这条手势，而脚本和实现分居两地。
// 数字留在 UnifiedPanel 里的话，改了手势而教程还在演旧的，不会有任何测试失败 —— 教程会
// 无声地教错。让两边 import 同一份常量，改一处两处一起动。

/** 按住往左拖的夹紧上限，px。超过这个距离按钮不再跟手。 */
export const PANEL_SLIDE_CLAMP_PX = 44;

/** 触发阈值，px。拖够这么远松手（或拖到就直接触发）即打开命令面板。 */
export const PANEL_SLIDE_TRIGGER_PX = 36;

/** 滑轨常态宽度，px。等于按钮自身宽度，看起来就是「按钮本身」。 */
export const PANEL_SLIDE_TRACK_BASE_PX = 48;

/** 滑轨完全展开后的宽度，px。 */
export const PANEL_SLIDE_TRACK_FULL_PX = 96;

/**
 * 右侧按钮「长按后向右滑打开播放列表」手势。
 *
 * 为什么要长按前置：右滑在播放页没有任何既有含义，不设门槛的话，拇指从左往右划过按钮
 * （比如去拖进度条）就会误开列表。长按 450ms 是一个明确的「我要用手势」的声明，
 * 和双击手势的避让窗口取同一个量级。
 */
export const PANEL_HANDLE_LONG_PRESS_MS = 450;

/** 长按成立后，向右拖够这么远即打开播放列表。阈值与左滑触发阈值取同一个数。 */
export const PANEL_HANDLE_QUEUE_TRIGGER_PX = PANEL_SLIDE_TRIGGER_PX;

/** 手势位移容差：超过就算「动过了」，此时松手不再当作点击（否则长按后小幅度拖动会误开关面板）。 */
export const PANEL_HANDLE_GESTURE_MOVE_SLOP_PX = 12;

/**
 * 这一次移动是否满足「长按已成立 + 向右拖过阈值 + 水平方向占优」。
 *
 * 水平占优的判据和左滑那条保持一致（`|dx| > |dy| * 1.2`）：斜着拖不算横向滑动，
 * 两条手势用同一个判据，才不会出现「往左下拖触发命令面板、往右上拖触发列表」这种割裂感。
 */
export const shouldOpenQueueFromSlide = (
    deltaX: number,
    deltaY: number,
    longPressed: boolean,
): boolean => (
    longPressed
    && deltaX >= PANEL_HANDLE_QUEUE_TRIGGER_PX
    && Math.abs(deltaX) > Math.abs(deltaY) * 1.2
);

