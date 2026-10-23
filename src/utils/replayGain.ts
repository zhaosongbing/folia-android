import type { ReplayGainInfo, ReplayGainMode } from '../types';

// src/utils/replayGain.ts

export interface ReplayGainCalculation {
    gainDb: number;
    effectiveGainDb: number;
    peak?: number;
    linearGain: number;
}

export const toFiniteNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value !== 'string' || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};

export const decibelsToLinearPeak = (decibels: unknown): number | undefined => {
    const value = toFiniteNumber(decibels);
    return value === undefined ? undefined : Math.pow(10, value / 20);
};

// Selects the requested mode, applies album-to-track fallback, and prevents positive gain from clipping.
export const calculateReplayGain = (
    replayGain: ReplayGainInfo | null | undefined,
    mode: ReplayGainMode,
): ReplayGainCalculation => {
    if (!replayGain || mode === 'off') {
        return { gainDb: 0, effectiveGainDb: 0, linearGain: 1 };
    }

    const gainDb = mode === 'album'
        ? toFiniteNumber(replayGain.albumGain) ?? toFiniteNumber(replayGain.trackGain) ?? 0
        : toFiniteNumber(replayGain.trackGain) ?? 0;
    const peak = mode === 'album'
        ? toFiniteNumber(replayGain.albumPeak) ?? toFiniteNumber(replayGain.trackPeak)
        : toFiniteNumber(replayGain.trackPeak);

    let effectiveGainDb = gainDb;
    if (gainDb > 0) {
        if (peak !== undefined && peak > 0) {
            // 有峰值：把增益限制到「放大后峰值刚好不超满刻度」。
            const clipSafeGainDb = -20 * Math.log10(peak);
            effectiveGainDb = Math.min(gainDb, clipSafeGainDb);
        } else {
            // 没有峰值：不做正向放大。峰值是判断「放大了会不会削波」的唯一依据，
            // 缺了它就无法知道这条轨离满刻度还有多远 —— 网易云只给 gain、不给 peak，
            // 之前这种轨的 +N dB 是直接照搬的，叠上均衡器与效果链就是用户听到的破音。
            // 衰减（负增益）永远安全，照常生效；只牺牲「小音量轨被响度归一化抬上来」这一点。
            effectiveGainDb = 0;
        }
    }

    return {
        gainDb,
        effectiveGainDb,
        peak,
        linearGain: Math.pow(10, effectiveGainDb / 20),
    };
};
