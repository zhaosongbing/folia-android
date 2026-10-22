import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { isBravaisLibraryActive, useIsBravaisLibraryActive } from '../../../../library/app/bravaisLibraryActive';
import { useLibraryWallLookStore } from '../../../../stores/useLibraryWallLookStore';
import {
    WALL_CHROME_OFFSET_SLIDER_MAX_PX,
    WALL_CHROME_SCALE_DEFAULT_PERCENT,
    WALL_CHROME_SCALE_MAX_PERCENT,
    WALL_CHROME_SCALE_MIN_PERCENT,
    useWallChromeOffsetStore,
    type WallChromeOffsetAxis,
    type WallChromeOffsetTarget,
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
/** 浮层位置：左上角返回、右下角定位、右下角工具、信息条上部分，四组各两轴。 */
export const WALL_CHROME: SettingsGroupDef = { id: 'wallChromeOffsets', titleKey: 'options.wallChromeOffsets', available: isBravaisLibraryActive };
/** 浮层大小：四颗可按百分比缩放的按钮。 */
export const WALL_CHROME_SIZE: SettingsGroupDef = { id: 'wallChromeSizes', titleKey: 'options.wallChromeSizes', available: isBravaisLibraryActive };

const O = {
    look: option(BRAVAIS_WALL, 'libraryWallLook', 'options.libraryWallLook'),
    windows: option(BRAVAIS_WALL, 'libraryWallWindows', 'options.libraryWallWindows'),
    stackEdges: option(BRAVAIS_WALL, 'bravaisStackEdges', 'options.bravaisStackEdges'),
    seamClear: option(BRAVAIS_WALL, 'bravaisSeamClear', 'options.bravaisSeamClear'),
    seamStyle: option(BRAVAIS_WALL, 'bravaisSeamStyle', 'options.bravaisSeamStyle'),
    backdropLyrics: option(BRAVAIS_WALL, 'bravaisBackdropLyrics', 'options.bravaisBackdropLyrics'),
    backdropBlur: option(BRAVAIS_WALL, 'bravaisBackdropBlur', 'options.bravaisBackdropBlur'),
    seamTitle: option(BRAVAIS_WALL, 'bravaisSeamTitle', 'options.bravaisSeamTitle'),
    backX: option(WALL_CHROME, 'wallBackOffsetX', 'options.wallBackOffsetX'),
    backY: option(WALL_CHROME, 'wallBackOffsetY', 'options.wallBackOffsetY'),
    locateX: option(WALL_CHROME, 'wallLocateOffsetX', 'options.wallLocateOffsetX'),
    locateY: option(WALL_CHROME, 'wallLocateOffsetY', 'options.wallLocateOffsetY'),
    toolsX: option(WALL_CHROME, 'wallToolsOffsetX', 'options.wallToolsOffsetX'),
    toolsY: option(WALL_CHROME, 'wallToolsOffsetY', 'options.wallToolsOffsetY'),
    dockX: option(WALL_CHROME, 'seamDockOffsetX', 'options.seamDockOffsetX'),
    dockY: option(WALL_CHROME, 'seamDockOffsetY', 'options.seamDockOffsetY'),
    headX: option(WALL_CHROME, 'seamHeadOffsetX', 'options.seamHeadOffsetX'),
    headY: option(WALL_CHROME, 'seamHeadOffsetY', 'options.seamHeadOffsetY'),
    ponderX: option(WALL_CHROME, 'ponderOffsetX', 'options.ponderOffsetX'),
    ponderY: option(WALL_CHROME, 'ponderOffsetY', 'options.ponderOffsetY'),
    toastX: option(WALL_CHROME, 'statusToastOffsetX', 'options.statusToastOffsetX'),
    toastY: option(WALL_CHROME, 'statusToastOffsetY', 'options.statusToastOffsetY'),
    backScale: option(WALL_CHROME_SIZE, 'wallChromeScale', 'options.wallChromeScale'),
    showLocate: option(WALL_CHROME_SIZE, 'showLocateButton', 'options.showLocateButton'),
    showTools: option(WALL_CHROME_SIZE, 'showToolsButton', 'options.showToolsButton'),
    chromeEditMode: option(WALL_CHROME, 'chromeEditMode', 'options.chromeEditMode'),
};

export const BRAVAIS_WALL_OPTIONS = [
    ...Object.values(O).filter(entry => entry.group === BRAVAIS_WALL),
    ...Object.values(O).filter(entry => entry.group === WALL_CHROME),
    ...Object.values(O).filter(entry => entry.group === WALL_CHROME_SIZE),
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

    // ---- 浮层位置 ----
    const chrome = useWallChromeOffsetStore(useShallow(state => ({
        offsets: state.offsets,
        scale: state.scale,
        setOffset: state.handleSetOffset,
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
    const fmtOffset = (value: number) => (
        value === 0 ? t('options.wallChromeOffsetDefault') : `${value > 0 ? '+' : ''}${value}px`
    );
    const offsetRows: Array<{
        target: WallChromeOffsetTarget;
        axis: WallChromeOffsetAxis;
        entry: (typeof O)[keyof typeof O];
    }> = [
        { target: 'wallBack', axis: 'x', entry: O.backX },
        { target: 'wallBack', axis: 'y', entry: O.backY },
        { target: 'wallLocate', axis: 'x', entry: O.locateX },
        { target: 'wallLocate', axis: 'y', entry: O.locateY },
        { target: 'wallTools', axis: 'x', entry: O.toolsX },
        { target: 'wallTools', axis: 'y', entry: O.toolsY },
        { target: 'seamHead', axis: 'x', entry: O.headX },
        { target: 'seamHead', axis: 'y', entry: O.headY },
        { target: 'seamDock', axis: 'x', entry: O.dockX },
        { target: 'seamDock', axis: 'y', entry: O.dockY },
        { target: 'ponder', axis: 'x', entry: O.ponderX },
        { target: 'ponder', axis: 'y', entry: O.ponderY },
        { target: 'statusToast', axis: 'x', entry: O.toastX },
        { target: 'statusToast', axis: 'y', entry: O.toastY },
    ];
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
            {/* 拖动调整：开启后四颗按钮与信息条上下两部分外面出现可拖动的框，拖框体改位置、
                拖按钮右下角手柄改大小（四颗共用的那一档比例）；下面的滑块与它改同一组值，可以互相微调。
                默认关闭（实测反馈：默认开着容易误触）。 */}
            <Row option={O.chromeEditMode} note={t('options.chromeEditModeDesc')}>
                <Toggle checked={chrome.chromeEditMode} onChange={chrome.setChromeEditMode} />
            </Row>
            {/* 12 个滑块很容易调到找不回原处，给一个一键复位 */}
            <Row hint={t('options.wallChromeOffsetsDesc')}>
                <Button variant="quiet" onClick={() => chrome.reset()}>
                    {t('options.wallChromeOffsetsReset')}
                </Button>
            </Row>
            {offsetRows.map(({ target, axis, entry }) => (
                <Row key={`${target}-${axis}`} sub option={entry}>
                    <Slider
                        value={chrome.offsets[target][axis]}
                        min={-WALL_CHROME_OFFSET_SLIDER_MAX_PX}
                        max={WALL_CHROME_OFFSET_SLIDER_MAX_PX}
                        onChange={value => chrome.setOffset(target, axis, value)}
                        format={fmtOffset}
                    />
                </Row>
            ))}
        </FoldedGroup>

        <FoldedGroup def={WALL_CHROME_SIZE}>
            {/* 一个滑块一起调乱时，一键回到原尺寸 */}
            <Row hint={t('options.wallChromeSizesDesc')}>
                <Button variant="quiet" onClick={() => chrome.resetScale()}>
                    {t('options.wallChromeSizesReset')}
                </Button>
            </Row>
            <Row option={O.backScale} note={t('options.wallChromeScaleDesc')}>
                <Slider
                    value={chrome.scale}
                    min={WALL_CHROME_SCALE_MIN_PERCENT}
                    max={WALL_CHROME_SCALE_MAX_PERCENT}
                    step={5}
                    onChange={value => chrome.setScale(value)}
                    format={fmtScale}
                />
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
