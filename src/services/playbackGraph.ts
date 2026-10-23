import { connectAudioEqualizerGraph } from './audioEqualizerGraph';
import { createAudioEffectChain, type AudioEffectChain } from './audioEffects/effectChain';
import { createPlaybackLimiter } from './playbackLimiter';
import type { AudioEqualizerSettings } from '../utils/audioEqualizer';

// src/services/playbackGraph.ts
// The order the playback nodes are wired in, as one function so the order can be asserted.
//
// This lived inline in usePlaybackAudioBridge, where nothing could reach it: testing it meant
// rendering the hook, and the alternative - a test that rebuilds the same wiring - would have
// passed no matter what the hook did. The order matters enough to be worth reaching (see the
// volume note below), so it moved here and the hook now only owns the refs.

type BuildPlaybackGraphParams = {
    context: AudioContext;
    /** Where the mix lands. Everything downstream of here is per-listener, not per-track. */
    analyser: AnalyserNode;
    /** Wires both automix decks into the shared mix point. Returns false if a deck is missing. */
    connectDecks: (context: AudioContext, output: AudioNode) => boolean;
    equalizerNodesRef: { current: BiquadFilterNode[] };
    settings: AudioEqualizerSettings;
};

export type PlaybackGraph = {
    /** Playback volume. Ramped by syncOutputGain; nothing else may write it. */
    gainNode: GainNode;
    /**
     * Play/pause fade, unity at rest. Its own node because the volume node is rewritten by
     * syncOutputGain on every volume, mute and track start, and the deck gains belong to automix.
     * Owned by services/playbackFade; nothing else may write it.
     */
    fadeNode: GainNode;
    effectChain: AudioEffectChain;
    /** False when a deck was missing, so automix will stay idle. Audio still flows. */
    decksConnected: boolean;
};

export const buildPlaybackGraph = ({
    context,
    analyser,
    connectDecks,
    equalizerNodesRef,
    settings,
}: BuildPlaybackGraphParams): PlaybackGraph => {
    // The shared mix point. Both decks land here, so the equaliser and the analyser each exist
    // once and see the sum: the tone never steps mid-blend and the visualiser draws what is
    // actually being heard.
    const mixNode = context.createGain();
    const decksConnected = connectDecks(context, mixNode);

    // Keeps a stable seam between the equalizer bands and the effect chain.
    const equalizerOutput = context.createGain();
    connectAudioEqualizerGraph({
        context,
        input: mixNode,
        output: equalizerOutput,
        nodesRef: equalizerNodesRef,
        settings,
    });

    /**
     * Volume, and it sits AFTER the effects rather than at the mix point where it started.
     *
     * Three of the effects are absolute rather than relative, so a fader upstream of them changes
     * what they DO instead of how loud they are. Measured through the real chain with an
     * OfflineAudioContext, before and after this moved:
     *
     * - Vinyl noise is mixed into the chain OUTPUT, so upstream of it the fader never touched it
     *   at all: -51.9 dBFS of crackle at volume 1.00, 0.50 and 0.25 alike. Turning the music down
     *   turned the record hiss UP relative to it, 6 dB per halving, and there was no volume at
     *   which the crackle could be made quiet. Downstream: -51.8 / -57.9 / -64.0 dBFS.
     * - Bit crush quantizes on a fixed staircase, so its step is a fixed fraction of FULL scale.
     *   Fed an attenuated signal it eats a bigger share of it: one -12 dBFS tone came back at
     *   38.2 dB SNR at volume 1.00 but 25.8 dB at 0.25 - a bit depth that dropped by two bits
     *   because somebody moved a slider that is not its own. Downstream: 38.2 dB at every volume.
     * - Punch is a compressor with a fixed threshold, so quieter input simply stopped reaching it.
     *
     * With every effect neutral the two orders measure identically (82.6 dB SNR either way), so
     * this is inaudible to anyone who leaves the effects off.
     */
    const gainNode = context.createGain();
    const effectChain = createAudioEffectChain({
        context,
        input: equalizerOutput,
        output: gainNode,
        effects: settings.effects,
        enabled: settings.enabled,
    });

    // After the volume so the fade multiplies whatever level the listener chose, and before the
    // analyser so the visualiser fades with the sound.
    const fadeNode = context.createGain();
    gainNode.connect(fadeNode);

    /**
     * The last thing before the speaker: a soft limiter, so nothing upstream can hard-clip.
     *
     * Every stage upstream is allowed to push the signal past full scale - ReplayGain with no peak
     * to check against, an equaliser boosting several bands at once, the effects' makeup gain, two
     * decks summing during a blend - and `destination` answers that by clipping, which is the
     * "破音" people report. Below 0.95 of full scale this node is exactly the identity (WaveShaper
     * interpolates linearly between curve points, so the straight part stays straight); above it,
     * a tanh knee rounds the peaks off instead of squaring them.
     *
     * It sits after the volume and fade rather than at the mix point so that it also covers what
     * those two and the effects do, and before the analyser so the visualiser still draws the
     * signal that is actually heard.
     */
    const limiter = createPlaybackLimiter(context);
    fadeNode.connect(limiter.input);
    limiter.output.connect(analyser);
    analyser.connect(context.destination);

    // Once per audio context. Printed rather than assumed because the ORDER is the fix: if this
    // ever reads "volume" before "effects" again, the vinyl noise has stopped answering the
    // volume control and the bit crush has gone back to tracking it.
    console.log(
        '[AudioContext] graph: decks -> mix -> equaliser -> effects -> volume -> fade -> limiter -> analyser -> out'
        + ` (equaliser ${settings.enabled ? 'on' : 'flat'},`
        + ` noise ${settings.effects.noise}, crush ${settings.effects.crush}, punch ${settings.effects.punch})`,
    );

    return { gainNode, fadeNode, effectChain, decksConnected };
};
