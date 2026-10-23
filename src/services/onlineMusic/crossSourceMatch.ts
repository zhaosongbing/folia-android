import type { SongResult } from '../../types';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import { getOnlineMusicProvider, listOnlineMusicProviders, providerSupports } from './providerRegistry';
import { getProviderSongMetadata } from './songMetadata';
import { isSongUnavailable } from './songAvailability';

// src/services/onlineMusic/crossSourceMatch.ts
// 「这首在这儿放不了，去别家找同一首」。
//
// 只在播放失败、而且失败是「这首歌在这家放不了」时才问这里：下架、没有音频、地区限制、
// 会员/购买、只有试听。网络问题不换源 —— 换个平台也一样连不上。
//
// 匹配用的是标题 + 歌手，不是平台各自的 ID：同一首歌在两家平台上是两条互不相干的记录。
// 判定刻意保守：标题（去掉空格标点后）必须相同，而且歌手要重合或者时长几乎一样，
// 否则宁可不换 —— 换错一首比跳过一首更让人困惑。

/** 一次匹配的结果，连同它是从哪家找到的（用来给提示条）。 */
export type CrossSourceMatch = {
    song: SongResult;
    providerId: string;
    providerLabel: string;
};

/** 歌名：`name` 是所有平台共有的规范字段。 */
const formatName = (song: SongResult): string => (song.name || '').trim();

/** 归一化：小写、去掉括号里的补充说明、去掉所有非字母数字与汉字。 */
const normalize = (text: string): string => (
    text
        .toLowerCase()
        // 括号补充（Live / Remastered / 伴奏）不参与比较：同一首在不同平台的写法常常只差这些
        .replace(/[（(【\[].*?[)）】\]]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '')
);

const artistKeysOf = (song: SongResult): string[] => {
    const metadata = getProviderSongMetadata(song);
    const names = metadata.artists.map(artist => normalize(artist.name)).filter(Boolean);
    return names.length > 0 ? names : [normalize(metadata.album?.name || '')].filter(Boolean);
};

/**
 * 在别的平台找同一首歌。`excludeProviderId` 通常就是这首歌自己那家：
 * 自己家已经试过（getSongReplacement），这里要的是别家。
 */
export const findCrossSourceMatch = async (
    song: SongResult,
    excludeProviderId?: string,
): Promise<CrossSourceMatch | null> => {
    const source = getPlaybackSourceRef(song);
    if (source.kind !== 'online') return null;
    const skipProvider = excludeProviderId ?? String(source.providerId);

    const metadata = getProviderSongMetadata(song);
    const title = normalize(formatName(song));
    if (!title) return null;
    const artist = metadata.artists[0]?.name ?? '';
    const durationMs = metadata.durationMs;
    const query = [formatName(song), artist].filter(Boolean).join(' ').trim();
    if (!query) return null;

    const providers = listOnlineMusicProviders().filter(provider => (
        String(provider.id) !== skipProvider
        && providerSupports(provider, 'search')
        && providerSupports(provider, 'playback')
        && Boolean(provider.search)
        && (provider.getAvailability?.().configured ?? true)
    ));
    if (providers.length === 0) return null;

    const settled = await Promise.allSettled(
        providers.map(provider => provider.search!.searchSongs(query, 10, 0)),
    );

    let best: { song: SongResult; providerId: string; score: number } | null = null;

    settled.forEach((result, index) => {
        if (result.status !== 'fulfilled') return;
        const provider = providers[index];
        for (const candidate of result.value.items) {
            if (isSongUnavailable(candidate)) continue;
            const candidateTitle = normalize(formatName(candidate));
            if (candidateTitle !== title) continue;

            const candidateMetadata = getProviderSongMetadata(candidate);
            const candidateArtists = candidateMetadata.artists.map(item => normalize(item.name)).filter(Boolean);
            const wantedArtists = artistKeysOf(song);
            const artistOverlap = candidateArtists.some(name => wantedArtists.includes(name));
            const durationClose = durationMs > 0
                && candidateMetadata.durationMs > 0
                && Math.abs(candidateMetadata.durationMs - durationMs) <= 5000;

            // 标题已经完全相同，再要求歌手或时长至少一项对得上，避免同名不同曲。
            if (!artistOverlap && !durationClose) continue;

            const score = (artistOverlap ? 10 : 0) + (durationClose ? 4 : 0);
            if (!best || score > best.score) {
                best = { song: candidate, providerId: String(provider.id), score };
            }
        }
    });

    if (!best) return null;
    const chosen = best as { song: SongResult; providerId: string; score: number };
    const provider = getOnlineMusicProvider(chosen.providerId);
    return {
        song: chosen.song,
        providerId: chosen.providerId,
        providerLabel: provider?.shortName || provider?.displayName || chosen.providerId,
    };
};
