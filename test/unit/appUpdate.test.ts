// test/unit/appUpdate.test.ts
// 在线更新的纯逻辑：版本比较与更新日志清洗。这两块出错会直接表现为「误报新版本」或「乱码日志」。

import { describe, expect, it } from 'vitest';
import {
    formatReleaseNotes,
    isVersionNewer,
    parseVersionSegments,
} from '../../src/services/appUpdate';

describe('版本号解析', () => {
    it('去掉 v 前缀', () => {
        expect(parseVersionSegments('v0.7.21')).toEqual([0, 7, 21]);
    });

    it('缺位补 0', () => {
        expect(parseVersionSegments('1.2')).toEqual([1, 2, 0]);
        expect(parseVersionSegments('2')).toEqual([2, 0, 0]);
    });

    it('保留第四段：这个移植版靠它区分每一次构建', () => {
        expect(parseVersionSegments('0.7.21.12')).toEqual([0, 7, 21, 12]);
    });

    it('预发布标记不参与比较', () => {
        expect(parseVersionSegments('0.7.22-beta.1')).toEqual([0, 7, 22]);
        expect(parseVersionSegments('0.7.22+build.5')).toEqual([0, 7, 22]);
    });

    it('非数字段按 0 处理', () => {
        expect(parseVersionSegments('0.x.3')).toEqual([0, 0, 3]);
    });
});

describe('版本新旧判断', () => {
    it('高位更大即更新', () => {
        expect(isVersionNewer('0.8.0', '0.7.21')).toBe(true);
        expect(isVersionNewer('1.0.0', '0.99.99')).toBe(true);
    });

    it('低位更大也算更新', () => {
        expect(isVersionNewer('0.7.22', '0.7.21')).toBe(true);
        expect(isVersionNewer('0.7.21.12', '0.7.21.11')).toBe(true);
        expect(isVersionNewer('0.7.21.11', '0.7.21.12')).toBe(false);
    });

    it('四段与三段比较：缺的那段按 0 算', () => {
        expect(isVersionNewer('0.7.21.1', '0.7.21')).toBe(true);
        expect(isVersionNewer('0.7.21', '0.7.21.1')).toBe(false);
        expect(isVersionNewer('0.7.21', '0.7.21.0')).toBe(false);
    });

    it('相同版本不算更新', () => {
        expect(isVersionNewer('0.7.21', '0.7.21')).toBe(false);
        expect(isVersionNewer('v0.7.21', '0.7.21')).toBe(false);
    });

    it('远端更低不算更新（不提示降级）', () => {
        expect(isVersionNewer('0.7.20', '0.7.21')).toBe(false);
        expect(isVersionNewer('0.6.99', '0.7.21')).toBe(false);
    });

    it('预发布与正式版同号时不算更新', () => {
        expect(isVersionNewer('0.7.22-beta', '0.7.22')).toBe(false);
    });
});

describe('更新日志清洗', () => {
    it('去掉标题与列表标记', () => {
        expect(formatReleaseNotes('## 新增\n- 长按手势\n- 控制栏尺寸')).toBe('新增\n· 长按手势\n· 控制栏尺寸');
    });

    it('链接退化成文字', () => {
        expect(formatReleaseNotes('见 [发布页](https://example.com)')).toBe('见 发布页');
    });

    it('图片整个去掉', () => {
        expect(formatReleaseNotes('截图 ![alt](https://example.com/a.png) 完')).toBe('截图  完');
    });

    it('代码块整段去掉', () => {
        expect(formatReleaseNotes('前\n```\ncode\n```\n后')).toBe('前\n\n后');
    });

    it('压缩多余空行', () => {
        expect(formatReleaseNotes('a\n\n\n\nb')).toBe('a\n\nb');
    });

    it('空串仍然为空', () => {
        expect(formatReleaseNotes('')).toBe('');
    });
});
