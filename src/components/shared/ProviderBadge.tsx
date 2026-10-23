import React from 'react';
import { omni } from '../../services/onlineMusic/omni';
import { getPlaybackSourceRef } from '../../utils/appPlaybackGuards';
import type { SongResult } from '../../types';

// src/components/shared/ProviderBadge.tsx
// 一首在线歌来自哪个平台：一个带平台色的小方块，里面是平台自己的记号字（云 / Q / 酷 / S…）。
// 队列里的「拼贴墙」和搜索结果的「全部音源」都用它，判断来源的规则只有一处：
// 歌的 sourceRef.providerId（getPlaybackSourceRef），不看歌名也不看它在哪个列表里。

type ProviderBadgeProps = {
    /** 平台自己的记号（omni.getProviderMark）；平台没声明时退回短名的首字。 */
    letter: string;
    color: string;
    /** 无障碍名称：平台全称。 */
    title: string;
    size?: number;
};

export const ProviderMarkBadge: React.FC<ProviderBadgeProps> = ({ letter, color, title, size = 16 }) => (
    <span
        title={title}
        aria-label={title}
        className="inline-flex shrink-0 items-center justify-center rounded-[5px] font-semibold leading-none"
        style={{
            width: size,
            height: size,
            fontSize: Math.max(8, Math.round(size * 0.62)),
            backgroundColor: color,
            color: '#fff',
        }}
    >
        {letter}
    </span>
);

type SongProviderBadgeProps = {
    song: SongResult | null | undefined;
    size?: number;
};

/** 在线歌才画；本地、Navidrome、舞台曲目都没有平台可言。 */
export const SongProviderBadge: React.FC<SongProviderBadgeProps> = ({ song, size = 16 }) => {
    if (!song) return null;
    const source = getPlaybackSourceRef(song);
    if (source.kind !== 'online') return null;
    const mark = omni.getProviderMark(source.providerId);
    const label = omni.getProviderLabel(source.providerId);
    return (
        <ProviderMarkBadge
            letter={mark?.letter || label.slice(0, 1)}
            color={mark?.color || '#6b7280'}
            title={label}
            size={size}
        />
    );
};

export default SongProviderBadge;
