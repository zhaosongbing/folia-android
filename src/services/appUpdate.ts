// src/services/appUpdate.ts
// 在线更新检查：从 GitHub Releases 取最新版本、更新日志和 APK 下载地址。
//
// 为什么单独写这一套：工程里原本的更新检查走 window.electron（主进程的 electron-updater），
// Android 打包后没有 window.electron，那条链路整体失效。这里用 Releases API 直接查，
// 两端都能用，且能拿到 release 正文作为「更新日志」显示。
//
// 默认仓库取自 package.json 的 build.publish（owner: chthollyphile, repo: folia-major）。
// 设置里可以覆盖成自己的发布源，格式要求同 GitHub API 的 releases/latest。

/** 更新源默认地址。可在设置里覆盖。 */
/** Gitee 更新源：实测同一份 14.8MB 的包，Gitee 附件 1.63 MB/s（9 秒），
 *  GitHub 直链只有 13.7 KB/s（约 18 分钟），所以默认走 Gitee。 */
export const GITEE_UPDATE_SOURCE_URL = 'https://gitee.com/api/v5/repos/zhaosongbing/folia/releases/latest';
/** GitHub 更新源：Gitee 不可用时的回退。 */
export const GITHUB_UPDATE_SOURCE_URL = 'https://api.github.com/repos/zhaosongbing/folia-android-releases/releases/latest';
/** 依次尝试的更新源。第一个能正常返回就用它。 */
export const DEFAULT_UPDATE_SOURCES = [GITEE_UPDATE_SOURCE_URL, GITHUB_UPDATE_SOURCE_URL] as const;
export const DEFAULT_UPDATE_SOURCE_URL = GITEE_UPDATE_SOURCE_URL;

export type AppUpdateInfo = {
    /** 远端版本，已去掉开头的 v */
    latestVersion: string;
    /** 当前版本，来自 __APP_VERSION__ */
    currentVersion: string;
    /** 更新日志正文（release body 原文） */
    releaseNotes: string;
    /** 发布页，让人可以去看完整说明 */
    releaseUrl: string;
    /** APK 直链；发布里没有 apk 资产时为 null */
    downloadUrl: string | null;
    /** 发布时间，ISO 字符串 */
    publishedAt: string;
    /** 这条发布来自哪条通道（tag 前缀决定）。 */
    releaseChannel: ReleaseChannel;
    /** 原始 tag，例如 `beta-v0.7.22.0`。 */
    tag: string;
};

export type AppUpdateCheckResult =
    | { status: 'update'; info: AppUpdateInfo }
    | { status: 'current'; latestVersion: string }
    | { status: 'error'; message: string };

/** 当前应用版本。构建时由 vite 注入 __APP_VERSION__，取不到时回落到 '0.0.0'。 */
export const getCurrentAppVersion = (): string => {
    try {
        return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
    } catch {
        return '0.0.0';
    }
};

import {
    channelAcceptsTag,
    channelOfTag,
    releaseListUrl,
    stripChannelPrefix,
    type ReleaseChannel,
} from './releaseChannel';

/**
 * 把版本号拆成数字段，'v1.2.3-beta.1' → [1, 2, 3]。
 *
 * 保留任意段数（不只前三段）：这个移植版的 versionName 是 0.7.21.<fix>，
 * 第四段正是区分每一版构建的地方。只比三段的话，所有 fix 版本都是「0.7.21」，
 * 在线更新永远不会提示。
 *
 * 预发布标记（-beta、+build）不参与比较，否则 '0.7.22-beta' 会被判成比 '0.7.22' 小。
 */
export const parseVersionSegments = (version: string): number[] => {
    const cleaned = version.trim().replace(/^v/i, '');
    const core = cleaned.split(/[-+]/)[0] ?? '';
    const segments = core.split('.').map(part => {
        const value = Number.parseInt(part, 10);
        return Number.isFinite(value) ? value : 0;
    });
    while (segments.length < 3) segments.push(0);
    return segments;
};

/**
 * 远端版本是否比本地新。逐段比较，先比高位；缺位补 0，段数不同也能比。
 */
export const isVersionNewer = (remote: string, local: string): boolean => {
    const a = parseVersionSegments(remote);
    const b = parseVersionSegments(local);
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        const remotePart = a[i] ?? 0;
        const localPart = b[i] ?? 0;
        if (remotePart > localPart) return true;
        if (remotePart < localPart) return false;
    }
    return false;
};

type GithubReleaseAsset = {
    name?: string;
    browser_download_url?: string;
};

type GithubRelease = {
    tag_name?: string;
    name?: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: GithubReleaseAsset[];
};

/** 从一段文字里抠出版本号，取第一个 x.y 或 x.y.z 形式的片段。 */
const VERSION_PATTERN = /(\d+\.\d+(?:\.\d+)*)/;

/**
 * 决定这次发布的版本号。
 *
 * 先剥掉通道前缀（`beta-v0.8.0.0` → `0.8.0.0`），再看 tag；tag 里没有数字时
 * （Gitee 上有人把 tag 直接写成 `folia`），退而从 APK 资产名里找
 * （`Folia-0.7.21.15-release.apk` → `0.7.21.15`）。没有这一步，Gitee 源的版本号会解析成
 * 0.0.0，永远判定「已是最新」。
 */
export const resolveLatestVersion = (tag: string, assets: GithubReleaseAsset[]): string => {
    const fromTag = stripChannelPrefix(tag).replace(/^v/i, '');
    if (/\d/.test(fromTag)) return fromTag;
    for (const asset of assets) {
        const name = asset.name ?? '';
        if (!name.toLowerCase().endsWith('.apk')) continue;
        const matched = name.match(VERSION_PATTERN);
        if (matched) return matched[1];
    }
    return fromTag;
};

