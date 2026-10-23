import { describe, expect, it } from 'vitest';
import { pickBestRelease, resolveLatestVersion } from '../../src/services/appUpdate';
import {
    channelAcceptsTag,
    channelOfTag,
    releaseListUrl,
    releaseTag,
    stripChannelPrefix,
} from '../../src/services/releaseChannel';

// 三条通道的规则：tag 前缀决定通道，通道向下兼容。
// 这里测的是「应用内怎么挑发布」，与发布脚本用的是同一套前缀（src/services/releaseChannel.ts）。

describe('tag 与通道', () => {
    it('前缀决定通道', () => {
        expect(channelOfTag('v0.7.22.0')).toBe('stable');
        expect(channelOfTag('beta-v0.7.22.0')).toBe('beta');
        expect(channelOfTag('dev-v0.7.22.0')).toBe('dev');
    });

    it('认不出的老 tag 算正式版（早期发过 tag=folia 的包）', () => {
        expect(channelOfTag('folia')).toBe('stable');
        expect(channelOfTag('')).toBe('stable');
    });

    it('去掉通道前缀再解析版本号', () => {
        expect(stripChannelPrefix('beta-v0.7.22.0')).toBe('v0.7.22.0');
        expect(stripChannelPrefix('dev-0.7.22.0')).toBe('0.7.22.0');
        expect(stripChannelPrefix('v0.7.22.0')).toBe('v0.7.22.0');
        expect(resolveLatestVersion('beta-v0.8.0.0', [])).toBe('0.8.0.0');
        expect(resolveLatestVersion('dev-v0.8.0.0', [])).toBe('0.8.0.0');
    });

    it('拼 tag', () => {
        expect(releaseTag('stable', '0.7.22.0')).toBe('v0.7.22.0');
        expect(releaseTag('beta', '0.7.22.0')).toBe('beta-v0.7.22.0');
        expect(releaseTag('dev', 'v0.7.22.0')).toBe('dev-v0.7.22.0');
    });

    it('latest 地址换成列表地址', () => {
        expect(releaseListUrl('https://gitee.com/api/v5/repos/o/r/releases/latest'))
            .toBe('https://gitee.com/api/v5/repos/o/r/releases');
        expect(releaseListUrl('https://api.github.com/repos/o/r/releases/latest/'))
            .toBe('https://api.github.com/repos/o/r/releases');
        // 已经是列表地址时不动它
        expect(releaseListUrl('https://api.github.com/repos/o/r/releases'))
            .toBe('https://api.github.com/repos/o/r/releases');
    });
});

describe('通道收哪些发布', () => {
    it('正式版只收正式', () => {
        expect(channelAcceptsTag('stable', 'v0.7.22.0')).toBe(true);
        expect(channelAcceptsTag('stable', 'beta-v0.8.0.0')).toBe(false);
        expect(channelAcceptsTag('stable', 'dev-v0.9.0.0')).toBe(false);
    });

    it('内测版收内测与正式（正式发了热修也要收得到）', () => {
        expect(channelAcceptsTag('beta', 'v0.7.22.0')).toBe(true);
        expect(channelAcceptsTag('beta', 'beta-v0.8.0.0')).toBe(true);
        expect(channelAcceptsTag('beta', 'dev-v0.9.0.0')).toBe(false);
    });

    it('测试版三种都收', () => {
        expect(channelAcceptsTag('dev', 'v0.7.22.0')).toBe(true);
        expect(channelAcceptsTag('dev', 'beta-v0.8.0.0')).toBe(true);
        expect(channelAcceptsTag('dev', 'dev-v0.9.0.0')).toBe(true);
    });
});

describe('按通道挑最新一版', () => {
    const release = (tag: string, extra: Record<string, unknown> = {}) => ({
        tag_name: tag,
        body: `${tag} notes`,
        assets: [{ name: `folia-${tag}.apk`, browser_download_url: `https://example.com/${tag}.apk` }],
        ...extra,
    });

    const all = [
        release('dev-v0.9.0.0'),
        release('beta-v0.8.0.0'),
        release('v0.7.22.0'),
        release('v0.7.21.24'),
    ];

    it('正式版拿数字最大的正式发布，不会被同列表里的 dev 抢走', () => {
        expect(pickBestRelease(all, 'stable')?.version).toBe('0.7.22.0');
        expect(pickBestRelease(all, 'stable')?.tag).toBe('v0.7.22.0');
    });

    it('内测版拿内测里最新的那条', () => {
        expect(pickBestRelease(all, 'beta')?.version).toBe('0.8.0.0');
        expect(pickBestRelease(all, 'beta')?.channel).toBe('beta');
    });

    it('测试版拿 dev 里最新的那条', () => {
        expect(pickBestRelease(all, 'dev')?.version).toBe('0.9.0.0');
        expect(pickBestRelease(all, 'dev')?.tag).toBe('dev-v0.9.0.0');
    });

    it('比版本而不是按列表顺序：列表倒序也挑得对', () => {
        const reversed = [...all].reverse();
        expect(pickBestRelease(reversed, 'stable')?.version).toBe('0.7.22.0');
        expect(pickBestRelease(reversed, 'dev')?.version).toBe('0.9.0.0');
    });

    it('草稿不算', () => {
        const withDraft = [release('dev-v1.0.0.0', { draft: true }), release('v0.7.22.0')];
        expect(pickBestRelease(withDraft, 'dev')?.version).toBe('0.7.22.0');
    });

    it('空列表没有可选项', () => {
        expect(pickBestRelease([], 'stable')).toBeNull();
    });

    it('tag 里没数字时从资产名取版本号', () => {
        const legacy = { tag_name: 'folia', assets: [{ name: 'Folia-0.7.21.15-release.apk', browser_download_url: 'x' }] };
        expect(pickBestRelease([legacy], 'stable')?.version).toBe('0.7.21.15');
    });
});
