import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { isBravaisLibraryActive, useIsBravaisLibraryActive } from '../../../../library/app/bravaisLibraryActive';
import { useLibraryWallLookStore } from '../../../../stores/useLibraryWallLookStore';
import { closeSettings } from '../../../../stores/useSettingsModalStore';
import {
    WALL_CHROME_SCALE_DEFAULT_PERCENT,
    WALL_CHROME_SCALE_MAX_PERCENT,
    WALL_CHROME_SCALE_MIN_PERCENT,
    useWallChromeOffsetStore,
} from '../../../../stores/useWallChromeOffsetStore';
import {
    LIBRARY_WALL_LOOKS,
    LIBRARY_WALL_WINDOW_COUNTS,
    libraryWallWindowSharePercent,
    type LibraryWallLook,
} from '../../../../utils/libraryWallLook';
import {
    LIBRARY_WALL_SEAM_STYLE_LABEL_KEYS,
    LIBRARY_WALL_SEAM_STYLE_LOOKS,
    LIBRARY_WALL_SEAM_STYLES,
    type LibraryWallSeamStyle,
} from '../../../../utils/libraryWallSeamStyle';
import { Button, FoldedGroup, PictureChoice, Reveal, Row, Segmented, Slider, TextField, Toggle, option, type SettingsGroupDef } from '../kit';

// src/components/modal/settings/pages/BravaisWallGroup.tsx
// The Bravais 墙面 group of the 主页与歌单 page: every setting only the bravais library UI has. How
// much of the wall lets the visualizer through (and, when partly, how many windows a block has),
// the collections' stack edges, the seam's material (always clear, or one of eight solid
// presets; the two exclude each other), and whether the picture behind the wall has lyrics and
// blur. The group is drawn only while bravais is the library UI in effect, the same test the
// command palette asks (isBravaisLibraryActive): under any other UI these settings do nothing.
// The look and the window count are not in the config export (useLibraryWallLookStore says why);
// the rest are (pages/storage/visualConfigTransfer).

export const BRAVAIS_WALL: SettingsGroupDef = { id: 'bravaisSettings', titleKey: 'options.bravaisSettings', available: isBravaisLibraryActive };
/**
 * 浮层：位置与大小合成一组（实测反馈：两组折叠项各开一半，找东西要开两次）。
 *
 * 位置不再逐个列滑杆 —— 浮层位置改成在编辑态里拖：进去（点「编辑浮层位置」）之后每一颗
 * 按钮、信息条的上下两部分、顶部提示都带一个虚线框，拖就行，还能贴边、居中、按像素微调。
 * 十几个滑杆既难找出「刚才调的是哪一个」，也表达不了「整组一起挪」。这里只留入口与复位。
 */
export const WALL_CHROME: SettingsGroupDef = { id: 'wallChromeOffsets', titleKey: 'options.wallChromeGroup', available: isBravaisLibraryActive };

const O = {
    look: option(BRAVAIS_WALL, 'libraryWallLook', 'options.libraryWallLook'),
    windows: option(BRAVAIS_WALL, 'libraryWallWindows', 'options.libraryWallWindows'),
    stackEdges: option(BRAVAIS_WALL, 'bravaisStackEdges', 'options.bravaisStackEdges'),
    seamClear: option(BRAVAIS_WALL, 'bravaisSeamClear', 'options.bravaisSeamClear'),
    seamStyle: option(BRAVAIS_WALL, 'bravaisSeamStyle', 'options.bravaisSeamStyle'),
    backdropLyrics: option(BRAVAIS_WALL, 'bravaisBackdropLyrics', 'options.bravaisBackdropLyrics'),
    backdropBlur: option(BRAVAIS_WALL, 'bravaisBackdropBlur', 'options.bravaisBackdropBlur'),
    seamTitle: option(BRAVAIS_WALL, 'bravaisSeamTitle', 'options.bravaisSeamTitle'),
    scale: option(WALL_CHROME, 'wallChromeScale', 'options.wallChromeScale'),
    showLocate: option(WALL_CHROME, 'showLocateButton', 'options.showLocateButton'),
    showTools: option(WALL_CHROME, 'showToolsButton', 'options.showToolsButton'),
    chromeEditMode: option(WALL_CHROME, 'chromeEditMode', 'options.chromeEditMode'),
};