/** 发布页地址。Gitee 的 API 不返回 html_url，只能从源地址推导。 */
export const resolveReleasePage = (sourceUrl: string, htmlUrl?: string): string => {
    if (htmlUrl) return htmlUrl;
    // GitHub 是 api.github.com/repos/...，Gitee 是 gitee.com/api/v5/repos/...，两种都要认
    const matched = sourceUrl.match(/^(https?:\/\/[^/]+)\/(?:api\/v5\/|api\/)?repos\/([^/]+)\/([^/]+)/);
    if (!matched) return '';
    const [, host, owner, repo] = matched;
    const pageHost = host.includes('gitee.com') ? 'https://gitee.com'
        : host.includes('api.github.com') ? 'https://github.com'
            : host;
    return `${pageHost}/${owner}/${repo}/releases`;
};

/** 从 release 的资产里挑 APK 直链：优先名字里带 apk 的，忽略 .sha256 之类的校验文件。 */
const pickApkAssetUrl = (release: GithubRelease): string | null => {
    const assets = release.assets ?? [];
    const apk = assets.find(asset => {
        const name = (asset.name ?? '').toLowerCase();
        return name.endsWith('.apk') && Boolean(asset.browser_download_url);
    });
    return apk?.browser_download_url ?? null;
};

/** 一条发布里我们真正要的东西。 */
export type PickedRelease = {
    release: GithubRelease;
    tag: string;
    version: string;
    channel: ReleaseChannel;
};

/**
 * 从发布列表里挑出「这个通道能收到的最新一版」。
 *
 * 为什么不是直接读 `releases/latest`：latest 只给一条，而三条通道的包都发在同一个仓库里，
 * 内测版用户要的是「beta 前缀里最新的那条」，测试版用户要最新的 dev，正式版用户要最新的 v。
 * 列表接口一次给二十条，按 tag 前缀筛一遍、按版本号比一遍就够了。
 *
 * 比版本号而不是按列表顺序取第一条：两个通道交叠时（内测用户也会收到正式版热修），
 * 顺序不保证是版本顺序，而「谁的数字大」是确定的。
 */
export const pickBestRelease = (
    releases: GithubRelease[],
    channel: ReleaseChannel,
): PickedRelease | null => {
    let best: PickedRelease | null = null;
    for (const release of releases) {
        if (release.draft) continue;
        const tag = (release.tag_name ?? release.name ?? '').trim();
        if (!tag) continue;
        if (!channelAcceptsTag(channel, tag)) continue;
        const version = resolveLatestVersion(tag, release.assets ?? []);
        if (!version || !/\d/.test(version)) continue;
        if (!best || isVersionNewer(version, best.version)) {
            best = { release, tag, version, channel: channelOfTag(tag) };
        }
    }
    return best;
};

/**
 * 检查更新。
 *
 * 失败一律归到 'error' 而不是抛异常：调用方是启动流程和设置页按钮，
 * 网络不通是常态（飞行模式、公司网络、GitHub 被墙），不该让它们各自写一遍 catch。
 *
 * `channel` 决定要哪条通道的发布：正式版只看 `v…`，内测版还看 `beta-v…`，测试版三种都看。
 */
export const checkForAppUpdate = async (
    sourceUrl: string = DEFAULT_UPDATE_SOURCE_URL,
    channel: ReleaseChannel = 'stable',
): Promise<AppUpdateCheckResult> => {
    const currentVersion = getCurrentAppVersion();

    // latest → 列表：同一个源地址，只把末段的 latest 去掉。
    const listUrl = releaseListUrl(sourceUrl);
    const separator = listUrl.includes('?') ? '&' : '?';
    let response: Response;
    try {
        response = await fetch(`${listUrl}${separator}per_page=20`, {
            headers: { Accept: 'application/vnd.github+json' },
            cache: 'no-store',
        });
    } catch {
        return { status: 'error', message: 'network' };
    }

    if (!response.ok) {
        // 404 通常意味着仓库没有发布过 release，单独区分一下，提示更准确
        return { status: 'error', message: response.status === 404 ? 'not-found' : `http-${response.status}` };
    }

    let payload: GithubRelease[] | GithubRelease;
    try {
        payload = await response.json() as GithubRelease[] | GithubRelease;
    } catch {
        return { status: 'error', message: 'invalid-json' };
    }

    // 设置里可以把源改成任意「latest 形式」的地址，那种地址回的是一条对象，一并兼容。
    const releases = Array.isArray(payload) ? payload : payload ? [payload] : [];
    const picked = pickBestRelease(releases, channel);
    if (!picked) {
        return { status: 'error', message: 'no-version' };
    }

    if (!isVersionNewer(picked.version, currentVersion)) {
        return { status: 'current', latestVersion: picked.version };
    }

    const { release } = picked;
    return {
        status: 'update',
        info: {
            latestVersion: picked.version,
            currentVersion,
            releaseNotes: (release.body ?? '').trim(),
            releaseUrl: resolveReleasePage(sourceUrl, release.html_url),
            downloadUrl: pickApkAssetUrl(release),
            publishedAt: release.published_at ?? '',
            releaseChannel: picked.channel,
            tag: picked.tag,
        },
    };
};

/**
 * 把 release 正文压成适合在弹窗里显示的纯文本。
 *
 * 不做完整 Markdown 渲染：更新日志的主要信息是列表项和粗体标题，把标记符号去掉就够了。
 * 引入一个 Markdown 渲染库只为这个弹窗，代价（体积、XSS 面）不值得。
 */
export const formatReleaseNotes = (body: string): string => {
    if (!body) return '';
    return body
        // 代码块围栏、图片、链接语法都退化成纯文本
        .replace(/```[\s\S]*?```/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/^\s*[-*]\s+/gm, '· ')
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};
