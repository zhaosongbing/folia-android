// test/unit/doubleTapGesture.test.ts
// 播放页双击手势的判定逻辑：区域划分、交界归属、双击窗口与跨区丢弃。
// 这些数值是需求里明确要看住的东西，所以逐条钉在用例里，改动常量时这里会立刻失败。

import { describe, expect, it } from 'vitest';
import {
    DOUBLE_TAP_LEFT_RATIO,
    DOUBLE_TAP_RIGHT_RATIO,
    DOUBLE_TAP_SLOP_PX,
    DOUBLE_TAP_WINDOW_MS,
    TAP_MOVE_SLOP_PX,
    isTapMovement,
    registerTap,
    resolveDoubleTapZone,
    zoneAtPoint,
    type TapRecord,
} from '../../src/components/app/playback/doubleTapGesture';

const tap = (time: number, x: number, y = 500): TapRecord => ({
    time,
    x,
    y,
    zone: resolveDoubleTapZone(x / 1000),
});

describe('区域划分', () => {
    it('左右各占 30%，中间 40%', () => {
        expect(DOUBLE_TAP_LEFT_RATIO).toBe(0.3);
        expect(DOUBLE_TAP_RIGHT_RATIO).toBe(0.7);
    });

    it('按比例映射到三个区域', () => {
        expect(resolveDoubleTapZone(0)).toBe('prev');
        expect(resolveDoubleTapZone(0.15)).toBe('prev');
        expect(resolveDoubleTapZone(0.5)).toBe('toggle');
        expect(resolveDoubleTapZone(0.85)).toBe('next');
        expect(resolveDoubleTapZone(1)).toBe('next');
    });

    it('两条交界线各自只有一个归属：0.3 与 0.7 都归中区', () => {
        expect(resolveDoubleTapZone(0.3)).toBe('toggle');
        expect(resolveDoubleTapZone(0.7)).toBe('toggle');
    });

    it('交界前后一档分别属于左右区', () => {
        expect(resolveDoubleTapZone(0.2999)).toBe('prev');
        expect(resolveDoubleTapZone(0.3001)).toBe('toggle');
        expect(resolveDoubleTapZone(0.6999)).toBe('toggle');
        expect(resolveDoubleTapZone(0.7001)).toBe('next');
    });

    it('异常输入按中区处理，不抛错', () => {
        expect(resolveDoubleTapZone(Number.NaN)).toBe('toggle');
        expect(resolveDoubleTapZone(Number.POSITIVE_INFINITY)).toBe('toggle');
        expect(resolveDoubleTapZone(-1)).toBe('prev');
    });

    it('按元素矩形换算坐标：1000px 宽的屏上 300 / 700 是两条交界', () => {
        const rect = { left: 0, width: 1000 };
        expect(zoneAtPoint(299, rect)).toBe('prev');
        expect(zoneAtPoint(300, rect)).toBe('toggle');
        expect(zoneAtPoint(700, rect)).toBe('toggle');
        expect(zoneAtPoint(701, rect)).toBe('next');
    });

    it('矩形有左边距时按相对位置算', () => {
        const rect = { left: 200, width: 1000 };
        expect(zoneAtPoint(499, rect)).toBe('prev');   // (499-200)/1000 = 0.299
        expect(zoneAtPoint(500, rect)).toBe('toggle'); // 0.3
        expect(zoneAtPoint(1001, rect)).toBe('next');  // 0.801
    });

    it('未布局（宽度为 0）时按中区', () => {
        expect(zoneAtPoint(120, { left: 0, width: 0 })).toBe('toggle');
        expect(zoneAtPoint(Number.NaN, { left: 0, width: 1000 })).toBe('toggle');
    });
});

describe('双击状态机', () => {
    it('第一次点击只记下来，不触发', () => {
        const result = registerTap(null, tap(1000, 150));
        expect(result.triggered).toBe(false);
        expect(result.zone).toBe('prev');
        expect(result.next).not.toBeNull();
    });

    it('窗口内同一区域再点一次即触发', () => {
        const first = registerTap(null, tap(1000, 500));
        const second = registerTap(first.next, tap(1000 + DOUBLE_TAP_WINDOW_MS, 505));
        expect(second.triggered).toBe(true);
        expect(second.zone).toBe('toggle');
        // 触发后清空，避免三连击再触发第二次
        expect(second.next).toBeNull();
    });

    it('超出窗口不触发', () => {
        const first = registerTap(null, tap(1000, 500));
        const second = registerTap(first.next, tap(1000 + DOUBLE_TAP_WINDOW_MS + 1, 500));
        expect(second.triggered).toBe(false);
        expect(second.next).not.toBeNull();
    });

    it('落点偏差超过容差不算双击', () => {
        const first = registerTap(null, tap(1000, 500));
        const second = registerTap(first.next, tap(1050, 500 + DOUBLE_TAP_SLOP_PX + 1));
        expect(second.triggered).toBe(false);
    });

    it('两次点击落在不同区域不触发，且第二次成为新的第一次', () => {
        const first = registerTap(null, tap(1000, 200)); // prev
        const second = registerTap(first.next, tap(1050, 500)); // toggle
        expect(second.triggered).toBe(false);
        expect(second.zone).toBe('toggle');
        // 新记录已经换成第二次点击，紧接着再点一次中区就能成立
        const third = registerTap(second.next, tap(1100, 505));
        expect(third.triggered).toBe(true);
        expect(third.zone).toBe('toggle');
    });

    it('三连击只算一次双击', () => {
        const first = registerTap(null, tap(1000, 100));
        const second = registerTap(first.next, tap(1050, 100));
        expect(second.triggered).toBe(true);
        const third = registerTap(second.next, tap(1100, 100));
        expect(third.triggered).toBe(false);
    });

    it('跨交界线连点（左区 → 中区）不会切歌', () => {
        const rect = { left: 0, width: 1000 };
        const a = { time: 1000, x: 295, y: 400, zone: zoneAtPoint(295, rect) };
        const b = { time: 1030, x: 305, y: 400, zone: zoneAtPoint(305, rect) };
        expect(a.zone).toBe('prev');
        expect(b.zone).toBe('toggle');
        const result = registerTap(a, b);
        expect(result.triggered).toBe(false);
    });
});

describe('拖拽排除', () => {
    it('位移在容差内算点击', () => {
        expect(isTapMovement({ x: 100, y: 100 }, { x: 100, y: 100 })).toBe(true);
        expect(isTapMovement({ x: 100, y: 100 }, { x: 100 + TAP_MOVE_SLOP_PX, y: 100 })).toBe(true);
    });

    it('位移超出容差算拖拽', () => {
        expect(isTapMovement({ x: 100, y: 100 }, { x: 100 + TAP_MOVE_SLOP_PX + 1, y: 100 })).toBe(false);
        expect(isTapMovement({ x: 100, y: 100 }, { x: 100, y: 100 + TAP_MOVE_SLOP_PX + 1 })).toBe(false);
    });
});