export const BRAVAIS_WALL_OPTIONS = [
    ...Object.values(O).filter(entry => entry.group === BRAVAIS_WALL),
    ...Object.values(O).filter(entry => entry.group === WALL_CHROME),
];

const LOOK_KEYS: Record<LibraryWallLook, { label: string; description: string }> = {
    solid: { label: 'options.libraryWallLookSolid', description: 'options.libraryWallLookSolidDesc' },
    partial: { label: 'options.libraryWallLookPartial', description: 'options.libraryWallLookPartialDesc' },
    clear: { label: 'options.libraryWallLookClear', description: 'options.libraryWallLookClearDesc' },
};

/** A seam preset as the wall draws it: its paper, and a glyph in its ink. */
const SeamSwatch: React.FC<{ style: LibraryWallSeamStyle; glyph: string }> = ({ style, glyph }) => {
    const look = LIBRARY_WALL_SEAM_STYLE_LOOKS[style];
    return (
        <span
            className="flex h-full w-full items-center justify-center text-base font-extrabold"
            style={{ background: look.surface, color: look.ink ?? 'var(--st-t1)' }}
        >
            {glyph}
        </span>
    );
};

export const BravaisWallGroup: React.FC = () => {
    const { t } = useTranslation();
    const isBravaisActive = useIsBravaisLibraryActive();
    // 标题是自由文本：用草稿 + 失焦/回车提交，避免每敲一个字就往存储里写一次。
    const [titleDraft, setTitleDraft] = useState('');
    const wall = useLibraryWallLookStore(useShallow(state => ({
        look: state.look,
        windowsPerBlock: state.windowsPerBlock,
        stackEdges: state.collectionStackEdges,
        seamClear: state.seamClear,
        seamStyle: state.seamStyle,
        backdropLyrics: state.backdropLyrics,
        backdropBlur: state.backdropBlur,
        seamTitle: state.seamTitle,
        setLook: state.setLook,
        setWindowsPerBlock: state.setWindowsPerBlock,
        setStackEdges: state.setCollectionStackEdges,
        setSeamClear: state.setSeamClear,
        setSeamStyle: state.setSeamStyle,
        setBackdropLyrics: state.setBackdropLyrics,
        setBackdropBlur: state.setBackdropBlur,
        setSeamTitle: state.setSeamTitle,
    })));
    // store 里的标题变化（例如导入配置）后把草稿拉齐
    useEffect(() => { setTitleDraft(wall.seamTitle); }, [wall.seamTitle]);

    if (!isBravaisActive) return null;

    const glyph = t('options.bravaisSeamSwatchGlyph');

    // ---- 浮层（位置 + 大小） ----
    // 位置没有滑杆了：编辑态里拖。这里只留入口、复位与大小。
    const chrome = useWallChromeOffsetStore(useShallow(state => ({
        scale: state.scale,
        setScale: state.handleSetScale,
        showLocateButton: state.showLocateButton,
        showToolsButton: state.showToolsButton,
        toggleLocateButton: state.handleToggleLocateButton,
        toggleToolsButton: state.handleToggleToolsButton,
        chromeEditMode: state.chromeEditMode,
        setChromeEditMode: state.handleSetChromeEditMode,
        reset: state.handleResetOffset,
        resetScale: state.handleResetScale,
    })));
    // 大小只有一档：四颗按钮共用一个百分比（实测反馈：四颗各调各的记不住）。
    // 绝对值会让四组滑块的刻度含义不一致，百分比则统一是「相对各自原尺寸」。
    const fmtScale = (value: number) => (
        value === WALL_CHROME_SCALE_DEFAULT_PERCENT ? t('options.wallChromeOffsetDefault') : `${value}%`
    );

    return (
        <>
        <FoldedGroup def={BRAVAIS_WALL}>
            <Row option={O.seamTitle} note={t('options.bravaisSeamTitleDesc')}>
                <TextField
                    value={titleDraft}
                    onChange={setTitleDraft}
                    onCommit={() => wall.setSeamTitle(titleDraft)}
                    placeholder={t('libraryBravais.homeTitle')}
                />
            </Row>
            <Row option={O.look} hint={t(LOOK_KEYS[wall.look].description)} note={t('options.libraryWallLookDesc')}>
                <Segmented
                    value={wall.look}
                    options={LIBRARY_WALL_LOOKS.map(look => ({ value: look, label: t(LOOK_KEYS[look].label) }))}
                    onChange={wall.setLook}
                />
            </Row>
            {/* Windows exist only on a partly clear wall. */}
            <Reveal when={wall.look === 'partial'}>
                <Row
                    sub
                    option={O.windows}
                    hint={t('options.libraryWallWindowsOption', { count: wall.windowsPerBlock, percent: libraryWallWindowSharePercent(wall.windowsPerBlock) })}
                    note={t('options.libraryWallWindowsDesc')}
                >
                    <Segmented
                        value={String(wall.windowsPerBlock)}
                        options={LIBRARY_WALL_WINDOW_COUNTS.map(count => ({ value: String(count), label: String(count) }))}
                        onChange={count => wall.setWindowsPerBlock(Number(count))}
                    />
                </Row>
            </Reveal>
            <Row option={O.stackEdges} note={t('options.bravaisStackEdgesDesc')}>
                <Toggle checked={wall.stackEdges} onChange={wall.setStackEdges} />
            </Row>
            <Row option={O.seamClear} note={t('options.bravaisSeamClearDesc')}>
                <Toggle checked={wall.seamClear} onChange={wall.setSeamClear} />
            </Row>
            {/* A clear seam draws no paper: the presets keep their value and wait until it is off. */}
            <Row
                option={O.seamStyle}
                hint={wall.seamClear ? t('options.bravaisSeamStyleDisabled') : undefined}
                note={t('options.bravaisSeamStyleDesc')}
            >
                <PictureChoice
                    value={wall.seamStyle}
                    options={LIBRARY_WALL_SEAM_STYLES.map(style => ({
                        value: style,
                        label: t(LIBRARY_WALL_SEAM_STYLE_LABEL_KEYS[style]),
                        picture: <SeamSwatch style={style} glyph={glyph} />,
                    }))}
                    onChange={wall.setSeamStyle}
                    disabled={wall.seamClear}
                />
            </Row>
            <Row option={O.backdropLyrics} note={t('options.bravaisBackdropLyricsDesc')}>
                <Toggle checked={wall.backdropLyrics} onChange={wall.setBackdropLyrics} />
            </Row>
            <Row option={O.backdropBlur} note={t('options.bravaisBackdropBlurDesc')}>
                <Toggle checked={wall.backdropBlur} onChange={wall.setBackdropBlur} />
            </Row>
        </FoldedGroup>

        <FoldedGroup def={WALL_CHROME}>
            {/* 编辑态入口：打开后设置直接收起 —— 编辑层画在设置弹窗之上，开着弹窗既看不清也拖不动。
                进入后是独立的会话（顶部有取消 / 完成），所以这个开关本身也会被那两颗按钮关掉。 */}
            <Row option={O.chromeEditMode} note={t('options.chromeEditModeDesc')}>
                <Toggle
                    checked={chrome.chromeEditMode}
                    onChange={value => {
                        chrome.setChromeEditMode(value);
                        if (value) closeSettings();
                    }}
                />
            </Row>
            {/* 位置不再逐个列滑杆：编辑态里拖。这里留一键复位 ——
                拖散的浮层比调错的滑块更难找回原处。 */}
            <Row hint={t('options.wallChromeOffsetsDesc')}>
                <Button variant="quiet" onClick={() => chrome.reset()}>
                    {t('options.wallChromeOffsetsReset')}
                </Button>
            </Row>
            <Row option={O.scale} note={t('options.wallChromeScaleDesc')}>
                <Slider
                    value={chrome.scale}
                    min={WALL_CHROME_SCALE_MIN_PERCENT}
                    max={WALL_CHROME_SCALE_MAX_PERCENT}
                    step={5}
                    onChange={value => chrome.setScale(value)}
                    format={fmtScale}
                />
            </Row>
            {/* 比例一起调乱时，一键回到原尺寸 */}
            <Row hint={t('options.wallChromeSizesDesc')}>
                <Button variant="quiet" onClick={() => chrome.resetScale()}>
                    {t('options.wallChromeSizesReset')}
                </Button>
            </Row>
            <Row option={O.showLocate} note={t('options.showLocateButtonDesc')}>
                <Toggle checked={chrome.showLocateButton} onChange={chrome.toggleLocateButton} />
            </Row>
            <Row option={O.showTools} note={t('options.showToolsButtonDesc')}>
                <Toggle checked={chrome.showToolsButton} onChange={chrome.toggleToolsButton} />
            </Row>
        </FoldedGroup>
        </>
    );
};

export default BravaisWallGroup;
