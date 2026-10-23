import { describe, expect, it } from 'vitest';
import { calculateReplayGain } from '../../src/utils/replayGain';

// ReplayGain 的增益选择。重点是「正向增益必须有削波保护」这条：
// 没有峰值信息时不放大（网易云只给 gain、不给 peak），否则 +N dB 直接照搬会削波，就是破音。

describe('calculateReplayGain', () => {
    it('returns unity when the mode is off', () => {
        const result = calculateReplayGain({ trackGain: 6, trackPeak: 0.5 }, 'off');
        expect(result.linearGain).toBe(1);
        expect(result.effectiveGainDb).toBe(0);
    });

    it('returns unity when there is no replay gain at all', () => {
        expect(calculateReplayGain(undefined, 'track').linearGain).toBe(1);
        expect(calculateReplayGain(null, 'album').linearGain).toBe(1);
    });

    it('applies attenuation as given', () => {
        const result = calculateReplayGain({ trackGain: -8 }, 'track');
        expect(result.effectiveGainDb).toBe(-8);
        expect(result.linearGain).toBeCloseTo(Math.pow(10, -8 / 20), 6);
    });

    it('lowers a positive gain to what the peak allows', () => {
        // 峰值 0.5（-6.02 dBFS）时，+8 dB 会把峰值推到约 2.0；只能放到 +6.02 dB。
        const result = calculateReplayGain({ trackGain: 8, trackPeak: 0.5 }, 'track');
        expect(result.gainDb).toBe(8);
        expect(result.effectiveGainDb).toBeCloseTo(-20 * Math.log10(0.5), 6);
        expect(result.linearGain * 0.5).toBeCloseTo(1, 6);
    });

    it('leaves a positive gain alone when the peak has room for it', () => {
        // 峰值 0.5 时 +6 dB 是安全的（峰值到 0.998），不该被削到更低。
        const result = calculateReplayGain({ trackGain: 6, trackPeak: 0.5 }, 'track');
        expect(result.effectiveGainDb).toBe(6);
    });

    it('does not boost when the peak is unknown', () => {
        const result = calculateReplayGain({ trackGain: 6 }, 'track');
        expect(result.gainDb).toBe(6);
        expect(result.effectiveGainDb).toBe(0);
        expect(result.linearGain).toBe(1);
    });

    it('does not boost when the peak is zero or missing on album mode too', () => {
        expect(calculateReplayGain({ albumGain: 4, albumPeak: 0 }, 'album').effectiveGainDb).toBe(0);
        expect(calculateReplayGain({ albumGain: 4 }, 'album').effectiveGainDb).toBe(0);
    });

    it('falls back from album gain to track gain', () => {
        const result = calculateReplayGain({ trackGain: -3, trackPeak: 0.9 }, 'album');
        expect(result.gainDb).toBe(-3);
        expect(result.effectiveGainDb).toBe(-3);
    });
});
