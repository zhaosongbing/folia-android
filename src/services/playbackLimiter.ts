import { softLimit } from './automix/crossfadeGraph';

// src/services/playbackLimiter.ts
// 主播放链路上的「保险式」软限幅：整条链最后一步，进 destination 之前。
//
// 为什么需要它：链上每一级都可能把信号推过满刻度 ——
//   - ReplayGain 的峰值信息缺失时（网易云只给 gain，不给 peak）正向增益没有削波保护；
//   - 均衡器多个频段同时提升（10 段 × 最高 +12dB，某段可能累加出 +30dB）；
//   - 效果链的 punch 压缩给了 +3dB 补偿增益，drive 饱和也会抬高谐波；
//   - 交叉淡入淡出两端同时有声时，两轨相加本身就可能过 0dBFS。
// Web Audio 的 destination 只做硬削波：任何一级算过头，听到的就是「破音」。
// 这一级把超过 0.95 满刻度的样本用 tanh 平滑压住，0.95 以下严格是直通（identity）。
//
// 曲线与取值都复用 automix 的 softLimit（同一段实测依据见 crossfadeGraph 的注释）：
// 0.95 拐点以下是精确的直线（WaveShaper 在曲线点之间线性插值，直线进直线出），
// 拐点以上渐近到 1，任何输入都到不了满刻度 —— 因此不会硬削。
//
// WaveShaper 的曲线定义域只有 [-1, 1]，超出会打到表的端点（又是一次硬削）。
// 所以先乘 1/LIMIT_RANGE 把量程放大到 ±LIMIT_RANGE 倍，曲线按同一量程取样，
// 输出回到原量级。这是 crossfadeGraph 里 connectStemBus 用过的同一个办法。
//
// oversample 必须是 'none'：直通区占绝大多数样本，重采样会把那条直线弄弯。

/** 与 crossfadeGraph 的 LIMIT_RANGE 保持一致：曲线按 ±4 倍满刻度取样。 */
const LIMIT_RANGE = 4;
/** 8192 点足够让 0.95 以下的直线段在插值时保持笔直。 */
const CURVE_POINTS = 8192;

export type PlaybackLimiter = {
    input: GainNode;
    output: WaveShaperNode;
    dispose: () => void;
};

/**
 * 限幅器的转移曲线，按 ±LIMIT_RANGE 满刻度取样。
 *
 * 单独导出来是为了能在单测里核对形状：直线区必须与原信号一致，峰值必须够不到 1，
 * 两头必须单调 —— 这三条一坏，听到的就是「压不住」或者「整首歌被压暗」。
 */
export const buildPlaybackLimiterCurve = (points = CURVE_POINTS): Float32Array<ArrayBuffer> => {
    const curve = new Float32Array(points);
    for (let index = 0; index < points; index += 1) {
        // 曲线下标 i 对应归一化输入 [0,1] 映射到 [-1,1]，再乘 LIMIT_RANGE 还原成真实量级。
        curve[index] = softLimit(((index / (points - 1)) * 2 - 1) * LIMIT_RANGE);
    }
    return curve;
};

/** 曲线索引对应的真实输入电平（供测试与注释引用）。 */
export const playbackLimiterInputAt = (index: number, points = CURVE_POINTS): number =>
    ((index / (points - 1)) * 2 - 1) * LIMIT_RANGE;

export const createPlaybackLimiter = (context: AudioContext): PlaybackLimiter => {
    const shaper = context.createWaveShaper();
    shaper.curve = buildPlaybackLimiterCurve();
    shaper.oversample = 'none';

    const input = context.createGain();
    input.gain.value = 1 / LIMIT_RANGE;

    input.connect(shaper);

    return {
        input,
        output: shaper,
        dispose: () => {
            input.disconnect();
            shaper.disconnect();
        },
    };
};
