// test/unit/panelHandleSlideGesture.test.ts
// 右侧按钮「长按后向右滑打开播放列表」的判定，以及它和「向左滑打开命令面板」的边界。
// 两条手势共用同一个按钮，判定函数分属不同文件，所以并成一个用例文件对照着看。

import { describe, expect, it } from 'vitest';
import {
    PANEL_HANDLE_GESTURE_MOVE_SLOP_PX,
    PANEL_HANDLE_LONG_PRESS_MS,
    PANEL_HANDLE_QUEUE_TRIGGER_PX,
    PANEL_SLIDE_TRIGGER_PX,
    shouldOpenQueueFromSlide,
} from '../../src/utils/panelSlideGesture';

describe('右侧按钮长按右滑手势', () => {
    it('常量取值：右滑阈值与左滑取同一个数', () => {
        expect(PANEL_HANDLE_LONG_PRESS_MS).toBe(450);
        expect(PANEL_HANDLE_QUEUE_TRIGGER_PX).toBe(PANEL_SLIDE_TRIGGER_PX);
        expect(PANEL_HANDLE_GESTURE_MOVE_SLOP_PX).toBe(12);
    });

    it('长按未成立时不触发，防止拇指划过按钮误开列表', () => {
        expect(shouldOpenQueueFromSlide(60, 0, false)).toBe(false);
        expect(shouldOpenQueueFromSlide(200, 0, false)).toBe(false);
    });

    it('长按成立且向右拖过阈值即触发', () => {
        expect(shouldOpenQueueFromSlide(PANEL_HANDLE_QUEUE_TRIGGER_PX, 0, true)).toBe(true);
        expect(shouldOpenQueueFromSlide(120, 0, true)).toBe(true);
    });

    it('差一点没拖到不触发', () => {
        expect(shouldOpenQueueFromSlide(PANEL_HANDLE_QUEUE_TRIGGER_PX - 1, 0, true)).toBe(false);
    });

    it('向左拖不触发右滑（那是命令面板的地盘）', () => {
        expect(shouldOpenQueueFromSlide(-60, 0, true)).toBe(false);
        expect(shouldOpenQueueFromSlide(-120, 0, true)).toBe(false);
    });

    it('斜向拖动不算横向滑动，和左滑用同一个判据', () => {
        // 纵向分量是横向的 2 倍，|dx| > |dy| * 1.2 不成立
        expect(shouldOpenQueueFromSlide(80, 160, true)).toBe(false);
        // 纵向分量远小，算横向
        expect(shouldOpenQueueFromSlide(80, 10, true)).toBe(true);
    });

    it('两条手势的判定互不重叠：同一次位移不可能同时命中', () => {
        const dx = -40;
        const dy = 0;
        const slidesLeftForPalette = dx <= -PANEL_SLIDE_TRIGGER_PX && Math.abs(dx) > Math.abs(dy) * 1.2;
        const opensQueue = shouldOpenQueueFromSlide(dx, dy, true);
        expect(slidesLeftForPalette).toBe(true);
        expect(opensQueue).toBe(false);
    });
});
