// src/utils/wallChromeSnap.ts
// 编辑态里「贴边 / 居中」的位移计算。纯函数，只吃矩形与视口，便于单测。
//
// 为什么要算「位移」而不是直接写绝对位置：浮层的实际位置由各自的定位方式（absolute 的
// right/bottom、fixed 的 right/top、流内的 relative）决定，唯一通用的表达就是「在当前位置上
// 再挪多少」—— 也就是写回 store 的偏移量叠加。

export type ChromeSnapTarget = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';

export type ChromeBox = { left: number; top: number; width: number; height: number };

export type ChromeSnapDelta = { dx: number; dy: number };

/**
 * 贴边 / 居中需要的位移（px，整数）。
 *
 * margin 是贴边后留出的空档：0 表示紧贴屏幕边缘；居中时用不到。
 * 返回的位移已经四舍五入，与拖动用的是同一套整数像素，避免亚像素导致的模糊。
 */
export const resolveChromeSnapDelta = (
    target: ChromeSnapTarget,
    box: ChromeBox,
    viewport: { width: number; height: number },
    margin = 0,
): ChromeSnapDelta => {
    const gap = Math.max(0, Math.round(margin));
    switch (target) {
        case 'left':
            return { dx: Math.round(gap - box.left), dy: 0 };
        case 'right':
            return { dx: Math.round(viewport.width - gap - (box.left + box.width)), dy: 0 };
        case 'top':
            return { dx: 0, dy: Math.round(gap - box.top) };
        case 'bottom':
            return { dx: 0, dy: Math.round(viewport.height - gap - (box.top + box.height)) };
        case 'centerX':
            return { dx: Math.round(viewport.width / 2 - (box.left + box.width / 2)), dy: 0 };
        case 'centerY':
            return { dx: 0, dy: Math.round(viewport.height / 2 - (box.top + box.height / 2)) };
        default:
            return { dx: 0, dy: 0 };
    }
};

/** 控件到视口四边的距离，编辑态里显示在选框旁边。 */
export const resolveChromeMargins = (
    box: ChromeBox,
    viewport: { width: number; height: number },
) => ({
    left: Math.round(box.left),
    top: Math.round(box.top),
    right: Math.round(viewport.width - (box.left + box.width)),
    bottom: Math.round(viewport.height - (box.top + box.height)),
});
