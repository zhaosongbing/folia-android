// test/unit/longPressGesture.test.ts
// 播放页长按手势的判定：什么情况下该启动长按定时器。
// 核心是避让双击——两条手势共用同一层 surface，长按误启动会让「双击切歌」先弹出播放列表。

import { describe, expect, it } from 'vitest';
import {
    LONG_PRESS_AVOID_DOUBLE_TAP_MS,
    LONG_PRESS_DURATION_MS,
    LONG_PRESS_SLIDE_TRIGGER_PX,
    resolveLongPressSlide,
    shouldStartLongPressOnDown,
} from '../../src/components/app/playback/longPressGesture';

describe('长按启动判定', () => {
    it('常量取值', () => {
        expect(LONG_PRESS_DURATION_MS).toBe(450);
        expect(LONG_PRESS_AVOID_DOUBLE_TAP_MS).toBe(500);
    });

    it('第一次按下必然启动长按', () => {
        expect(shouldStartLongPressOnDown(null, 1000)).toBe(true);
    });

    it('与上次按下间隔够远才启动', () => {
        expect(shouldStartLongPressOnDown(1000, 1000 + LONG_PRESS_AVOID_DOUBLE_TAP_MS + 1)).toBe(true);
        expect(shouldStartLongPressOnDown(1000, 5000)).toBe(true);
    });

    it('处在双击序列里不启动', () => {
        // 双击窗口是 320ms，这里用更宽的 500ms 兜底：慢手的第二次点击也不算长按
        expect(shouldStartLongPressOnDown(1000, 1000 + 320)).toBe(false);
        expect(shouldStartLongPressOnDown(1000, 1000 + LONG_PRESS_AVOID_DOUBLE_TAP_MS)).toBe(false);
        expect(shouldStartLongPressOnDown(1000, 1001)).toBe(false);
    });

    it('间隔正好等于避让阈值时不启动（严格大于才启动）', () => {
        expect(shouldStartLongPressOnDown(0, LONG_PRESS_AVOID_DOUBLE_TAP_MS)).toBe(false);
        expect(shouldStartLongPressOnDown(0, LONG_PRESS_AVOID_DOUBLE_TAP_MS + 1)).toBe(true);
    });
});

describe('长按后的滑动方向判定', () => {
    it('常量与右侧按钮的滑动阈值一致', () => {
        expect(LONG_PRESS_SLIDE_TRIGGER_PX).toBe(36);
    });

    it('向左滑过阈值判为左（命令面板）', () => {
        expect(resolveLongPressSlide(-LONG_PRESS_SLIDE_TRIGGER_PX, 0)).toBe('left');
        expect(resolveLongPressSlide(-200, 0)).toBe('left');
    });

    it('向右滑过阈值判为右（播放列表）', () => {
        expect(resolveLongPressSlide(LONG_PRESS_SLIDE_TRIGGER_PX, 0)).toBe('right');
        expect(resolveLongPressSlide(200, 0)).toBe('right');
    });

    it('没滑够阈值不判定，长按仍然只等松手', () => {
        expect(resolveLongPressSlide(LONG_PRESS_SLIDE_TRIGGER_PX - 1, 0)).toBeNull();
        expect(resolveLongPressSlide(0, 0)).toBeNull();
        expect(resolveLongPressSlide(-LONG_PRESS_SLIDE_TRIGGER_PX + 1, 0)).toBeNull();
    });

    it('斜向拖动不算横向滑动，和右侧按钮同一个判据', () => {
        // 纵向分量是横向的 2 倍：|dx| > |dy| * 1.2 不成立
        expect(resolveLongPressSlide(80, 160)).toBeNull();
        expect(resolveLongPressSlide(-80, 160)).toBeNull();
        // 纵向分量远小，算横向
        expect(resolveLongPressSlide(80, 10)).toBe('right');
        expect(resolveLongPressSlide(-80, 10)).toBe('left');
    });

    it('左右两个方向互斥：同一次位移只有一个结果', () => {
        for (const dx of [-200, -40, 0, 40, 200]) {
            const direction = resolveLongPressSlide(dx, 0);
            expect(direction === null || direction === 'left' || direction === 'right').toBe(true);
            if (dx < -LONG_PRESS_SLIDE_TRIGGER_PX) expect(direction).toBe('left');
            if (dx > LONG_PRESS_SLIDE_TRIGGER_PX) expect(direction).toBe('right');
        }
    });
});
