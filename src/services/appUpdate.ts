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
export const DEFAULT_UPDATE_SOURCE_URL = 'https://api.github.com/repos/zhaosongbing/folia-android-releases/releases/latest';

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

/** 从 release 的资产里挑 APK 直链：优先名字里带 apk 的，忽略 .sha256 之类的校验文件。 */
const pickApkAssetUrl = (release: GithubRelease): string | null => {
    const assets = release.assets ?? [];
    const apk = assets.find(asset => {
        const name = (asset.name ?? '').toLowerCase();
        return name.endsWith('.apk') && Boolean(asset.browser_download_url);
    });
    return apk?.browser_download_url ?? null;
};

/**
 * 检查更新。
 *
 * 失败一律归到 'error' 而不是抛异常：调用方是启动流程和设置页按钮，
 * 网络不通是常态（飞行模式、公司网络、GitHub 被墙），不该让它们各自写一遍 catch。
 */
export const checkForAppUpdate = async (
    sourceUrl: string = DEFAULT_UPDATE_SOURCE_URL,
): Promise<AppUpdateCheckResult> => {
    const currentVersion = getCurrentAppVersion();

    let response: Response;
    try {
        response = await fetch(sourceUrl, {
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

    let release: GithubRelease;
    try {
        release = await response.json() as GithubRelease;
    } catch {
        return { status: 'error', message: 'invalid-json' };
    }

    const tag = release.tag_name ?? release.name ?? '';
    const latestVersion = tag.trim().replace(/^v/i, '');
    if (!latestVersion) {
        return { status: 'error', message: 'no-version' };
    }

    if (!isVersionNewer(latestVersion, currentVersion)) {
        return { status: 'current', latestVersion };
    }

    return {
        status: 'update',
        info: {
            latestVersion,
            currentVersion,
            releaseNotes: (release.body ?? '').trim(),
            releaseUrl: release.html_url ?? '',
            downloadUrl: pickApkAssetUrl(release),
            publishedAt: release.published_at ?? '',
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
