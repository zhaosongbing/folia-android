import { describe, expect, it } from 'vitest';
import { resolveChromeMargins, resolveChromeSnapDelta } from '../../src/utils/wallChromeSnap';

// 编辑态「贴边 / 居中」的位移计算。纯算术，最容易在边界上出错（右/下用的是「视口减右边缘」）。

const viewport = { width: 412, height: 915 };
const box = { left: 100, top: 200, width: 40, height: 40 };

describe('resolveChromeSnapDelta', () => {
    it('snaps to the left edge', () => {
        expect(resolveChromeSnapDelta('left', box, viewport)).toEqual({ dx: -100, dy: 0 });
    });

    it('snaps to the right edge', () => {
        // 右边缘 140，视口 412 → 还要右移 272
        expect(resolveChromeSnapDelta('right', box, viewport)).toEqual({ dx: 272, dy: 0 });
    });

    it('snaps to the top edge', () => {
        expect(resolveChromeSnapDelta('top', box, viewport)).toEqual({ dx: 0, dy: -200 });
    });

    it('snaps to the bottom edge', () => {
        // 下边缘 240，视口 915 → 还要下移 675
        expect(resolveChromeSnapDelta('bottom', box, viewport)).toEqual({ dx: 0, dy: 675 });
    });

    it('centres horizontally', () => {
        // 框中心 120，视口中心 206 → 右移 86
        expect(resolveChromeSnapDelta('centerX', box, viewport)).toEqual({ dx: 86, dy: 0 });
    });

    it('centres vertically', () => {
        // 框中心 220，视口中心 457.5 → 下移 237.5，四舍五入 238
        expect(resolveChromeSnapDelta('centerY', box, viewport)).toEqual({ dx: 0, dy: 238 });
    });

    it('honours the margin for edge snaps', () => {
        expect(resolveChromeSnapDelta('left', box, viewport, 16)).toEqual({ dx: -84, dy: 0 });
        expect(resolveChromeSnapDelta('right', box, viewport, 16)).toEqual({ dx: 256, dy: 0 });
        expect(resolveChromeSnapDelta('top', box, viewport, 8)).toEqual({ dx: 0, dy: -192 });
        expect(resolveChromeSnapDelta('bottom', box, viewport, 8)).toEqual({ dx: 0, dy: 667 });
    });

    it('is a no-op when the box already sits on the edge', () => {
        const atLeft = { left: 0, top: 0, width: 40, height: 40 };
        expect(resolveChromeSnapDelta('left', atLeft, viewport)).toEqual({ dx: 0, dy: 0 });
        expect(resolveChromeSnapDelta('top', atLeft, viewport)).toEqual({ dx: 0, dy: 0 });
    });
});

describe('resolveChromeMargins', () => {
    it('reads the four distances to the viewport edges', () => {
        expect(resolveChromeMargins(box, viewport)).toEqual({
            left: 100,
            top: 200,
            right: 272,
            bottom: 675,
        });
    });

    it('rounds sub-pixel boxes', () => {
        expect(resolveChromeMargins({ left: 10.4, top: 20.6, width: 40.2, height: 40.2 }, viewport)).toEqual({
            left: 10,
            top: 21,
            right: 361,
            bottom: 854,
        });
    });
});
