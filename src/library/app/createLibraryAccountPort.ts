import type { RefObject } from 'react';
import { PlayerState, type LyricData } from '../../types';
import type { OnlineProviderId } from '../../types/onlineMusic';
import type { LibraryProviderSwitchCleanupPort } from '../core/account/account.contract';
import { usePlaybackStore } from '../../stores/usePlaybackStore';
import { useSearchNavigationStore } from '../../stores/useSearchNavigationStore';
import { useCollectionNavigationStore } from '../../stores/useCollectionNavigationStore';
import { clearPrefetchRuntime } from '../../services/prefetchService';
import { clearTrackProfileRuntime } from '../../services/automix/profileService';
import { dropPlaysInFlight, makeSongCurrent } from '../../components/app/playback/currentSong';
import { forgetPlaybackCache } from '../../components/app/playback/persistPlaybackCache';

// src/library/app/createLibraryAccountPort.ts
// 在线账户 controller 的播放器端口（照 createLibraryHomePort 的做法）：平台换了时清空播放器——切到别的平台
// （用户同意之后、controller 写新的当前平台之前），和退出当前平台（用户答应的那一刻），两处一样地清。
// 播放器的 DOM 与 automix 句柄只有 App 持有，经 getHost 现读；播放状态读写都走 usePlaybackStore 的最新值。

/** App 持有、端口按调用现读的播放器句柄。 */
export type LibraryAccountSwitchHost = {
    audioRef: RefObject<HTMLAudioElement | null>;
    automixRef: RefObject<{ abortTransition: () => void } | null>;
    shouldAutoPlay: RefObject<boolean>;
    /** App 的歌词写入（带过滤设置的那一个；清空时只传 null）。 */
    setLyrics: (lyrics: LyricData | null) => void;
    setIsLyricsLoading: (loading: boolean) => void;
};

/** 清空会不会拿走东西：播放器里有正在放的歌，或者队列里有歌。 */
export const playerHoldsSongs = (): boolean => {
    const { currentSong, playQueue } = usePlaybackStore.getState();
    return currentSong !== null || playQueue.length > 0;
};

/**
 * 换到另一个平台：播放器和队列原地不动，只把「属于这个平台视角的东西」换掉
 * —— 搜索运行时（结果跟着新平台重新搜）、集合导航栈（打开着的旧平台歌单没有意义了）、
 * 以及私人 FM 模式（那是旧平台的推荐流）。
 *
 * 为什么不再清空队列：队列里的每一首歌播放地址在入队时就已经解析好了，换平台不影响能不能放；
 * 把用户攒了半天的队列删掉，只因为去另一个平台看了一眼，是纯损失。队列融合之后，
 * 一个队列里混着几个平台的歌是正常的，播放页与队列行按每首歌自己的 sourceRef 显示来源。
 */
export const retargetPlayerForProviderChange = (
    host: LibraryAccountSwitchHost,
    nextProviderId: OnlineProviderId,
): void => {
    const playback = usePlaybackStore.getState();
    // FM 是旧平台的推荐流：关掉模式，但已经排进来的歌留在队列里。
    if (playback.isFmMode) playback.setIsFmMode(false);
    useSearchNavigationStore.getState().resetRuntime(nextProviderId);
    useCollectionNavigationStore.getState().clear();
    // 记一次，出问题时能从日志看出换平台之后队列被保留了。
    console.info(`[ProviderChange] queue kept across the switch (${playback.playQueue.length} songs, search follows ${nextProviderId})`);
};

/**
 * 停掉声音，清掉歌、队列、歌词、封面、FM 模式和缓存，再重置搜索与集合导航；搜索之后跟着 `nextProviderId`。
 */
export const emptyPlayerForProviderChange = (host: LibraryAccountSwitchHost, nextProviderId: OnlineProviderId): void => {
    const playback = usePlaybackStore.getState();
    // Stops any deck still fading out in the background: this path clears the active deck
    // only, and a tail left running would have no control pointing at it any more.
    host.automixRef.current?.abortTransition();
    const audio = host.audioRef.current;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    if (playback.audioSrc?.startsWith('blob:')) URL.revokeObjectURL(playback.audioSrc);
    playback.setAudioSrc(null);
    // A play of the old platform that is still fetching its address must not bring its song back.
    dropPlaysInFlight();
    makeSongCurrent(null);
    playback.setPlayQueue([]);
    // The saved session goes too: the next launch would bring the old platform's song back, and a
    // switch after it would ask again about a player this emptying already cleared.
    void forgetPlaybackCache();
    host.setLyrics(null);
    playback.setCachedCoverUrl(null);
    playback.setIsFmMode(false);
    // A load that this cuts short never clears these two itself.
    host.setIsLyricsLoading(false);
    host.shouldAutoPlay.current = false;
    playback.setPlayerState(PlayerState.IDLE);
    clearPrefetchRuntime();
    // The measurements are keyed by playback key, so the outgoing provider's are unreachable
    // from here on. Dropped alongside the prefetch cache they were gathered with, rather than
    // sitting in memory until the tab is closed.
    clearTrackProfileRuntime();
    useSearchNavigationStore.getState().resetRuntime(nextProviderId);
    useCollectionNavigationStore.getState().clear();
    console.info(`[ProviderChange] the player was emptied (search follows ${nextProviderId})`);
};

export const createLibraryAccountSwitchCleanupPort = (
    getHost: () => LibraryAccountSwitchHost,
): LibraryProviderSwitchCleanupPort => ({
    holdsSongs: playerHoldsSongs,
    // 换平台保留队列（见 retargetPlayerForProviderChange）；退出登录仍然清空。
    keepsQueueOnSwitch: () => true,
    resetForProviderSwitch: (nextProviderId: OnlineProviderId, previousProviderId: OnlineProviderId) => {
        if (nextProviderId !== previousProviderId) {
            retargetPlayerForProviderChange(getHost(), nextProviderId);
            return;
        }
        emptyPlayerForProviderChange(getHost(), nextProviderId);
    },
});
