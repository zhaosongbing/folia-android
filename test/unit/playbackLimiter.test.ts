import { describe, expect, it } from 'vitest';
import { buildPlaybackLimiterCurve, playbackLimiterInputAt } from '../../src/services/playbackLimiter';

// 主链路软限幅器的曲线形状。曲线是纯数组运算，不需要 AudioContext：
// 关键性质是「0.95 以下严格透明」「任何输入都不超过满刻度」「单调」。

const POINTS = 8192;
const curve = buildPlaybackLimiterCurve(POINTS);
const mid = (POINTS - 1) / 2;

/** 按真实输入电平查曲线输出（就近取样；曲线量程是 ±4 倍满刻度）。 */
const outputFor = (level: number) => {
    const normalized = ((level / 4) + 1) / 2;
    const index = Math.min(POINTS - 1, Math.max(0, Math.round(normalized * (POINTS - 1))));
    return curve[index];
};

describe('playback limiter curve', () => {
    it('passes signals below the knee through unchanged', () => {
        for (const level of [0.05, 0.2, 0.5, 0.9]) {
            expect(outputFor(level)).toBeCloseTo(level, 2);
            expect(outputFor(-level)).toBeCloseTo(-level, 2);
        }
    });

    it('is centred on zero', () => {
        // 8192 点时表是偶数长度，中心落在两个取样点之间：最近的一点对应 ±0.00049 的输入，
        // 所以这里量的是「中心附近确实是 0」而不是严格等于 0。
        expect(Math.abs(curve[Math.round(mid)])).toBeLessThan(1e-3);
    });

    it('never lets an overdriven signal past full scale', () => {
        for (const level of [1, 1.5, 2, 3, 4, -1, -2, -4]) {
            expect(Math.abs(outputFor(level))).toBeLessThanOrEqual(1);
        }
        // 表尾（±4 倍满刻度）贴着 1 但那是浮点上的渐近值，不是被削平的平台：
        expect(Math.abs(curve[POINTS - 1])).toBeGreaterThan(0.99);
    });

    it('keeps a smooth (not flat) top just above the knee', () => {
        // 0.95 到 1.5 之间输出必须是递增的，而不是一步到顶 —— 否则等于硬削波。
        const values = [0.96, 1.0, 1.1, 1.2, 1.4].map(outputFor);
        for (let index = 1; index < values.length; index += 1) {
            expect(values[index]).toBeGreaterThanOrEqual(values[index - 1]);
        }
        expect(values[0]).toBeLessThan(values[values.length - 1]);
    });

    it('is monotonic across the whole table', () => {
        for (let index = 1; index < POINTS; index += 1) {
            expect(curve[index]).toBeGreaterThanOrEqual(curve[index - 1] - 1e-6);
        }
    });

    it('has unity slope at rest', () => {
        const step = playbackLimiterInputAt(1, POINTS) - playbackLimiterInputAt(0, POINTS);
        const slopeAtRest = (curve[Math.round(mid) + 1] - curve[Math.round(mid)]) / step;
        expect(slopeAtRest).toBeCloseTo(1, 2);
    });
});
