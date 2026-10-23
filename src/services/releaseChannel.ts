// src/services/releaseChannel.ts
// 三条发布通道：正式版 / 内测版 / 测试版。
//
// 为什么放在服务和构建脚本共用的一个文件里：应用内「检查更新」要按通道挑发布，
// 发布脚本要按通道拼 tag，两边必须是同一套规则，否则会出现「发了内测包，内测通道看不到」。
//
// 规则：
//   · tag 前缀区分通道 —— 正式版 `v0.7.22.0`、内测版 `beta-v0.7.22.0`、测试版 `dev-v0.7.22.0`；
//   · 通道向下兼容 —— 内测版也会收到正式版发的热修，测试版三种都收；
//   · 版本号本身不带通道后缀 —— 应用内比较的是数字版本，`beta-` 只在前缀上，
//     这样「内测 0.7.22.0」与「正式 0.7.22.0」不会被判成谁更新。

export type ReleaseChannel = 'stable' | 'beta' | 'dev';

export const RELEASE_CHANNELS: readonly ReleaseChannel[] = ['stable', 'beta', 'dev'];

/** 各通道的 tag 前缀（写在 `v` 之前）。 */
export const RELEASE_CHANNEL_TAG_PREFIX: Record<ReleaseChannel, string> = {
    stable: '',
    beta: 'beta-',
    dev: 'dev-',
};

/**
 * 一个通道愿意接收哪些通道的发布。高通道包含低通道：
 * 内测用户不该因为「正式版发了热修」而收不到，否则只能手动换通道。
 */
export const RELEASE_CHANNEL_SOURCES: Record<ReleaseChannel, readonly ReleaseChannel[]> = {
    stable: ['stable'],
    beta: ['beta', 'stable'],
    dev: ['dev', 'beta', 'stable'],
};

export const isReleaseChannel = (value: unknown): value is ReleaseChannel =>
    value === 'stable' || value === 'beta' || value === 'dev';

/**
 * tag 属于哪个通道。
 *
 * 认不出的 tag 一律算正式版：本工程早期发过 tag 直接写成 `folia` 的发布，
 * 资产名里才带版本号；把它们判成「哪个通道都不属于」会让老版本查不到更新。
 */
export const channelOfTag = (tag: string): ReleaseChannel => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed.startsWith('beta-')) return 'beta';
    if (trimmed.startsWith('dev-')) return 'dev';
    return 'stable';
};

/** 去掉通道前缀后的 tag（`beta-v0.8.0.0` → `v0.8.0.0`）。版本号解析用它。 */
export const stripChannelPrefix = (tag: string): string =>
    tag.trim().replace(/^(beta-|dev-)/i, '');

/** 发布时用的 tag：`releaseTag('beta', '0.7.22.0')` → `beta-v0.7.22.0`。 */
export const releaseTag = (channel: ReleaseChannel, version: string): string =>
    `${RELEASE_CHANNEL_TAG_PREFIX[channel]}v${version.trim().replace(/^v/i, '')}`;

/** `…/releases/latest` 换成本表地址：末尾那一段 latest 去掉。 */
export const releaseListUrl = (sourceUrl: string): string =>
    sourceUrl.replace(/\/latest\/?$/i, '');

/** 这个通道收不收这条发布。 */
export const channelAcceptsTag = (channel: ReleaseChannel, tag: string): boolean =>
    RELEASE_CHANNEL_SOURCES[channel].includes(channelOfTag(tag));
