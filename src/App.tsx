import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { AnimatePresence, motion, useMotionValue, useMotionValueEvent } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { loadCachedOrFetchCover } from './services/coverCache';
import VisualizerRenderer from './components/visualizer/VisualizerRenderer';
import CommandPalette from './components/command-palette/CommandPalette';
import AddToPlaylistHost from './components/app/AddToPlaylistHost';
import { useCommandPalette } from './components/command-palette/useCommandPalette';
import { useCommandPaletteContext } from './hooks/useCommandPaletteContext';
import { useReducedMotionFor } from './hooks/useReducedMotionFor';
import AppShell from './components/app/AppShell';
import Home from './components/app/Home';
import PlayerPanel from './components/app/PlayerPanel';
import ThemeQuickEditorHost from './components/panelTab/ThemeQuickEditor';
import AppDialogs from './components/app/dialogs/AppDialogs';
import { useProviderSignOut } from './components/app/dialogs/useProviderSignOut';
import LoginHost from './components/login/LoginHost';
import { useSettingsDialogModel } from './components/app/dialogs/useSettingsDialogModel';
import AppOverlays from './components/app/overlays/AppOverlays';
import PonderHost from './components/ponder/PonderHost';
// Lazy so animejs (~38KB gz) stays out of the bootstrap chunk: this overlay only ever draws when the
// animation switch is on AND the mode is automix, both off by default, so it is mounted only then.
const AutomixTransitionAnimation = lazy(() => import('./components/app/overlays/AutomixTransitionAnimation'));
const loadLattice = () => import('./components/app/lattice/Lattice');
const Lattice = lazy(loadLattice);
import { useVisualizerAroundWall, wallExitCompleted, WALL_LAYER } from './components/app/lattice/wallLayer';
import { useMorphKeepsHost } from './components/collectionFlight';
import { UserGuideModal } from './components/modal/UserGuideModal';
import ReleaseNotesDialog from './components/modal/ReleaseNotesDialog';
import LegacyModelsPrompt from './components/modal/LegacyModelsPrompt';
import { PlaybackEntryViewPrompt } from './components/modal/playback-entry-view/PlaybackEntryViewPrompt';
import { LatticeFmNotice } from './components/modal/playback-entry-view/LatticeFmNotice';
import { useStartupExperienceGate } from './hooks/useStartupExperienceGate';
import { useAppDialogsModel } from './components/app/dialogs/useAppDialogsModel';
import { useHomeModel } from './components/app/home/useHomeModel';
import { createLyricFilterPatternSaver } from './components/app/home/createLyricFilterPatternSaver';
import { nextLyricStaffAbsorbMode, nextLyricStaffPolicy } from './utils/lyrics/staffCreditsPolicy';
import { createPanelNavigation } from './components/app/navigation/createPanelNavigation';
import { usePlayingSongLocatorStore } from './stores/usePlayingSongLocatorStore';
import { createOnlineGridViewCollection, type GridViewCollectionDescriptor } from './components/app/home/gridViewCollectionAdapters';
import { buildAppStyle } from './components/app/presentation/buildAppStyle';
import { buildDebugSnapshot } from './components/app/presentation/buildDebugSnapshot';
import { buildHomeSurfacePresentation } from './components/app/presentation/buildHomeSurfacePresentation';
import { shouldMountPlayerVisualizer } from './components/app/presentation/playerVisualizerMount';
import { resolveWallHandoffPresentation } from './components/app/presentation/wallHandoffPresentation';
import { useWallHandoffDirector } from './components/app/presentation/wallHandoffDirector';
import WallToolsDockHost from './components/wall/WallToolsDock';
import { buildPlayerViewFlags } from './components/app/presentation/buildPlayerViewFlags';
import { buildVisualizerTheme } from './components/app/presentation/buildVisualizerTheme';
import { createCoverUrlResolver } from './components/app/playback/createCoverUrlResolver';
import { createLyricsSetter } from './components/app/playback/createLyricsSetter';
import { createLyricSegmentationActions } from './components/app/playback/createLyricSegmentationActions';
import { useLyricWordSegmentation } from './hooks/useLyricWordSegmentation';
import { useIcuFoliaSegmentation } from './hooks/useIcuFoliaSegmentation';
import { handleOnlineMediaFailure } from './components/app/playback/handleOnlineMediaFailure';
import { createOnlineRecoveryController } from './components/app/playback/restore/createOnlineRecoveryController';
import { notePreviewPlaying } from './components/app/playback/source/previewNotice';
import { persistPlaybackCache } from './components/app/playback/persistPlaybackCache';
import { useAppOverlaysModel } from './components/app/overlays/useAppOverlaysModel';
import { resolveNextUpTrack } from './components/app/overlays/now-playing-toast/resolveNextUpTrack';
import { shouldShowNowPlayingToast } from './components/app/overlays/now-playing-toast/nowPlayingToastVisibility';
import { isWallLibrarySuite, useActiveLibrarySuiteId } from './library/app/librarySuiteChoice';
import {
    createSearchAlbumCollection,
    createSearchArtistCollection,
} from './components/app/search/searchCollectionAdapters';
import { usePlayerPanelModel } from './components/app/player-panel/usePlayerPanelModel';
import { createQueueMutations } from './components/app/player-panel/createQueueMutations';
import { Album, Artist, LyricData, Theme, PlayerState, SongResult, ReplayGainMode, StatusMessage, PlaybackContext, StageLoopMode, UnifiedSong } from './types';
import type { LocalSong } from './types';
import { getLocalSongArrayBuffer } from './services/localMusicService';
import { registerLocalTrackFileReader } from './services/analysis/trackAudio';
import type { MediaId, OnlineProviderId, ProviderCollection } from './types/onlineMusic';
import { resolveSongCatalogRef } from './services/onlineMusic/catalogRefs';
import { omni } from './services/onlineMusic/omni';
import { consumeProgrammaticPause, playbackFade } from './services/playbackFade';
import { getSongArtistLabel, getSongCoverUrl } from './services/onlineMusic/songMetadata';
import { isNavidromeEnabled } from './services/navidromeService';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useNeteaseLibrary } from './hooks/useNeteaseLibrary';
import { useLibraryAccountController } from './library/app/useLibraryAccountController';
import { createLibraryAccountSwitchCleanupPort } from './library/app/createLibraryAccountPort';
import { useAppWallToolsHost } from './components/app/wall-tools/useAppWallToolsHost';
import { useLibraryAccountProviders } from './library/core/account/useLibraryAccount';
import { resolveActiveProviderSummary } from './library/core/account/accountRules';
import { useAppPreferences } from './hooks/useAppPreferences';
import { useElectronPlaybackBridge } from './components/app/playback/bridges/useElectronPlaybackBridge';
import { useElectronDisplaySleepBlocker } from './hooks/useElectronDisplaySleepBlocker';
import { useSleepTimer } from './hooks/useSleepTimer';
import { useProviderNotices } from './components/app/useProviderNotices';
import { useLocalLibraryAutoScan } from './hooks/useLocalLibraryAutoScan';
import { useElectronVideoExportController } from './hooks/useElectronVideoExportController';
import { useElectronWindowPlaybackHandoff } from './components/app/playback/restore/useElectronWindowPlaybackHandoff';
import { useMediaSessionBridge } from './hooks/useMediaSessionBridge';
import { usePlayerChromeAutoHide } from './hooks/usePlayerChromeAutoHide';
import { useIdleCursorHide } from './hooks/useIdleCursorHide';
import { usePlaybackAudioBridge } from './components/app/playback/bridges/usePlaybackAudioBridge';
import { useTranscodeFallback } from './hooks/useTranscodeFallback';
import { useAutomixDecks, type AutomixDeckId } from './services/automix/useAutomixDecks';
import { usePlaybackInteractionBridge } from './components/app/playback/bridges/usePlaybackInteractionBridge';
import { usePersonalFmModeController } from './hooks/usePersonalFmModeController';
import { PERSONAL_FM_MODE_COMMAND_ID } from './components/command-palette/commands/fmModeCommand';
import { usePlaybackUiEffects } from './components/app/playback/bridges/usePlaybackUiEffects';
import { useLibraryPlaybackController } from './components/app/playback/start/useLibraryPlaybackController';
import { useNavidromeScrobbleReporter } from './hooks/useNavidromeScrobbleReporter';
import { usePlaybackReporter } from './components/app/playback/bridges/usePlaybackReporter';
import { useRecentPlaysRecorder } from './components/app/home/explore/useRecentPlaysRecorder';
import { usePlaybackQueueController } from './components/app/playback/start/usePlaybackQueueController';
import { usePlaybackTransportController } from './components/app/playback/bridges/usePlaybackTransportController';
import { useLocalLibraryCatalog } from './hooks/useLocalLibraryCatalog';
import { usePlaybackVisualizerBridge } from './components/app/playback/bridges/usePlaybackVisualizerBridge';
import { useLyricReadHead } from './components/app/playback/bridges/useLyricReadHead';
import { useRandomVisualizerMode } from './hooks/useRandomVisualizerMode';
import { useObsBrowserSourcePublisher } from './hooks/useObsBrowserSourcePublisher';
import { useLyricApiPublisher } from './hooks/useLyricApiPublisher';
import { useSessionRestoreController } from './components/app/playback/restore/useSessionRestoreController';
import { useStagePlaybackController } from './components/app/playback/useStagePlaybackController';
import { useSongThemeAutoGeneration } from './hooks/useSongThemeAutoGeneration';
import { useThemeController } from './hooks/useThemeController';
import { useOnlineSongMetadataHydration } from './hooks/useOnlineSongMetadataHydration';
import { resolveCommandPaletteSearchSource, resolveSearchSource, useSearchNavigationStore } from './stores/useSearchNavigationStore';
import { useOnlineProviderAccountStore } from './stores/useOnlineProviderAccountStore';
import { useShallow } from 'zustand/react/shallow';
import { clampMediaVolume, toSafeRemoteUrl } from './utils/appPlaybackHelpers';
import { hasLoopedToStart } from './services/playedTrackCache';
import { getOnlineProviderIdForSong, isLocalPlaybackSong, isNavidromePlaybackSong, isStagePlaybackSong } from './utils/appPlaybackGuards';
import { writeLyricOffset } from './utils/lyrics/lyricOffsetMemory';
import { FALLBACK_AI_DUAL_THEME } from './services/themeSanitizer';
import { BASE_DUAL_THEME, DAYLIGHT_THEME, DEFAULT_THEME } from './services/baseThemes';
import { initializeSyncCoordinator } from './services/sync/syncCoordinator';
import { applyLocalLibraryEntityDisplay } from './services/playbackAdapters';
import { transitionCapabilities } from './services/automix/stems';
import { buildLocalLibraryIndex } from './utils/localLibraryIndex';
import type { PlayerChromeVisibilityMode } from './types/remoteControl';
import { setStatusMessage as setStatusMsg, useStatusMessage } from './stores/useStatusMessageStore';
import { selectVisualizerSettingsSnapshot, useVisualizerSettingsStore } from './stores/useVisualizerSettingsStore';
import { selectLyricSettingsSnapshot, useLyricSettingsStore } from './stores/useLyricSettingsStore';
import { selectTypographySettingsSnapshot, useTypographySettingsStore } from './stores/useTypographySettingsStore';
import { selectPlayerChromeSettingsSnapshot, usePlayerChromeSettingsStore } from './stores/usePlayerChromeSettingsStore';
import { usePlayerDoubleTapGesture } from './components/app/playback/usePlayerDoubleTapGesture';
import { usePlayerLongPressGesture } from './components/app/playback/usePlayerLongPressGesture';
import type { DoubleTapZone } from './components/app/playback/doubleTapGesture';
import PlayerDoubleTapFeedback, { type PlayerDoubleTapCue, type PlayerGestureCueKind } from './components/app/overlays/PlayerDoubleTapFeedback';
import PlayerLongPressHandle from './components/app/overlays/PlayerLongPressHandle';
import AppUpdateDialog from './components/modal/AppUpdateDialog';
import ChromeEditOverlay from './components/wall/ChromeEditOverlay';
import ExitConfirmDialog from './components/modal/ExitConfirmDialog';
import { moveAppToBack } from './services/appExit';
import { useAppUpdateStore } from './stores/useAppUpdateStore';
import { applySystemBarsVisibility } from './services/systemBars';
import { applyScreenWakeLock, resyncScreenWakeLock } from './services/screenWakeLock';
import { selectThemeSettingsSnapshot, useThemeSettingsStore } from './stores/useThemeSettingsStore';
import { useAutomixSettingsStore } from './stores/useAutomixSettingsStore';
import { selectDesktopSettingsSnapshot, useDesktopSettingsStore } from './stores/useDesktopSettingsStore';
import { selectSleepTimerSnapshot, useSleepTimerStore } from './stores/useSleepTimerStore';
import { selectStageSettingsSnapshot, useStageSettingsStore } from './stores/useStageSettingsStore';
import { selectAudioSettingsSnapshot, useAudioSettingsStore } from './stores/useAudioSettingsStore';
import { useSettingsModalStore } from './stores/useSettingsModalStore';
import { audioBands, audioPower, bass, currentTime, lowMid, lyricCurrentTime, mid, spectrum, treble, vocal } from './stores/motionSignals';
import { useAppChromeStore } from './stores/useAppChromeStore';
import { useAppViewStore } from './stores/useAppViewStore';
import { endLoadingToPlay, selectDisplayCoverUrl, selectDisplayDuration, selectDisplayLyrics, selectDisplayPlayerState, selectDisplaySong, selectIsShowingTail, usePlaybackStore } from './stores/usePlaybackStore';
import { askForSong, showSong } from './components/app/playback/currentSong';
import { useLibraryStore } from './stores/useLibraryStore';
import { selectLibraryOccludesPlayer, selectLibraryPlayerBackdrop, useLibraryPlayerOcclusionStore } from './stores/useLibraryPlayerOcclusionStore';
import { resolveVisualizerBackdropBlur, visualizerBackdropStyle } from './components/app/presentation/playerVisualizerBackdrop';
import { useLibraryOcclusionSettled } from './hooks/useLibraryOcclusionSettled';
import { useWallHandoffStore } from './stores/useWallHandoffStore';
import { countRender } from './dev/renderCount';
import { resolveSongLiked } from './utils/resolveSongLiked';
import StageSessionEmptyState from './components/app/stage/StageSessionEmptyState';
import { useVisualizerRendererModel } from './components/visualizer/useVisualizerRendererModel';
import { useVisualizerTunings } from './components/visualizer/useVisualizerTunings';
import { usePlaybackRuntimeRefs } from './components/app/playback/usePlaybackRuntimeRefs';
import { useElectronWindowChrome } from './hooks/useElectronWindowChrome';
import { useTransportCommandRefs } from './components/app/playback/bridges/useTransportCommandRefs';
import { useNativeMediaActions } from './hooks/useNativeMediaActions';
import { useAccountReads } from './hooks/useAccountReads';
import { useAudioOutputDevice } from './hooks/useAudioOutputDevice';
import { useThemeQuickEditorContext } from './hooks/useThemeQuickEditorContext';
import { usePlayerBottomBarOffset } from './hooks/usePlayerBottomBarOffset';
import { usePlayerBottomBarPositioningEntry } from './hooks/usePlayerBottomBarPositioningEntry';
import { PlayerBottomBarLayoutContext } from './components/floating-player/PlayerBottomBarLayoutContext';
import { useFoliumHostBridge } from './mods/runtime/hostBridge';
import { useFoliumHostActions } from './mods/runtime/hostActions';
import { FoliumStageLayerSlot } from './mods/folium/registries/stageLayers';
import { errorFields } from './utils/errorText';
import { runsOnWindows } from './utils/platform';

const LOCAL_MUSIC_UPDATED_EVENT = 'folia-local-music-updated';
const DEV_DEBUG_SHORTCUT_LABEL = 'Alt+Shift+D';
const ONLINE_AUDIO_URL_TTL_MS = 1200 * 1000;
const ONLINE_AUDIO_URL_REFRESH_BUFFER_MS = 60 * 1000;
const LOCAL_TAIL_DECODE_ERROR_TOLERANCE_SEC = 3;
/** How many seconds before a track ends the now playing card previews the queue's next track. */
const NEXT_UP_LEAD_SEC = 5;

export default function App() {
    countRender('App');
    const { t } = useTranslation();
    const {
        navidromeEnabled, setNavidromeEnabledState,
        starredNavidromeSongIds, setStarredNavidromeSongIds,
        isProviderSyncing, setIsProviderSyncing,
    } = useLibraryStore(useShallow(state => ({
        navidromeEnabled: state.navidromeEnabled,
        setNavidromeEnabledState: state.setNavidromeEnabledState,
        starredNavidromeSongIds: state.starredNavidromeSongIds,
        setStarredNavidromeSongIds: state.setStarredNavidromeSongIds,
        isProviderSyncing: state.isProviderSyncing,
        setIsProviderSyncing: state.setIsProviderSyncing,
    })));
    const {
        currentSong, setCurrentSong,
        audioSrc, setAudioSrc,
        lyrics, setLyricsState,
        cachedCoverUrl, setCachedCoverUrl,
        duration, setDuration,
        playerState, setPlayerState,
        currentLineIndex,
        playQueue, setPlayQueue,
        activePlaybackContext,
        isFmMode,
        setReplayGainMode,
        lyricTimelineOffsetMs, setLyricTimelineOffsetMs,
    } = usePlaybackStore(useShallow(state => ({
        currentSong: state.currentSong, setCurrentSong: state.setCurrentSong,
        audioSrc: state.audioSrc, setAudioSrc: state.setAudioSrc,
        lyrics: state.lyrics, setLyricsState: state.setLyricsState,
        cachedCoverUrl: state.cachedCoverUrl, setCachedCoverUrl: state.setCachedCoverUrl,
        duration: state.duration, setDuration: state.setDuration,
        playerState: state.playerState, setPlayerState: state.setPlayerState,
        currentLineIndex: state.currentLineIndex, setCurrentLineIndex: state.setCurrentLineIndex,
        playQueue: state.playQueue, setPlayQueue: state.setPlayQueue,
        activePlaybackContext: state.activePlaybackContext, setActivePlaybackContext: state.setActivePlaybackContext,
        isFmMode: state.isFmMode,
        replayGainMode: state.replayGainMode, setReplayGainMode: state.setReplayGainMode,
        lyricTimelineOffsetMs: state.lyricTimelineOffsetMs, setLyricTimelineOffsetMs: state.setLyricTimelineOffsetMs,
    })));
    const {
        isPanelOpen, setIsPanelOpen,
        setPanelTab,
        setPlayerPanelAnchor,
        isHomeFullyHidden, setIsHomeFullyHidden,
    } = useAppViewStore(useShallow(state => ({
        isPanelOpen: state.isPanelOpen,
        setIsPanelOpen: state.setIsPanelOpen,
        setPanelTab: state.setPanelTab,
        setPlayerPanelAnchor: state.setPlayerPanelAnchor,
        isHomeFullyHidden: state.isHomeFullyHidden,
        setIsHomeFullyHidden: state.setIsHomeFullyHidden,
    })));
    const {
        isTitlebarRevealed,
        showTransparentWindowBorder,
        isMainWindowClickThroughEnabled,
        isClickThroughToggleHotspotActive, setIsClickThroughToggleHotspotActive,
        setIsPlayerPanelGuideHotspotActive,
        isPlayerChromeHidden, setIsPlayerChromeHidden,
        isDevDebugOverlayVisible,
    } = useAppChromeStore(useShallow(state => ({
        isTitlebarRevealed: state.isTitlebarRevealed,
        showTransparentWindowBorder: state.showTransparentWindowBorder,
        isMainWindowClickThroughEnabled: state.isMainWindowClickThroughEnabled,
        isClickThroughToggleHotspotActive: state.isClickThroughToggleHotspotActive,
        setIsClickThroughToggleHotspotActive: state.setIsClickThroughToggleHotspotActive,
        setIsPlayerPanelGuideHotspotActive: state.setIsPlayerPanelGuideHotspotActive,
        isPlayerChromeHidden: state.isPlayerChromeHidden,
        setIsPlayerChromeHidden: state.setIsPlayerChromeHidden,
        isDevDebugOverlayVisible: state.isDevDebugOverlayVisible,
    })));
    const isDev = import.meta.env.DEV;
    const isElectronWindow = Boolean((window as typeof window & { electron?: unknown; }).electron);

    // Player Data
    useOnlineSongMetadataHydration(currentSong, setCurrentSong);

    // Queue

    // UI State
    const statusMsg = useStatusMessage();
    useProviderNotices(t);
    // Watches the imported local folders and rescans them when their contents change.
    useLocalLibraryAutoScan();

    // Auto-close the player panel when leaving the player view
    // (Effect moved to after useAppNavigation where currentView is defined)
    const { settingsModalState } = useSettingsModalStore(useShallow(state => ({
        settingsModalState: state.settingsModalState,
    })));
    const automixEnabled = useAutomixSettingsStore(state => state.automixEnabled);
    const transitionMode = useAutomixSettingsStore(state => state.transitionMode);
    const crossfadeMaxSec = useAutomixSettingsStore(state => state.crossfadeMaxSec);
    const transitionPerformance = useAutomixSettingsStore(state => state.transitionPerformance);
    const transitionAnimation = useAutomixSettingsStore(state => state.transitionAnimation);
    /**
     * The same test the settings panel disables its performance switch by, for the command palette.
     *
     * Asked in one place rather than two: the panel greys the switch out when there is no stem model
     * to run, and the palette command used to check only that this was the desktop build - so the
     * command could turn on a mode the panel would not let anyone turn on, and the preference stayed
     * set for whenever a model did arrive. Left as a getter for the palette to call; see the note on
     * `canUseTransitionPerformance` in the palette's context type.
     */
    const canUseTransitionPerformance = useCallback(() => transitionCapabilities().stems, []);
    // Memoised because it is a dependency of the planning callback: a fresh object every render
    // would rebuild that callback on every frame of playback.
    const transitionSettings = useMemo(
        () => ({ mode: transitionMode, crossfadeMaxSec, performance: transitionPerformance }),
        [transitionMode, crossfadeMaxSec, transitionPerformance],
    );
    // The analysis worker keeps htdemucs loaded while automix can ask for it, and releases it the
    // moment it cannot - the switch off, or the crossfade mode, which reads no model. Sent on mount
    // too: the main process starts out assuming off. See electron/analysis/host.cjs.
    useEffect(() => {
        window.electron?.setAutomixEnabled?.(automixEnabled && transitionMode === 'automix');
    }, [automixEnabled, transitionMode]);

    const startupExperience = useStartupExperienceGate();

    useEffect(() => initializeSyncCoordinator(), []);

    const loadNavidromeFavorites = useCallback(async () => {
        if (!navidromeEnabled) {
            setStarredNavidromeSongIds(new Set());
            return;
        }

        const { getNavidromeConfig, navidromeApi } = await import('./services/navidromeService');
        const config = getNavidromeConfig();
        if (!config) return;

        try {
            const songs = await navidromeApi.getStarred2(config) ?? [];
            setStarredNavidromeSongIds(new Set(songs.map(song => song.id)));
        } catch (error) {
            console.warn('[App] Failed to load Navidrome favorites:', error);
        }
    }, [navidromeEnabled]);

    useEffect(() => {
        void loadNavidromeFavorites();
    }, [loadNavidromeFavorites]);

    const prevSettingsOpenRef = useRef(false);
    useEffect(() => {
        const isOpen = settingsModalState.isOpen;
        if (!isOpen && prevSettingsOpenRef.current && navidromeEnabled) {
            void loadNavidromeFavorites();
        }
        prevSettingsOpenRef.current = isOpen;
    }, [settingsModalState.isOpen, navidromeEnabled, loadNavidromeFavorites]);

    // Player State
    useEffect(() => {
        (window as any).__folia_current_time = currentTime;
    }, []);

    // Progress Bar State
    // Removed isDragging and sliderValue as they are handled by ProgressBar component

    // Audio Analysis State

    // Refs
    // The mutable substrate the playback controllers coordinate through; see the hook for why it
    // has to be held here rather than by any one of them.
    const {
        audioRef,
        audioContextRef,
        analyserRef,
        gainNodeRef,
        blobUrlRef,
        animationFrameRef,
        shouldAutoPlay,
        currentSongRef,
        currentSongFullRef,
        playbackAutoSkipCountRef,
        volumePreviewFrameRef,
        pendingVolumePreviewRef,
        pendingResumeTimeRef,
        onlinePlaybackRecoveryRef,
        lastAudioRecoverySourceRef,
        currentOnlineAudioUrlFetchedAtRef,
    } = usePlaybackRuntimeRefs();
    // The automix decks are set up much further down, but a few reset paths declared above here
    // need to be able to stop a transition, and queue navigation needs the track being SHOWN. A ref
    // keeps both reachable without reordering them; it is reassigned on every render, so the
    // picture read through it is the committed one.
    const automixRef = useRef<{
        abortTransition: () => void;
        transitionDisplay: { song: SongResult | null } | null;
    } | null>(null);
    const queueScrollRef = useRef<HTMLDivElement>(null);
    // Buffer progress debug helper. Uncomment this ref, the reset effect below,
    // and the audio `onProgress` handler to log buffered percent again.
    // const lastBufferedPercentLogRef = useRef<number | null>(null);
    const [isLyricsLoading, setIsLyricsLoadingState] = useState(false);
    // Every write of the loading mark is counted, so a play that gives up late can tell whether the
    // mark is still the one it set (onPlayNavidromeSong).
    const lyricsLoadingWritesRef = useRef(0);
    const setIsLyricsLoading = useCallback<typeof setIsLyricsLoadingState>(next => {
        lyricsLoadingWritesRef.current += 1;
        setIsLyricsLoadingState(next);
    }, []);
    const isNowPlayingControlDisabledRef = useRef(false);


    // Navigation persistence state shared by the Grid home surfaces.
    const homeViewTab = useSearchNavigationStore(state => state.homeViewTab);
    const setHomeViewTab = useSearchNavigationStore(state => state.setHomeViewTab);
    const handleToggleNavidromeEnabled = useCallback((enabled: boolean) => {
        setNavidromeEnabledState(enabled);
        if (!enabled && homeViewTab === 'navidrome') {
            setHomeViewTab('local');
        }
    }, [homeViewTab, setHomeViewTab]);

    // Preferences and Theme
    // Manages user preferences for audio quality, theme settings, 
    // and related actions like toggling cover color backgrounds and static mode,
    // as well as setting daylight mode preference
    useAppPreferences();
    const {
        audioQuality,
        queueAddBehavior,
        loopMode,
        volume,
        isMuted,
        handleToggleLoopMode,
    } = useAudioSettingsStore(useShallow(selectAudioSettingsSnapshot));
    const {
        preventDisplaySleepDuringPlayback,
        wallpaperMode,
    } = useDesktopSettingsStore(useShallow(selectDesktopSettingsSnapshot));
    const {
        stageTrackPillMode,
        stageTrackPillOnHome,
    } = useStageSettingsStore(useShallow(selectStageSettingsSnapshot));
    const {
        sleepTimerEnabled,
        sleepTimerHours,
        sleepTimerMinutes,
    } = useSleepTimerStore(useShallow(selectSleepTimerSnapshot));
    const {
        disableHomeDynamicBackground,
        isDaylight,
        setDaylightPreference,
    } = useThemeSettingsStore(useShallow(selectThemeSettingsSnapshot));
    const {
        hidePlayerProgressBar,
        playerBottomBarOffset,
        hidePlayerRightPanelButton,
        transparentPlayerBackground,
        enablePlayerPageNativeBlur,
        autoHidePlayerChrome,
        handleToggleAutoHidePlayerChrome,
        autoHideCursorWithPlayerChrome,
        hideCursorWhenIdle,
        enablePlayerDoubleTapGesture,
        enablePlayerLongPressQueue,
        alwaysShowMainWindowTitlebar,
        hideFullscreenButton,
        handleToggleTransparentPlayerBackground,
    } = usePlayerChromeSettingsStore(useShallow(selectPlayerChromeSettingsSnapshot));
    const {
        hidePlayerTranslationSubtitle,
        lyricsFontStyle,
        lyricsFontWeight,
        lyricsFontFallbackFamilies,
        subtitleFontInheritsLyrics,
        subtitleFontStyle,
        subtitleFontWeight,
        subtitleFontFamily,
        subtitleFontFallbackFamilies,
        lyricsCustomFontFamily,
    } = useTypographySettingsStore(useShallow(selectTypographySettingsSnapshot));
    const {
        globalLyricTimelineOffsetMs,
        lyricFilterPattern,
        lyricFilterEnabled,
        lyricStaffPolicy,
        lyricStaffMinDwellSeconds,
        lyricStaffAbsorbMode,
        lyricStaffPattern,
        handleSetLyricFilterPattern,
        handleSetLyricFilterEnabled,
        handleSetLyricStaffPolicy,
        handleSetLyricStaffMinDwellSeconds,
        handleSetLyricStaffAbsorbMode,
        handleSetLyricStaffPattern,
    } = useLyricSettingsStore(useShallow(selectLyricSettingsSnapshot));
    const {
        visualizerMode,
        randomVisualizerModePerSong,
        handleSetVisualizerMode,
    } = useVisualizerSettingsStore(useShallow(selectVisualizerSettingsSnapshot));

    useElectronDisplaySleepBlocker(
        preventDisplaySleepDuringPlayback,
        playerState === PlayerState.PLAYING,
    );

    const visualizerTunings = useVisualizerTunings();

    const showPlayerChromeVisibilityModeStatus = useCallback((mode: PlayerChromeVisibilityMode) => {
        setStatusMsg({
            type: 'info',
            text: t(`status.playerChrome${mode === 'always-hidden' ? 'AlwaysHidden' : mode === 'always-visible' ? 'AlwaysVisible' : 'AutoHide'}`),
            nonce: Date.now(),
        });
    }, [t]);

    const {
        playerChromeVisibilityMode,
        cyclePlayerChromeVisibilityMode,
        setPlayerChromeVisibilityModeTo,
    } = usePlayerChromeAutoHide({
        autoHidePlayerChrome,
        initialPlayerChromeHidden: isPlayerChromeHidden,
        suppressPointerReveal: isMainWindowClickThroughEnabled,
        setIsPlayerChromeHidden,
        setAutoHidePlayerChromePreference: handleToggleAutoHidePlayerChrome,
        onModeChange: showPlayerChromeVisibilityModeStatus,
    });

    useRandomVisualizerMode({
        currentSong,
        enabled: randomVisualizerModePerSong,
        visualizerMode,
        setVisualizerMode: handleSetVisualizerMode,
    });

    const setLyrics = useMemo(
        () => createLyricsSetter(setLyricsState, lyricFilterEnabled ? lyricFilterPattern : '', currentSongFullRef, {
            policy: lyricStaffPolicy,
            minDwellSeconds: lyricStaffMinDwellSeconds,
            absorbMode: lyricStaffAbsorbMode,
            pattern: lyricStaffPattern,
        }),
        [lyricFilterEnabled, lyricFilterPattern, lyricStaffPolicy, lyricStaffMinDwellSeconds, lyricStaffAbsorbMode, lyricStaffPattern],
    );
    // 保存过滤设置后要用新设置重新铺一遍当前歌词，而此时闭包里的 setLyrics 还是旧的。
    const setLyricsRef = useRef(setLyrics);
    setLyricsRef.current = setLyrics;
    const setLyricsStable = useCallback((nextLyrics: LyricData | null) => setLyricsRef.current(nextLyrics), []);

    const handleLyricTimelineOffsetChange = useCallback((offsetMs: number) => {
        setLyricTimelineOffsetMs(offsetMs);
        writeLyricOffset(currentSongFullRef.current?.id, offsetMs);
    }, []);

    // What every lyric consumer (visualizers, OBS source, Stage/Remote mirrors, lyric API) actually
    // uses: the per-song manual correction plus the device-wide audio latency compensation. The panel
    // control below keeps editing the per-song value alone.
    const effectiveLyricTimelineOffsetMs = lyricTimelineOffsetMs + globalLyricTimelineOffsetMs;

    const effectiveLoopMode: StageLoopMode = loopMode;

    const getTargetPlaybackVolume = useCallback(() => (isMuted ? 0 : volume), [isMuted, volume]);

    const persistLastPlaybackCache = useCallback(persistPlaybackCache, []);

    const syncOutputGain = useCallback((targetVolume: number, smoothing = 0.015) => {
        const clampedVolume = clampMediaVolume(targetVolume);

        if (gainNodeRef.current && audioContextRef.current) {
            // Volume only. ReplayGain lives on each deck now, because during a blend the two
            // tracks need their own compensation and this node is shared by both.
            if (smoothing <= 0) {
                gainNodeRef.current.gain.setValueAtTime(
                    clampedVolume,
                    audioContextRef.current.currentTime
                );
            } else {
                gainNodeRef.current.gain.setTargetAtTime(
                    clampedVolume,
                    audioContextRef.current.currentTime,
                    smoothing
                );
            }

            if (audioRef.current) {
                audioRef.current.volume = 1;
                audioRef.current.muted = false;
            }
            return;
        }

        if (audioRef.current) {
            audioRef.current.volume = clampedVolume;
            audioRef.current.muted = isMuted;
        }
    }, [isMuted]);

    const { handleAudioOutputDeviceChange } = useAudioOutputDevice({
        audioRef,
        audioContextRef,
        gainNodeRef,
    });

    const handlePreviewVolume = useCallback((val: number) => {
        pendingVolumePreviewRef.current = val;

        if (volumePreviewFrameRef.current !== null) {
            return;
        }

        volumePreviewFrameRef.current = requestAnimationFrame(() => {
            volumePreviewFrameRef.current = null;
            const nextVolume = pendingVolumePreviewRef.current;
            if (nextVolume !== null) {
                syncOutputGain(nextVolume, 0.015);
            }
        });
    }, [syncOutputGain]);

    const {
        shouldRefreshCurrentOnlineAudioSource,
        recoverOnlinePlaybackSource,
    } = useMemo(() => createOnlineRecoveryController({
        audioQuality,
        currentSong,
        audioSrc,
        audioRef,
        blobUrlRef,
        shouldAutoPlayRef: shouldAutoPlay,
        pendingResumeTimeRef,
        onlinePlaybackRecoveryRef,
        lastAudioRecoverySourceRef,
        currentOnlineAudioUrlFetchedAtRef,
        persistLastPlaybackCache,
        onlineAudioUrlTtlMs: ONLINE_AUDIO_URL_TTL_MS,
        onlineAudioUrlRefreshBufferMs: ONLINE_AUDIO_URL_REFRESH_BUFFER_MS,
    }), [audioQuality, audioSrc, audioRef, blobUrlRef, currentOnlineAudioUrlFetchedAtRef, currentSong, lastAudioRecoverySourceRef, onlinePlaybackRecoveryRef, pendingResumeTimeRef, persistLastPlaybackCache, setAudioSrc, setCurrentSong, setPlayQueue, shouldAutoPlay]);

    const getCoverUrl = useMemo(
        () => createCoverUrlResolver(cachedCoverUrl, currentSong),
        [cachedCoverUrl, currentSong],
    );

    const coverUrl = getCoverUrl();

    // Theme Controller
    // manages current theme, daylight mode, and related actions like generating AI themes 
    // and restoring cached themes for songs
    const themeController = useThemeController({
        defaultTheme: DEFAULT_THEME,
        daylightTheme: DAYLIGHT_THEME,
        isDaylight,
        setDaylightPreference,
        coverUrl,
        t,
    });
    const {
        theme,
        setTheme,
        aiTheme,
        customTheme,
        hasCustomTheme,
        themeSourceModel,
        isCustomThemePreferred,
        songThemeAutoSwitchEnabled,
        songThemeAutoGenerateEnabled,
        themeGenerationSource,
        bgMode,
        isGeneratingTheme,
        handleToggleDaylight,
        handleBgModeChange,
        handleResetTheme,
        applyDefaultTheme,
        restoreCachedThemeForSong,
        generateAITheme,
        getThemeParkSeedTheme,
        saveCustomDualTheme,
        saveEditedAiDualTheme,
        applyCustomTheme,
        handleCustomThemePreferenceChange,
        handleSongThemeAutoSwitchChange,
        handleSongThemeAutoGenerateChange,
        handleThemeGenerationSourceChange,
    } = themeController;
    // Folium: publish what is on screen to the main process (runtime snapshot
    // for main-side mods and the export service).
    useFoliumHostBridge(theme, isDaylight);

    useThemeQuickEditorContext({
        aiTheme,
        customTheme,
        bgMode,
        coverUrl,
        restoreCachedThemeForSong,
    });

    // Navigation and Library Hooks
    // manages current view, selected items, and navigation functions across the app
    const {
        currentView,
        focusedPlaylistIndex,
        setFocusedPlaylistIndex,
        navidromeFocusedAlbumIndex,
        setNavidromeFocusedAlbumIndex,
        localMusicState,
        setLocalMusicState,
        navigateToPlayer,
        navigateToPlaybackView,
        navigateFromPlayerCapsule,
        navigateToHome,
        navigateToLattice,
        navigateBackFromLattice,
        navigateBackFromPlayer,
        navigateDirectHome,
        navigateToSearch,
        closeSearchView,
        navigateToCollection,
        pushCollection,
        popCollectionTo,
        backCollection,
    } = useAppNavigation();
    const reduceLatticeMotion = useReducedMotionFor('lattice');
    const visualizerAroundWall = useVisualizerAroundWall();

    usePlayerBottomBarOffset(playerBottomBarOffset);
    usePlayerBottomBarPositioningEntry(navigateToPlayer);

    // Auto-close the player panel when leaving the player view
    useEffect(() => {
        if (currentView !== 'player' && isPanelOpen) {
            setIsPanelOpen(false);
        }
    }, [currentView, isPanelOpen]);

    useEffect(() => {
        if (isPanelOpen) {
            setIsPlayerPanelGuideHotspotActive(previous => previous ? false : previous);
        }
    }, [isPanelOpen]);

    const {
        isSearchOpen,
        searchSourceTab,
        submitSearch,
        loadMoreSearchResults,
    } = useSearchNavigationStore(useShallow(state => ({
        isSearchOpen: state.isSearchOpen,
        searchSourceTab: state.searchSourceTab,
        submitSearch: state.submitSearch,
        loadMoreSearchResults: state.loadMoreSearchResults,
    })));

    // Netease Library Hook
    // the NetEase account as the account store holds it
    const {
        user,
        playlists,
        cloudPlaylist,
    } = useNeteaseLibrary();

    // Every platform's account is read and signed out of through omni (services/onlineMusic/account/),
    // NetEase like the others. One entry per platform registered at start; a mod's source has none.
    const onlineProviderRefreshers = useMemo<Partial<Record<OnlineProviderId, () => Promise<unknown>>>>(() => Object.fromEntries(
        omni.getProviderSummaries().map(({ providerId }) => [providerId, async () => await omni.readAccount(providerId, 'sync') === 'read']),
    ), []);
    // 在线账户 controller（Library v2 · A4）：登录、选平台、切换确认与登出都在 core，App 只交出退出与退出前的那一问
    // （useProviderSignOut），以及换平台时清空播放器的端口。端口读的句柄都是稳定引用，建一次。
    const { confirmLogout, signOut, dialog: signOutDialog } = useProviderSignOut();
    const [providerSwitchCleanup] = useState(() => createLibraryAccountSwitchCleanupPort(() => ({
        audioRef,
        automixRef,
        shouldAutoPlay,
        setLyrics: setLyricsStable,
        setIsLyricsLoading,
    })));
    const accountController = useLibraryAccountController({
        logout: signOut,
        confirmLogout,
        switchCleanup: providerSwitchCleanup,
    });
    const { providers: onlineProviders, activeProviderId } = useLibraryAccountProviders(accountController);
    const activeProvider = useMemo(
        () => resolveActiveProviderSummary(onlineProviders, activeProviderId),
        [activeProviderId, onlineProviders],
    );
    // 保留 App 对整张账户表的订阅（原先 useOnlineProviderPlatform 订阅它）：底栏与命令面板的收藏心形
    // （resolveSongLiked → omni.isSongLiked）经 getState 读各平台的 likedSongIds，账户摘要里没有它，
    // 只订阅 controller 快照的话收藏之后心形不会当场更新。取值没有用处。
    useOnlineProviderAccountStore(state => state.accounts);
    const handleActiveProviderSyncData = useCallback(async () => {
        const providerId = activeProviderId;
        setIsProviderSyncing(true);
        try {
            const synced = await onlineProviderRefreshers[providerId]?.();
            const refreshedAccount = useOnlineProviderAccountStore.getState().accounts[providerId];
            const authExpired = synced === false && refreshedAccount?.error === 'auth-required';
            setStatusMsg({
                type: synced === false ? 'error' : 'success',
                text: synced === false
                    ? t(authExpired ? 'status.loginExpired' : 'status.syncFailed')
                    : t('status.dataSynced'),
            });
        } catch (error) {
            console.warn('[OmniSync] Provider data sync failed', { providerId, ...errorFields(error) });
            setStatusMsg({ type: 'error', text: t('status.syncFailed') });
        } finally {
            setIsProviderSyncing(false);
        }
    }, [activeProviderId, onlineProviderRefreshers, setStatusMsg, t]);
    const refreshActiveProviderPlaylists = useCallback(
        () => omni.refreshProviderPlaylists(activeProviderId),
        [activeProviderId],
    );
    useAccountReads();
    const {
        stageStatus,
        setStageStatus,
        stageSource,
        stageActiveEntryKind,
        stageLyricsSession,
        stageMediaSession,
        nowPlayingConnectionStatus,
        nowPlayingTrack,
        nowPlayingLyricPayload,
        nowPlayingProgressMs,
        nowPlayingProgressQuality,
        nowPlayingPaused,
        nowPlayingDebugInfo,
        isNowPlayingStageActive,
        isPlayerCapStageActive,
        getPlayerCapDisplayTime,
        playerCapConnectionStatus,
        playerCapPlayers,
        mainPlaybackSnapshotRef,
        stageLyricsClockRef,
        syncStageLyricsClock,
        getSyntheticStageLyricsTime,
        syncNowPlayingClock,
        getNowPlayingDisplayTime,
        loadStageSessionIntoPlayback,
        restoreStagePlaybackHandoff,
        clearPersistedStagePlaybackCache,
        openStagePlayer,
        leaveStagePlayback,
        interruptStagePlaybackForMainTransition,
        clearStagePlaybackSession,
    } = useStagePlaybackController({
        isDev,
        isElectronWindow,
        audioRef,
        shouldAutoPlayRef: shouldAutoPlay,
        pendingResumeTimeRef,
        lastAudioRecoverySourceRef,
        currentOnlineAudioUrlFetchedAtRef,
        setLyrics,
        setIsLyricsLoading,
        navigateToPlayer,
    });

    const {
        restoreStatus: windowPlaybackHandoffRestoreStatus,
        toggleTransparentModeWithHandoff,
    } = useElectronWindowPlaybackHandoff({
        isElectronWindow,
        userId: user?.id,
        navigateToPlayer,
        audioRef,
        mainPlaybackSnapshotRef,
        stageStatus,
        stageSource,
        stageLyricsClockRef,
        nowPlayingTrack,
        nowPlayingLyricPayload,
        nowPlayingPaused,
        nowPlayingProgressMs,
        nowPlayingProgressQuality,
        getNowPlayingDisplayTime,
        restoreStagePlaybackHandoff,
        setLyrics,
        setIsLyricsLoading,
        blobUrlRef,
        shouldAutoPlayRef: shouldAutoPlay,
        pendingResumeTimeRef,
        lastAudioRecoverySourceRef,
        currentOnlineAudioUrlFetchedAtRef,
        applyTransparentPlayerBackground: handleToggleTransparentPlayerBackground,
        restoreCachedThemeForSong,
        persistLastPlaybackCache,
    });

    const { handleDirectHomeFromPanel } = useMemo(
        () => createPanelNavigation(navigateDirectHome),
        [navigateDirectHome],
    );
    // "Locate the playing song" moves between screens with the app's own navigation.
    useEffect(() => {
        usePlayingSongLocatorStore.getState().setNavigator({ navigateToHome, navigateToCollection, pushCollection });
        return () => usePlayingSongLocatorStore.getState().setNavigator(null);
    }, [navigateToCollection, navigateToHome, pushCollection]);

    // --- Local Music Functions ---

    const {
        localSongs,
        localPlaylists,
        isLyricMatchOpen,
        openLyricMatch,
        closeLyricMatch,
        loadLocalSongs,
        loadLocalPlaylists,
        onRefreshLocalSongs,
        isLocalSongLiked,
        saveCurrentQueueAsLocalPlaylist,
        addCurrentSongToLocalPlaylist,
        createCurrentLocalPlaylist,
        addCurrentSongToOnlinePlaylist,
        createCurrentOnlinePlaylist,
        addCurrentSongToNavidromePlaylist,
        createCurrentNavidromePlaylist,
        loadCurrentSongLyricPreview,
        handleLocalQueueAdd,
        onPlayLocalSong,
        onPlayNavidromeSong,
        handleUpdateLocalLyrics,
        handleChangeLyricsSource,
        handleImportOnlineLyrics,
        handleChangeOnlineLyricsSource,
        handleLyricMatchComplete,
        handleLyricMatchPureMusicMarkChanged,
        handleToggleCurrentSongPureMusicMark,
        handleNaviLyricMatchComplete,
        handleOnlineLyricMatchComplete,
        handleClearOnlineLyricsState,
        handleAutoMatchBestLyricForCurrentSong,
        handleLike,
    } = useLibraryPlaybackController({
        userId: user?.id,
        setLyrics,
        setIsLyricsLoading,
        lyricsLoadingWritesRef,
        navigateToPlaybackView,
        persistLastPlaybackCache,
        restoreCachedThemeForSong,
        interruptStagePlaybackForMainTransition,
        blobUrlRef,
        shouldAutoPlayRef: shouldAutoPlay,
        currentOnlineAudioUrlFetchedAtRef,
        pendingResumeTimeRef,
        lastAudioRecoverySourceRef,
    });

    useSessionRestoreController({
        userId: user?.id,
        blobUrlRef,
        currentOnlineAudioUrlFetchedAtRef,
        setLyrics,
        restoreCachedThemeForSong,
        persistLastPlaybackCache,
        clearPersistedStagePlaybackCache,
        loadLocalSongs,
        loadLocalPlaylists,
        canRestoreSession: windowPlaybackHandoffRestoreStatus === 'none',
        shouldAutoPlayRef: shouldAutoPlay,
    });

    const localLibraryCatalog = useLocalLibraryCatalog(localSongs);
    const openHomeCollection = useCallback(
        (collection: GridViewCollectionDescriptor) => navigateToCollection(collection, 'home'),
        [navigateToCollection],
    );
    const handleSaveLyricFilterPattern = useMemo(() => createLyricFilterPatternSaver({
        currentEffectivePattern: lyricFilterEnabled ? lyricFilterPattern : '',
        handleSetLyricFilterPattern,
        handleSetLyricFilterEnabled,
        handleSetLyricStaffPolicy,
        handleSetLyricStaffMinDwellSeconds,
        handleSetLyricStaffAbsorbMode,
        handleSetLyricStaffPattern,
        loadCurrentSongLyricPreview,
        setLyrics: setLyricsStable,
    }), [
        lyricFilterPattern,
        lyricFilterEnabled,
        handleSetLyricFilterPattern,
        handleSetLyricFilterEnabled,
        handleSetLyricStaffPolicy,
        handleSetLyricStaffMinDwellSeconds,
        handleSetLyricStaffPattern,
        loadCurrentSongLyricPreview,
        setLyricsStable,
    ]);

    const { addNavidromeSongsToQueue, applyQueueBatchOperation, removeQueueSong, moveQueueSongToEnd, moveQueueSongToNext, moveQueueSong } = useMemo(() => createQueueMutations({
        currentSong,
        playQueue,
        persistLastPlaybackCache,
        t,
        queueAddBehavior,
        audioQuality,
        userId: user?.id,
    }), [currentSong, playQueue, persistLastPlaybackCache, t, queueAddBehavior, audioQuality, user?.id]);

    // --- Effects ---

    /**
     * The track the listener can see, which a blend holds on the OUTGOING song while the queue has
     * already moved to the incoming one. Null whenever the picture is live, so queue navigation
     * falls through to `currentSong` exactly as before outside a transition.
     */
    const getDisplaySong = useCallback(() => automixRef.current?.transitionDisplay?.song ?? null, []);
    /** A manual skip overtakes a running blend; this is how the queue tells it so. */
    const endHeldTransition = useCallback(() => automixRef.current?.abortTransition(), []);

    const {
        pendingUnavailableReplacement,
        setPendingUnavailableReplacement,
        clearPendingUnavailableSkip,
        addOnlineSongToQueue,
        addOnlineSongsToQueue,
        playSong,
        playOnlineQueueFromStart,
        handleQueueAddAndPlay,
        handleSearchOverlaySubmit,
        handleSearchLoadMore,
        handleSearchResultPlay,
        handleSearchResultAddToQueue,
        handleUnavailableReplacementConfirm,
        handleNextTrack,
        handlePrevTrack,
        skipAfterPlaybackFailure,
        handleStageExternalPlayRequest,
        shuffleQueue,
        clearQueue,
    } = usePlaybackQueueController({
        isNowPlayingStageActive,
        shouldNavigateToPlayerOnTrackChange: currentView !== 'lattice',
        localSongs,
        localLibraryCatalog,
        userId: user?.id,
        setLyrics,
        setIsLyricsLoading,
        navigateToPlaybackView,
        navigateToSearch,
        persistLastPlaybackCache,
        restoreCachedThemeForSong,
        interruptStagePlaybackForMainTransition,
        onPlayLocalSong,
        onPlayNavidromeSong,
        onAddLocalSongToQueue: handleLocalQueueAdd,
        onAddNavidromeSongsToQueue: addNavidromeSongsToQueue,
        searchDeps: {
            submitSearch,
            loadMoreSearchResults,
        },
        audioRef,
        blobUrlRef,
        shouldAutoPlayRef: shouldAutoPlay,
        mainPlaybackSnapshotRef,
        playbackAutoSkipCountRef,
        pendingResumeTimeRef,
        currentOnlineAudioUrlFetchedAtRef,
        lastAudioRecoverySourceRef,
        getDisplaySong,
        endHeldTransition,
    });
    const handleSearchResultArtistOpen = useCallback(async (
        track: UnifiedSong,
        artistName: string,
        artistId?: MediaId,
        entityId?: string,
    ) => {
        try {
            const collection = await createSearchArtistCollection(track, artistName, artistId, entityId);
            if (collection) {
                navigateToCollection(collection, 'search');
                return;
            }
        } catch (error) {
            console.warn('[CatalogNavigation] Failed to resolve artist:', error);
        }
        setStatusMsg({ type: 'error', text: t('search.catalogUnavailable') });
    }, [navigateToCollection, setStatusMsg, t]);
    const handleSearchResultAlbumOpen = useCallback(async (
        track: UnifiedSong,
        albumName: string,
        albumId?: MediaId,
        entityId?: string,
    ) => {
        try {
            const collection = await createSearchAlbumCollection(track, albumName, albumId, entityId);
            if (collection) {
                navigateToCollection(collection, 'search');
                return;
            }
        } catch (error) {
            console.warn('[CatalogNavigation] Failed to resolve album:', error);
        }
        setStatusMsg({ type: 'error', text: t('search.catalogUnavailable') });
    }, [navigateToCollection, setStatusMsg, t]);

    usePlaybackUiEffects({
        statusMsg,
        loadLocalSongs,
        loadLocalPlaylists,
        localMusicUpdatedEvent: LOCAL_MUSIC_UPDATED_EVENT,
        blobUrlRef,
        volumePreviewFrameRef,
        onClearPendingUnavailableSkip: clearPendingUnavailableSkip,
    });

    // Bridges the automix hook (built here) to the media-cache writer (built a little further down in
    // usePlaybackAudioBridge). A ref rather than a prop because the writer does not exist yet at this
    // call - the same ordering the harvest/advance callbacks inside the hook solve the same way.
    const cachePlayedOutRef = useRef<(song: SongResult, src: string | null) => void>(() => { });
    // The active deck's last position on single loop, with the source it was on: a looping track
    // never fires `ended`, so its wrap back to the start is what says it was played through.
    const loopPositionRef = useRef<{ src: string; time: number } | null>(null);

    // Reads a local track's bytes off its own file handle, so automix can separate a next-up local
    // song whose head has no prefetch URL and never enters the online media cache. Resolved here
    // because App owns the local library; the real LocalSong (with its handle) is looked up by id.
    const getLocalStemBytes = useCallback(async (song: SongResult): Promise<ArrayBuffer | null> => {
        if (!isLocalPlaybackSong(song)) return null;
        const local = localSongs.find(candidate => candidate.id === song.localRef.songId);
        return getLocalSongArrayBuffer((local ?? song) as unknown as LocalSong);
    }, [localSongs]);
    // The same reader for every analyser (analysis/trackAudio.ts): 智能动感模式 and automix's
    // profile read a local track that has no URL in hand through it too.
    useEffect(() => {
        registerLocalTrackFileReader(getLocalStemBytes);
        return () => registerLocalTrackFileReader(null);
    }, [getLocalStemBytes]);

    const automix = useAutomixDecks({
        audioRef,
        audioContextRef,
        currentSongKeyRef: currentSongRef,
        coverUrl,
        loopMode: effectiveLoopMode,
        isEnabled: automixEnabled && !isNowPlayingStageActive,
        transition: transitionSettings,
        onAdvanceTrack: () => {
            // Same advance the end of a track would trigger, only early enough for the outgoing
            // deck to still be sounding when the next one starts. `fromSong` because this IS the
            // advance: it steps from the track the app is on, never from the held picture, and
            // saying so keeps it independent of whether React has committed the hold yet.
            void handleNextTrack({
                allowStopOnMissing: true,
                shouldNavigateToPlayer: false,
                fromSong: currentSong ?? undefined,
                isAutomixAdvance: true,
            });
        },
        onDeckPlayedOut: (song, src) => cachePlayedOutRef.current(song, src),
        getLocalStemBytes,
    });

    automixRef.current = automix;

    /**
     * The now-playing picture, which lags the app's own idea of what is playing.
     *
     * A transition advances the queue at its START, because that advance is what loads and plays
     * the next track. So from that moment `currentSong`, the lyrics, the cover and the progress
     * bar all describe the track that is arriving - seconds before anybody hears it arrive, which
     * is the listener still hearing one song and reading another one's title.
     *
     * Everything here is presentation and nothing here touches the audio path. That is deliberate:
     * the obvious fix is to defer the advance itself, and it does not work, because for anything
     * already in the media cache `playSong` mints a fresh blob URL - `warmSrc` is null for those
     * tracks and the advance is the only thing that ever gives the incoming deck a source. What is
     * safe to hold back is the picture.
     */
    // Derived in usePlaybackStore now, so that any consumer can read the display layer without
    // being handed it. The ternaries (rather than `??`) live there for the same reason they lived
    // here: null is a real value for lyrics, cover and duration.
    const displaySong = usePlaybackStore(selectDisplaySong);
    const displayCoverUrl = usePlaybackStore(selectDisplayCoverUrl);
    const displayDuration = usePlaybackStore(selectDisplayDuration);
    /** While true the progress bar is driven by the deck that is finishing, not the active one. */
    const isShowingTail = usePlaybackStore(selectIsShowingTail);
    /**
     * The transport the picture belongs to, which is not idle just because the next track is.
     *
     * `playSong` resets the state to IDLE for the track it is loading, and that is correct for the
     * track it is loading - but the advance happens at the START of a blend, so nothing puts it
     * back until the incoming deck actually starts making sound. Measured at about a second, and
     * the outgoing deck is sounding for all of it: "idle" there describes nothing anybody can hear.
     *
     * IDLE only. PAUSED during a blend is a listener pressing pause and has to be shown.
     */
    const displayPlayerState = usePlaybackStore(selectDisplayPlayerState);
    // The bar is driven by the tail deck for the length of a blend, so at BOTH edges of the hold
    // it briefly reads one track's position against the other's length. One write at each edge
    // rather than waiting up to a quarter second for the next timeupdate to correct it.
    //
    // Entering used to be missing, and that edge is the one anybody sees: `playSong` zeroes the
    // clock for the arriving track from the same block that starts the hold, so the bar dropped to
    // the beginning and stayed there until the OUTGOING deck's next timeupdate put it back - a song
    // change that visibly happened and then visibly un-happened, while the title never moved.
    const getDisplayElement = automix.getDisplayElement;
    useEffect(() => {
        const element = isShowingTail ? getDisplayElement() : audioRef.current;
        if (element) currentTime.set(element.currentTime);
    }, [audioRef, currentTime, getDisplayElement, isShowingTail]);

    // Restores the displayed song's offset and resets its read-head, unless a blend handed it over.
    const incomingLyricTimelineOffsetMs = useLyricReadHead(globalLyricTimelineOffsetMs);

    /**
     * The now playing card is allowed on screen right now.
     *
     * One definition for two readers - the overlay model, which mounts the card, and the track-end
     * countdown below, which is only worth running while something can show its result. The lyrics
     * player and Lattice pages always allow it; the home page is opt-in, and that opt-in is the
     * whole rule: how the app arrived at the home page does not enter into it, so a cold start that
     * lands there and a walk back from another page behave the same.
     */
    const activeLibrarySuiteId = useActiveLibrarySuiteId();
    const stageTrackPillOnScreen = shouldShowNowPlayingToast({
        mode: stageTrackPillMode,
        view: currentView,
        showOnHome: stageTrackPillOnHome,
        // bravais 的墙与 Lattice 同类：卡片在墙上常在，不看「在首页显示」（2026-10-10）。
        homeIsWall: isWallLibrarySuite(activeLibrarySuiteId),
    });

    /**
     * Open the right-hand panel on its song card - what clicking the now playing card does once you
     * are already on the lyrics page. Same two calls the command palette's "Panel: cover" makes, so
     * the card and the command land in the same place.
     */
    const openSongCardPanel = useCallback(() => {
        setPanelTab('cover');
        setIsPanelOpen(true);
    }, []);

    /**
     * The queue track a plain track-end would advance to, or null when nothing resolvable.
     * Mirrors handleNextTrack's index rules so the preview is always the track that will actually play.
     */
    const nextUpTrack = useMemo(() => resolveNextUpTrack({
        playQueue,
        song: currentSong,
        loopMode: effectiveLoopMode,
        isFmMode,
        isStageActive: isNowPlayingStageActive,
        fallbackToQueueHead: true,
    }), [playQueue, currentSong, effectiveLoopMode, isFmMode, isNowPlayingStageActive]);

    /**
     * The track a running blend is bringing in: the queue successor of the DISPLAYED song.
     * The displayed picture is frozen on the outgoing track for the whole blend, while currentSong
     * advances asynchronously at the arm — reading the successor of the displayed song is correct
     * from the first frame and stays correct until settle. No queue-head fallback here: mid-blend a
     * song missing from the queue means the queue moved under the blend, and guessing would announce
     * a track that is not arriving.
     */
    const blendNextUpTrack = useMemo(() => (isShowingTail ? resolveNextUpTrack({
        playQueue,
        song: displaySong,
        loopMode: effectiveLoopMode,
        isFmMode,
        isStageActive: isNowPlayingStageActive,
    }) : null), [isShowingTail, displaySong, playQueue, effectiveLoopMode, isFmMode, isNowPlayingStageActive]);

    /** True while the card previews the next track (plain track-end countdown, not the blend). */
    const [countdownActive, setCountdownActive] = useState(false);
    useMotionValueEvent(currentTime, 'change', (time) => {
        const shouldPreview = stageTrackPillOnScreen
            && nextUpTrack !== null
            && Number.isFinite(displayDuration)
            && displayDuration > 0
            && displayDuration - time > 0
            && displayDuration - time <= NEXT_UP_LEAD_SEC;
        setCountdownActive(prev => (prev === shouldPreview ? prev : shouldPreview));
    });

    /**
     * The track the card shows while announcing a switch.
     * During a blend the arriving track comes from the queue successor of the displayed
     * (outgoing) song — never from currentSong, which lags the arm by a few async frames and
     * briefly made the card announce the OUTGOING song as "next".
     */
    const stageNextUpTrack = isShowingTail ? blendNextUpTrack : nextUpTrack;
    const stageNextUp = useMemo(() => {
        if (stageTrackPillMode === 'never' || !stageNextUpTrack) return null;
        return {
            title: stageNextUpTrack.name || '',
            artist: getSongArtistLabel(stageNextUpTrack) || null,
            // Same sanitising every other cover in the app goes through (see createCoverUrlResolver):
            // upgrades the http: covers netease/kugou still hand out - blocked as mixed content in the
            // packaged window - and keeps only the first of a comma-joined multi-value.
            coverUrl: toSafeRemoteUrl(getSongCoverUrl(stageNextUpTrack)) ?? null,
        };
    }, [stageTrackPillMode, stageNextUpTrack]);
    const stageIsNextUp = stageNextUp !== null && (isShowingTail || countdownActive);


    // The duration normally arrives on `loadedmetadata`, which fires when an element is given a
    // source. A warmed deck breaks that: it is handed the next track seconds early, fires the event
    // while it is still idle - where every handler here ignores it - and then never fires again,
    // because the whole point of warming is that its src string does not change when it takes over.
    // Meanwhile playSong has reset the duration to 0 for the new track.
    //
    // So a source the element already knows about needs reading directly. Keyed on `audioSrc`
    // rather than on the deck role, because the role swaps a moment BEFORE playSong zeroes the
    // duration and reading first would simply be overwritten.
    //
    // Left at zero this is not only a wrong progress bar: checkTransitionPoint needs a duration to
    // schedule against, so the track after a blend would get no transition at all.
    useEffect(() => {
        const element = audioRef.current;
        // currentSrc, not the src attribute: it only names a resource the element has actually
        // selected, so a deck one tick into loading something new cannot answer with the old
        // track's duration.
        if (!audioSrc || element?.currentSrc !== audioSrc) return;
        if (Number.isFinite(element.duration) && element.duration > 0) {
            setDuration(element.duration);
        }
    }, [audioSrc, audioRef, setDuration]);

    const { setupAudioAnalyzer, cacheSongAssets, cacheSongAssetsFor, adoptActiveDeckSource } = usePlaybackAudioBridge({
        audioRef,
        localSongs,
        isLyricsLoading,
        shouldAutoPlayRef: shouldAutoPlay,
        audioContextRef,
        analyserRef,
        gainNodeRef,
        connectDecks: automix.connectDecks,
        getActiveChain: automix.getActiveChain,
        suppressAutoplayRef: automix.suppressAutoplayRef,
        isAutoplayHeld: automix.autoplayHeld,
        syncOutputGain,
        getTargetPlaybackVolume,
        getCoverUrl,
    });

    const handleTranscodeFallback = useTranscodeFallback({
        audioSrc,
        localSongs,
        currentTime,
        pendingResumeTimeRef,
        shouldAutoPlayRef: shouldAutoPlay,
        getRecoveryTarget: automix.getRecoveryTarget,
        replaceRecoverySource: automix.replaceRecoverySource,
        clearFailedWarmSource: automix.clearFailedWarmSource,
        abortTransition: automix.abortTransition,
        handleTailEnded: automix.handleTailEnded,
        skipAfterPlaybackFailure,
    });

    // Now the writer exists, point the automix settle path at it. A track that blends out never fires
    // `ended`, so this is the only place its assets get cached; the cover is derived from the exit
    // song's own metadata inside `cacheSongAssetsFor` rather than from the now-arriving track's view.
    cachePlayedOutRef.current = (song, src) => { void cacheSongAssetsFor(song, src); };

    /**
     * The two controls that mean something different while a blend is in flight, held as refs.
     *
     * Both are implemented far below, once automix and playSong exist, and both are needed above
     * that point - the transport controller here, the remote bridge a little further down. A ref
     * plus a stable wrapper is what lets those be wired now and written later without either one
     * re-subscribing every render.
     */
    const seekDuringTransitionRef = useRef<(time: number) => boolean>(() => false);
    const pauseDuringTransitionRef = useRef<() => boolean>(() => false);
    /** Shared by every entry point that can seek while a blend is in flight. */
    const seekDuringTransition = useCallback((time: number) => seekDuringTransitionRef.current(time), []);
    const handlePauseDuringTransition = useCallback(() => pauseDuringTransitionRef.current(), []);

    const { resumePlayback, pausePlayback } = usePlaybackTransportController({
        stageActiveEntryKind,
        isNowPlayingStageActive,
        audioRef,
        audioContextRef,
        stageLyricsClockRef,
        setupAudioAnalyzer,
        syncOutputGain,
        getTargetPlaybackVolume,
        shouldRefreshCurrentOnlineAudioSource,
        recoverOnlinePlaybackSource,
        getSyntheticStageLyricsTime,
        syncStageLyricsClock,
        pauseDuringTransition: handlePauseDuringTransition,
        isTransitionAudible: automix.isTransitionAudible,
    });
    useNavidromeScrobbleReporter({
        audioRef,
        currentSong,
        activeDeck: automix.activeDeck,
    });
    usePlaybackReporter({
        audioRef,
        currentSong,
        activeDeck: automix.activeDeck,
    });
    useRecentPlaysRecorder({
        audioRef,
        currentSong,
        activeDeck: automix.activeDeck,
    });

    const {
        mediaSessionPlayRef,
        mediaSessionPauseRef,
        mediaSessionPrevRef,
        mediaSessionNextRef,
        taskbarHasTrackRef,
        taskbarPlayerStateRef,
    } = useTransportCommandRefs({ resumePlayback, pausePlayback, handlePrevTrack, handleNextTrack });


    useMediaSessionBridge({
        audioRef,
        // All three describe the DISPLAYED track, and that is the whole of the fix: the metadata,
        // the clock the position is read off, and the source the readiness guard compares against.
        // Pairing the displayed song with the ACTIVE deck put the outgoing track's title over the
        // incoming track's duration and progress for the length of every blend - the system panel
        // named one song and counted another. `audioSrc` moves with the element or the guard fails
        // for the whole blend and the panel stops updating instead.
        getDisplayAudioElement: automix.getDisplayElement,
        audioSrc: automix.tailSrc ?? audioSrc,
        currentSong: displaySong,
        cachedCoverUrl: displayCoverUrl ?? cachedCoverUrl,
        playerState: displayPlayerState,
        isNowPlayingStageActive,
        unknownArtistLabel: t('ui.unknownArtist'),
        mediaSessionPlayRef,
        mediaSessionPauseRef,
        mediaSessionPrevRef,
        mediaSessionNextRef,
        isNowPlayingControlDisabledRef,
    });

    const {
        exportState,
        handleExportCommand,
    } = useElectronVideoExportController({
        isElectronWindow,
        audioRef,
        navigateToPlayer,
        pausePlayback,
        resumePlayback,
    });

    const {
        publishStagePlayerPlaybackUpdate,
    } = useElectronPlaybackBridge({
        isElectronWindow,
        playerChromeVisibilityMode,
        onRemotePlayerChromeVisibilityModeCycle: cyclePlayerChromeVisibilityMode,
        onRemotePlayerChromeVisibilityModeSet: setPlayerChromeVisibilityModeTo,
        isStagePlayerSnapshotEnabled: stageStatus?.enabled === true,
        isNowPlayingControlDisabledRef,
        audioRef,
        // The deck the held picture belongs to. Its song, lyrics, cover, duration and transport are
        // read from the display selectors inside the bridge; this is the element that goes with them.
        getDisplayAudioElement: automix.getDisplayElement,
        effectiveLoopMode,
        isNowPlayingStageActive,
        mediaSessionPlayRef,
        mediaSessionPauseRef,
        mediaSessionPrevRef,
        mediaSessionNextRef,
        getSyntheticStageLyricsTime,
        syncStageLyricsClock,
        taskbarHasTrackRef,
        taskbarPlayerStateRef,
        exportState,
        lyricTimelineOffsetMs: effectiveLyricTimelineOffsetMs,
        onRemoteExportCommand: handleExportCommand,
        onExternalPlayRequest: handleStageExternalPlayRequest,
        onRemoteCycleLoopMode: handleToggleLoopMode,
        onRemoteTransitionSeek: seekDuringTransition,
        publishTrackTransition: automixEnabled,
        isTrackTransitionAudible: automix.isTransitionAudible,
        // Keyed on the displayed track, so the like state matches the song the remote is showing
        // while a blend is held rather than the one arriving underneath it.
        isLiked: resolveSongLiked(displaySong, { isLocalSongLiked, starredNavidromeSongIds }),
        onLike: handleLike,
    });

    usePlaybackVisualizerBridge({
        audioRef,
        analyserRef,
        isTransitionAudible: automix.isTransitionAudible,
        // The loop below is what actually drives the progress bar and the lyric read-head, sixty
        // times a second off whichever deck it is pointed at. Both have to be the held picture's,
        // or the bar and the lyrics run on the incoming track under the outgoing one's title.
        getDisplayElement: automix.getDisplayElement,
        animationFrameRef,
        effectiveLoopMode,
        isNowPlayingStageActive,
        isPlayerCapStageActive,
        stageActiveEntryKind,
        stageLyricsSession,
        stageLyricsClockRef,
        getSyntheticStageLyricsTime,
        syncStageLyricsClock,
        getNowPlayingDisplayTime,
        getPlayerCapDisplayTime,
        syncNowPlayingClock,
        lyricTimelineOffsetMs: effectiveLyricTimelineOffsetMs,
        incomingLyricTimelineOffsetMs,
    });

    const {
        togglePlay,
        toggleLoop,
        handleChangeReplayGainMode,
        handleContainerClick,
        handleFmTrash,
    } = usePlaybackInteractionBridge({
        stageActiveEntryKind,
        isNowPlayingStageActive,
        audioRef,
        // Play-vs-pause cannot be decided off the active deck mid-blend: that is the arriving track,
        // and it is silent for the whole lead.
        isTransitionAudible: automix.isTransitionAudible,
        // The arrow keys check for a blend first, the way the bar and the remote do, rather than
        // writing to the active deck - which mid-blend is not the deck the listener is watching.
        seekDuringTransition,
        stageLyricsClockRef,
        cyclePlayerChromeVisibilityMode,
        handleNextTrack,
        handlePrevTrack,
        navigateBackFromPlayer,
        pausePlayback,
        resumePlayback,
        syncStageLyricsClock,
    });

    const { personalFmSelection, personalFmSelectionLabel, isPersonalFmModeSupported, setPersonalFmSelection } = usePersonalFmModeController({
        isFmMode,
        currentSong,
        playSong,
        t: (key: string, fallback?: string) => t(key, fallback ?? ''),
    });

    // Wallpaper mode removes normal window semantics (no minimize/maximize/close, no dragging, and
    // click-through is managed by the main process), so the whole custom titlebar strip stays off.
    const usesCustomWindowChrome = isElectronWindow && !wallpaperMode;
    const isPlayerPageTransparent = transparentPlayerBackground || enablePlayerPageNativeBlur;
    const shouldUseTransparentAppBackground = isPlayerPageTransparent;
    const appStyle = useMemo(() => buildAppStyle({
        bgMode,
        isDaylight,
        theme,
        daylightTheme: DAYLIGHT_THEME,
        defaultTheme: DEFAULT_THEME,
        transparentBackground: shouldUseTransparentAppBackground,
    }), [bgMode, isDaylight, shouldUseTransparentAppBackground, theme]);
    const { visualizerTheme, visualizerSubtitleTheme, visualizerGeometrySeed } = useMemo(() => buildVisualizerTheme({
        appStyle,
        theme,
        lyricsFontStyle,
        lyricsFontWeight,
        lyricsCustomFontFamily,
        lyricsFontFallbackFamilies,
        subtitleFontInheritsLyrics,
        subtitleFontStyle,
        subtitleFontWeight,
        subtitleFontFamily,
        subtitleFontFallbackFamilies,
        // The displayed song, not the playing one. This id is the visualizer's geometry seed, and a
        // visualizer with no "song changed" event of its own infers one from the seed changing - the
        // diorama flies its camera to a whole new corridor on it. Fed the live id, that flight starts
        // the moment a blend arms, builds the new scene out of the lyrics still on screen, and lands
        // back on the same song: a full song-change animation that changes nothing, followed by the
        // real one when the hold releases.
        currentSongId: displaySong?.id,
        visualizerMode,
    }), [
        appStyle,
        displaySong?.id,
        lyricsCustomFontFamily,
        lyricsFontFallbackFamilies,
        lyricsFontStyle,
        lyricsFontWeight,
        subtitleFontFallbackFamilies,
        subtitleFontFamily,
        subtitleFontInheritsLyrics,
        subtitleFontStyle,
        subtitleFontWeight,
        theme,
        visualizerMode,
    ]);
    const isNowPlayingControlDisabled = isNowPlayingStageActive;

    // ---- 播放页双击手势 ----
    // 左区上一首、中区播放/暂停、右区下一首。区域比例与判定边界全部收在
    // components/app/playback/doubleTapGesture.ts 的常量里（左右各 30%、中间 40%，
    // 交界点归中区），这里只负责把动作和落点反馈接上。
    const [doubleTapCue, setDoubleTapCue] = useState<PlayerDoubleTapCue | null>(null);
    const doubleTapCueIdRef = useRef(0);
    const doubleTapCueTimerRef = useRef<number | null>(null);
    // armed 那一帧要留久一点：长按成立后用户还在决定往哪滑，420ms 就撤掉会显得「闪一下没了」。
    const GESTURE_CUE_DURATION_MS = { zone: 420, armed: 1200, slide: 420 } as const;
    const showGestureCue = useCallback((
        kind: PlayerGestureCueKind,
        options: { zone?: DoubleTapZone; direction?: 'left' | 'right'; x: number; y: number },
    ) => {
        doubleTapCueIdRef.current += 1;
        setDoubleTapCue({
            id: doubleTapCueIdRef.current,
            kind,
            zone: options.zone,
            direction: options.direction,
            x: options.x,
            y: options.y,
            // 中区图标表达「即将变成什么」：正在播放时显示暂停图标，暂停时显示播放图标。
            //
            // 状态源分两层，物理信号优先：
            // 1. audioRef.current 的 paused / ended。这个 ref 只指向**当前在听的那个 deck**
            //    （usePlaybackRuntimeRefs 的注释写明了这一点），所以不存在「另一个 deck 正在
            //    预热导致误判」的问题 —— 上一版错在查了页面上两个 deck 的 DOM，
            //    预热那个 paused 是 false，于是暂停被读成播放。
            // 2. ref 拿不到（首帧、还没挂载）时退回 store 的 playerState，用 getState() 同步读，
            //    不读 hook 值：hook 值是上次渲染的快照，切换完的那一帧还是旧的。
            //
            // 语义是「即将变成什么」：双击会切换播放状态，所以此刻在播就画暂停图标。
            playing: (() => {
                const element = audioRef.current;
                if (element) return !element.paused && !element.ended;
                return usePlaybackStore.getState().playerState === PlayerState.PLAYING;
            })(),
        });
        if (doubleTapCueTimerRef.current !== null) window.clearTimeout(doubleTapCueTimerRef.current);
        doubleTapCueTimerRef.current = window.setTimeout(() => {
            setDoubleTapCue(null);
            doubleTapCueTimerRef.current = null;
        }, GESTURE_CUE_DURATION_MS[kind]);
    }, []);
    const showDoubleTapCue = useCallback((zone: DoubleTapZone, clientX: number, clientY: number) => {
        showGestureCue('zone', { zone, x: clientX, y: clientY });
    }, [showGestureCue]);
    useEffect(() => () => {
        if (doubleTapCueTimerRef.current !== null) window.clearTimeout(doubleTapCueTimerRef.current);
    }, []);

    // ---- 播放中保持屏幕常亮 ----
    // 开关决定要不要、播放状态决定何时要、visibilitychange 负责「退到后台就交还系统、
    // 回到前台再要回来」。两条通道的选择在 services/screenWakeLock.ts 里：
    // 原生壳用窗口标志（老 WebView 没有 navigator.wakeLock，只有这条路真的有效），
    // 浏览器用 Screen Wake Lock。
    const keepScreenOnWhilePlaying = usePlayerChromeSettingsStore(state => state.keepScreenOnWhilePlaying);
    useEffect(() => {
        const wantOn = () => keepScreenOnWhilePlaying
            && usePlaybackStore.getState().playerState === PlayerState.PLAYING;
        const sync = () => {
            void applyScreenWakeLock(wantOn());
        };
        const onVisibilityChange = () => {
            void resyncScreenWakeLock(wantOn());
        };

        sync();
        document.addEventListener('visibilitychange', onVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            void applyScreenWakeLock(false);
        };
    }, [keepScreenOnWhilePlaying, displayPlayerState]);

    // ---- 系统栏：按设置显示/隐藏状态栏与导航栏（原生插件，浏览器里是空操作）----
    const showSystemBars = usePlayerChromeSettingsStore(state => state.showSystemBars);
    useEffect(() => {
        void applySystemBarsVisibility(showSystemBars);
    }, [showSystemBars]);


    // ---- 在线更新：启动后延迟几秒检查一次，有新版本就弹窗 ----
    // 延迟是为了不和首屏动画、封面加载抢网络；检查本身很轻（一个 releases/latest 请求）。
    const availableUpdate = useAppUpdateStore(state => state.availableUpdate);
    const checkAppUpdate = useAppUpdateStore(state => state.checkNow);
    const skipUpdateVersion = useAppUpdateStore(state => state.handleSkipUpdateVersion);
    const dismissUpdate = useAppUpdateStore(state => state.dismissUpdate);
    useEffect(() => {
        const timer = window.setTimeout(() => {
            void checkAppUpdate(false);
        }, 4000);
        return () => window.clearTimeout(timer);
    }, [checkAppUpdate]);
    // 与其它传输入口用同一道闸门：Now Playing 舞台接管播放时不响应，避免和舞台自己的控制打架。
    // 另外只在播放页生效：这个视觉层在首页也当作背景渲染，不限制的话首页双击会误切歌。
    const doubleTapHandlers = usePlayerDoubleTapGesture({
        enabled: enablePlayerDoubleTapGesture && currentView === 'player',
        onPrev: () => {
            if (isNowPlayingControlDisabled) return;
            void handlePrevTrack();
        },
        onNext: () => {
            if (isNowPlayingControlDisabled) return;
            void handleNextTrack();
        },
        onToggle: () => {
            if (isNowPlayingControlDisabled) return;
            togglePlay();
        },
        onFeedback: showDoubleTapCue,
    });

    // ---- 播放页长按手势：长按后在落点浮现一个可滑的按钮，向左滑打开命令面板，向右滑打开播放列表 ----
    // 长按本身不再打开任何东西（fix10 改的）：只负责把那个按钮亮出来，动作全靠滑动完成，
    // 这样「长按了然后滑」是一条完整的手势，不会出现长按就弹面板、想滑却已经开了东西的情况。
    const [longPressHandle, setLongPressHandle] = useState<{ x: number; y: number } | null>(null);
    // 滑轨的跟手位移走 MotionValue：pointermove 每帧都来，用 setState 会整层重渲染
    const longPressSlideX = useMotionValue(0);
    const openQueueAt = useCallback((clientX: number, clientY: number) => {
        // 先记锚点再打开：面板按这个坐标展开，关掉时由 setIsPanelOpen 统一清掉。
        setPlayerPanelAnchor({ x: clientX, y: clientY });
        setPanelTab('queue');
        setIsPanelOpen(true);
    }, []);
    // 兜底：窗口失焦、页面切到后台时，pointer 事件可能整个丢失，滑轨会留在屏幕上
    useEffect(() => {
        if (!longPressHandle) return;
        const clear = () => setLongPressHandle(null);
        window.addEventListener('blur', clear);
        document.addEventListener('visibilitychange', clear);
        return () => {
            window.removeEventListener('blur', clear);
            document.removeEventListener('visibilitychange', clear);
        };
    }, [longPressHandle]);

    const longPressHandlers = usePlayerLongPressGesture({
        enabled: enablePlayerLongPressQueue && currentView === 'player',
        onArmed: (clientX, clientY) => {
            if (isNowPlayingControlDisabled) return;
            longPressSlideX.set(0);
            setLongPressHandle({ x: clientX, y: clientY });
        },
        onSlideProgress: (deltaX) => {
            longPressSlideX.set(deltaX);
        },
        onSlideLeft: () => {
            if (isNowPlayingControlDisabled) return;
            longPressSlideX.set(0);
            setLongPressHandle(null);
            commandPalette.open();
        },
        onSlideRight: (clientX, clientY) => {
            if (isNowPlayingControlDisabled) return;
            longPressSlideX.set(0);
            setLongPressHandle(null);
            openQueueAt(clientX, clientY);
        },
        onCancel: () => {
            // 一次都没滑成：收起滑轨，什么都不做
            longPressSlideX.set(0);
            setLongPressHandle(null);
        },
    });
    // 滑动手势的落点反馈：方向图标跟着手势走，让用户看到「这一滑认成了什么」。
    // 先把原引用取出来再覆盖：直接在覆盖后的函数里调自己会调到可选链上、类型也过不去。
    const slideLeft = longPressHandlers.onSlideLeft;
    const slideRight = longPressHandlers.onSlideRight;
    const longPressCueHandlers = {
        ...longPressHandlers,
        onSlideLeft: (clientX: number, clientY: number) => {
            slideLeft?.(clientX, clientY);
            showGestureCue('slide', { direction: 'left', x: clientX, y: clientY });
        },
        onSlideRight: (clientX: number, clientY: number) => {
            slideRight?.(clientX, clientY);
            showGestureCue('slide', { direction: 'right', x: clientX, y: clientY });
        },
    };

    // 两套手势共用同一个 surface，同名的处理器会互相覆盖，所以在这里合并成一套。
    // onClickCapture 两个都调：各自内部只吞自己那一次 click，另一个的开关没置位就直接放过。
    const playerSurfaceHandlers = {
        onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
            doubleTapHandlers.onPointerDown(event);
            longPressCueHandlers.onPointerDown(event);
        },
        onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
            longPressCueHandlers.onPointerMove(event);
        },
        onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => {
            doubleTapHandlers.onPointerUp(event);
            longPressCueHandlers.onPointerUp(event);
        },
        onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => {
            doubleTapHandlers.onPointerCancel(event);
            longPressCueHandlers.onPointerCancel(event);
        },
        onClickCapture: (event: React.MouseEvent<HTMLDivElement>) => {
            doubleTapHandlers.onClickCapture(event);
            longPressHandlers.onClickCapture(event);
        },
    };

    useElectronWindowChrome();
    const {
        isPlayerView,
        shouldPauseVisualizerBackground,
        shouldHidePlayerProgressBar,
        shouldHidePlayerTranslationSubtitle,
        shouldHidePlayerRightPanelButton,
        canToggleCurrentPlayback,
    } = useMemo(() => buildPlayerViewFlags({
        currentView,
        disableHomeDynamicBackground,
        hidePlayerProgressBar,
        hidePlayerTranslationSubtitle,
        hidePlayerRightPanelButton,
        isNowPlayingControlDisabled,
        activePlaybackContext,
        stageActiveEntryKind,
        audioSrc,
        duration,
    }), [
        activePlaybackContext,
        audioSrc,
        currentView,
        disableHomeDynamicBackground,
        duration,
        hidePlayerProgressBar,
        hidePlayerRightPanelButton,
        hidePlayerTranslationSubtitle,
        isNowPlayingControlDisabled,
        stageActiveEntryKind,
    ]);
    // 播放页空闲时连指针一起隐藏。复用控制栏的自动隐藏时钟（3 秒无鼠标移动），不新开计时器：
    // 只有「自动隐藏」模式下才成立，`always-hidden` 是常驻隐藏、没有唤回时机，不参与。
    // 点击穿透（桌面宠物）也排除：那种状态下控制栏被钉成隐藏、鼠标移动不再唤回，跟着它走会把
    // 指针永久藏掉；而真正穿透时画的是下层窗口的指针，隐藏本来也没有收益。
    const shouldHidePlayerCursor = isPlayerView
        && autoHideCursorWithPlayerChrome
        && playerChromeVisibilityMode === 'auto-hide'
        && !isMainWindowClickThroughEnabled
        && isPlayerChromeHidden;
    // 独立隐藏指针：空闲一段就自己藏起来，控制栏保持显示。与控制栏的自动隐藏互不依赖，谁满足谁藏。
    const idleCursorHidden = useIdleCursorHide(isPlayerView && hideCursorWhenIdle && !isMainWindowClickThroughEnabled);
    const isSettingsModalOpen = settingsModalState.isOpen;
    const {
        obsBrowserSourceStatus,
        isObsBrowserSourceRendering,
        refreshObsBrowserSourceStatus,
    } = useObsBrowserSourcePublisher({
        isElectronWindow,
        stageSource,
        coverUrl,
        offsetMs: effectiveLyricTimelineOffsetMs,
        theme: visualizerTheme,
        subtitleTheme: visualizerSubtitleTheme,
        hideTranslationSubtitle: shouldHidePlayerTranslationSubtitle,
        seed: visualizerGeometrySeed,
    });
    const {
        lyricApiStatus,
        setLyricApiEnabled,
    } = useLyricApiPublisher({
        isElectronWindow,
        lyrics,
        offset: effectiveLyricTimelineOffsetMs,
    });
    const canGenerateAITheme = Boolean((lyrics?.lines.length ?? 0) > 0 || currentSong?.isPureMusic);
    const generateCurrentSongTheme = useCallback(() => {
        void generateAITheme(lyrics, currentSong);
    }, [currentSong, generateAITheme, lyrics]);
    const toggleDaylightMode = useCallback(() => {
        handleToggleDaylight(!isDaylight);
    }, [handleToggleDaylight, isDaylight]);
    const currentSearchSourceTabInPalette = useMemo(() => resolveCommandPaletteSearchSource(
        currentSong,
        searchSourceTab,
        activeProviderId,
    ), [activeProviderId, currentSong, searchSourceTab]);
    const toggleBrowserFullscreen = useCallback(async () => {
        if (typeof window !== 'undefined' && window.electron?.toggleFullscreenWindow) {
            return window.electron.toggleFullscreenWindow();
        }

        if (typeof document === 'undefined') {
            return false;
        }

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen();
                return true;
            }

            await document.documentElement.requestFullscreen();
            return true;
        } catch (error) {
            console.warn('[CommandPalette] Failed to toggle browser fullscreen:', error);
            return false;
        }
    }, []);
    const toggleRemoteControlWindow = useCallback(async () => {
        if (!window.electron?.toggleRemoteControl) {
            return false;
        }

        return window.electron.toggleRemoteControl();
    }, []);
    const toggleMainWindowAlwaysOnTop = useCallback(async () => {
        if (!window.electron?.getMainWindowAlwaysOnTop || !window.electron?.setMainWindowAlwaysOnTop) {
            return false;
        }

        const enabled = await window.electron.getMainWindowAlwaysOnTop();
        await window.electron.setMainWindowAlwaysOnTop(!enabled);
        return true;
    }, []);
    const handleSleepTimerExpireFallback = useCallback(() => {
        pausePlayback();
        setStatusMsg({ type: 'info', text: t('notifications.sleepTimerPlaybackPaused') });
    }, [pausePlayback, setStatusMsg, t]);
    /**
     * 定时器选了「播完整首歌」时的收尾：当前这首放完就停，不再往下一首走。
     * 返回 true 表示这一次的播放结束被定时器吃掉了。
     */
    const finishSleepTimerTrackHold = useCallback((): boolean => {
        const store = useSleepTimerStore.getState();
        if (!store.sleepTimerHoldsForTrackEnd) return false;
        store.handleSetSleepTimerHoldsForTrackEnd(false);
        handleSleepTimerExpireFallback();
        return true;
    }, [handleSleepTimerExpireFallback]);
    useSleepTimer({
        enabled: sleepTimerEnabled,
        hours: sleepTimerHours,
        minutes: sleepTimerMinutes,
        onExpireFallback: handleSleepTimerExpireFallback,
    });
    // Saving or clearing a segmentation has to re-lay the current song's lyrics, so it needs the
    // same preview-then-setLyrics pair the lyric filter saver uses. currentSongFullRef rather than
    // currentSong so the actions stay stable across renders.
    const lyricSegmentationActions = useMemo(() => createLyricSegmentationActions({
        getCurrentSong: () => currentSongFullRef.current,
        loadCurrentSongLyricPreview,
        setLyrics: setLyricsStable,
    }), [loadCurrentSongLyricPreview, setLyricsStable]);
    const commandPaletteContext = useCommandPaletteContext({

        currentSearchSourceTab: currentSearchSourceTabInPalette,
        localSongs,
        localLibraryCatalog,
        navigateToSearch,

        previewVolume: handlePreviewVolume,
        togglePlay,
        toggleLoop,
        next: handleNextTrack,
        prev: handlePrevTrack,
        playSong,
        shuffleQueue,
        clearQueue,
        applyQueueBatchOperation,
        removeQueueSong,
        moveQueueSongToNext,
        moveQueueSongToEnd,
        setReplayGainMode: handleChangeReplayGainMode,
        isPersonalFmModeSupported,
        setPersonalFmSelection,
        runAutoMatchBestLyric: handleAutoMatchBestLyricForCurrentSong,
        toggleCurrentSongPureMusicMark: handleToggleCurrentSongPureMusicMark,
        toggleSongLike: handleLike,
        isSongLiked: resolveSongLiked(displaySong, { isLocalSongLiked, starredNavidromeSongIds }),

        navigateToHome,
        navigateToPlayer,
        navigateToLattice,
        toggleBrowserFullscreen,
        toggleRemoteControlWindow,
        toggleMainWindowAlwaysOnTop,


        toggleTransparentBackground: () => { void toggleTransparentModeWithHandoff(!transparentPlayerBackground); },
        toggleDaylightMode,
        cycleLyricStaffPolicy: () => handleSaveLyricFilterPattern({
            pattern: lyricFilterPattern,
            filterEnabled: lyricFilterEnabled,
            staffPolicy: nextLyricStaffPolicy(lyricStaffPolicy),
            staffMinDwellSeconds: lyricStaffMinDwellSeconds,
            staffAbsorbMode: lyricStaffAbsorbMode,
            staffPattern: lyricStaffPattern,
        }),
        cycleLyricStaffAbsorbMode: () => handleSaveLyricFilterPattern({
            pattern: lyricFilterPattern,
            filterEnabled: lyricFilterEnabled,
            staffPolicy: lyricStaffPolicy,
            staffMinDwellSeconds: lyricStaffMinDwellSeconds,
            staffAbsorbMode: nextLyricStaffAbsorbMode(lyricStaffAbsorbMode),
            staffPattern: lyricStaffPattern,
        }),
        canGenerateAITheme,
        isGeneratingTheme,
        generateAITheme: generateCurrentSongTheme,
        themeGenerationSource,
        setThemeGenerationSource: handleThemeGenerationSourceChange,
        voiceInputPauseSupported: isElectronWindow && runsOnWindows(),
        canUseTransitionPerformance,
    }, lyricSegmentationActions);
    const commandPalette = useCommandPalette({
        isBlocked: isSettingsModalOpen
            || (currentView === 'home' && isSearchOpen)
            || isLyricMatchOpen
            || Boolean(pendingUnavailableReplacement),
        context: commandPaletteContext,
    });
    // ---- 系统返回键：按「离用户最近的一层」逐级关闭，都没开才考虑退出 ----
    //
    // 原生侧（MainActivity）在 API 33+ 用 OnBackInvokedDispatcher 注册回调 —— targetSdk 是 36，
    // 系统走预测式返回、**不再调用 onBackPressed**，上一版把逻辑写在 onBackPressed 里所以整条链路是死的。
    // 回调里 evaluateJavascript 同步执行 window.__foliaHandleBack()，返回 'handled'（已处理，
    // 别退桌面）或 'exit'（可以走）。
    //
    // 这里逐级调关闭函数而不是一律派发 Escape：工程里的浮层有的监听 Escape、有的不监听
    // （更新弹窗、退出确认框都不监听），只发 Escape 就会出现「按了返回没反应」。
    const confirmOnExit = usePlayerChromeSettingsStore(state => state.confirmOnExit);
    const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
    useEffect(() => {
        const handleBack = (): 'handled' | 'exit' => {
            // 1) 退出确认框自己开着：先关它，别再叠一个
            if (exitConfirmOpen) {
                setExitConfirmOpen(false);
                return 'handled';
            }
            // 2) 更新弹窗
            if (availableUpdate) {
                dismissUpdate();
                return 'handled';
            }
            // 3) 设置弹窗
            if (isSettingsModalOpen) {
                useSettingsModalStore.getState().closeSettings();
                return 'handled';
            }
            // 4) 命令面板
            if (commandPalette.isOpen) {
                commandPalette.close();
                return 'handled';
            }
            // 5) 播放列表 / 面板
            if (isPanelOpen) {
                setIsPanelOpen(false);
                return 'handled';
            }
            // 6) 其余自绘弹窗：派发 Escape 让它自己收
            if (document.querySelector('[aria-modal="true"]')) {
                const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
                window.dispatchEvent(event);
                document.dispatchEvent(event);
                return 'handled';
            }
            // 7) 播放页：按返回回主页，不退出应用
            //    用户明确要求「播放页和 bravais 墙按返回回到主页，不退到桌面」。
            //    放在弹窗之后：弹窗开着时先关弹窗，和系统返回键的通常语义一致。
            if (currentView === 'player') {
                navigateBackFromPlayer();
                return 'handled';
            }
            // 8) bravais 墙的非根层（集合页 / 表单 / 面板）：按返回退回上一层。
            //    墙没有把「返回」暴露成命令，缝里那颗 ‹ 是唯一的入口，所以这里直接触发它。
            //    程序触发 click 不受 visibility 影响，缝收起时同样有效。
            const seamBack = document.querySelector<HTMLButtonElement>('[data-bravais-seam-action="back"]');
            if (seamBack) {
                seamBack.click();
                return 'handled';
            }
            // 9) 什么都没开：按设置决定要不要问一句
            if (confirmOnExit) {
                setExitConfirmOpen(true);
                return 'handled';
            }
            return 'exit';
        };
        (window as unknown as { __foliaHandleBack?: () => 'handled' | 'exit' }).__foliaHandleBack = handleBack;
        return () => {
            delete (window as unknown as { __foliaHandleBack?: () => 'handled' | 'exit' }).__foliaHandleBack;
        };
    }, [availableUpdate, commandPalette, confirmOnExit, currentView, dismissUpdate, exitConfirmOpen, isPanelOpen, isSettingsModalOpen, navigateBackFromPlayer, setIsPanelOpen]);

    // The FM tab reuses the palette's picker instead of carrying its own copy of the mode list.
    // Read through a ref rather than depended on: openCommandById tracks the palette's isExecuting
    // flag, so depending on it would rebuild the player panel model on unrelated renders. The
    // picker only ever runs from a click, so the latest one is the right one.
    const openCommandByIdRef = useRef(commandPalette.openCommandById);
    openCommandByIdRef.current = commandPalette.openCommandById;
    const handleOpenFmModePicker = useMemo(() => (
        isPersonalFmModeSupported ? () => openCommandByIdRef.current(PERSONAL_FM_MODE_COMMAND_ID) : undefined
    ), [isPersonalFmModeSupported]);
    const nowPlayingDebugSnapshot = useMemo(() => (
        stageSource === 'now-playing'
            ? {
                connectionStatus: nowPlayingConnectionStatus,
                isActive: isNowPlayingStageActive,
                paused: nowPlayingPaused,
                progressMs: nowPlayingProgressMs,
                progressQuality: nowPlayingProgressQuality,
                trackTitle: nowPlayingTrack?.title ?? nowPlayingLyricPayload?.title ?? null,
                durationSec: (nowPlayingTrack?.durationMs ?? nowPlayingLyricPayload?.durationMs ?? 0) / 1000,
                ...nowPlayingDebugInfo,
            }
            : null
    ), [
        isNowPlayingStageActive,
        nowPlayingConnectionStatus,
        nowPlayingDebugInfo,
        nowPlayingLyricPayload?.durationMs,
        nowPlayingLyricPayload?.title,
        nowPlayingPaused,
        nowPlayingProgressMs,
        nowPlayingProgressQuality,
        nowPlayingTrack?.durationMs,
        nowPlayingTrack?.title,
        stageSource,
    ]);
    const activeDualTheme = useMemo(() => {
        if (bgMode === 'custom' && customTheme) {
            return customTheme;
        }
        if (bgMode === 'ai') {
            return aiTheme ?? FALLBACK_AI_DUAL_THEME;
        }
        return BASE_DUAL_THEME;
    }, [bgMode, customTheme, aiTheme]);

    // Built while the overlay is open even outside dev, because the packaged desktop build has no
    // console of its own and this overlay is the only way to read one. Still gated rather than
    // unconditional: nothing here is worth computing on every render of a session nobody is
    // debugging.
    const devDebugSnapshot = useMemo(() => (
        isDev || isDevDebugOverlayVisible
            ? buildDebugSnapshot({
                shortcutLabel: DEV_DEBUG_SHORTCUT_LABEL,
                currentSong,
                currentView,
                playerState,
                visualizerMode,
                lyrics: lyrics,
                currentLineIndex,
                currentTimeValue: currentTime.get(),
                audioSrc,
                coverUrl,
                nowPlayingDebug: nowPlayingDebugSnapshot,
                themeMode: bgMode,
                activeDualTheme,
            })
            : null
    ), [
        audioSrc,
        coverUrl,
        currentLineIndex,
        currentSong,
        currentTime,
        currentView,
        isDev,
        isDevDebugOverlayVisible,
        nowPlayingDebugSnapshot,
        playerState,
        lyrics,
        visualizerMode,
        bgMode,
        activeDualTheme,
    ]);
    const themeParkSeedTheme = useMemo(() => getThemeParkSeedTheme(), [getThemeParkSeedTheme]);
    useSongThemeAutoGeneration({
        enabled: songThemeAutoSwitchEnabled && songThemeAutoGenerateEnabled,
        isLyricsLoading,
        themeGenerationSource,
        generateAITheme,
    });
    // Loads the playing song's saved word segmentation into the store the lyric setter reads.
    useLyricWordSegmentation();
    // Loads icu-folia, the default word segmenter, once a word-based mode shows Chinese or Japanese.
    useIcuFoliaSegmentation(visualizerMode);
    /**
     * Cancels a blend back onto the track the listener is hearing, or null when there is none.
     *
     * Mid-blend the app runs two of everything: the song on screen is the one FINISHING - the
     * outgoing deck's - while `audioRef`, `currentSong` and the transport already name the track
     * arriving underneath it. So any control the listener presses about "this song" lands on a deck
     * that is not the one they mean, and the two reports this answers are the same mistake twice: a
     * drag moved the hidden deck and the bar snapped back, a pause stopped the hidden deck and the
     * blend ran on into the next song regardless.
     *
     * The track they mean is already loaded and sounding on its own deck, so nothing needs
     * reloading: cancel onto that deck (`cancelBlendKeepingTail`) and hand it back the whole frozen
     * picture. An older fix re-played the song from scratch, which ran the entire song-change path -
     * a fresh blob URL, lyrics refetched, the read-head reset - for a track that never left; the
     * visualizers read that as a song change and answered with a switch animation, and the reload
     * cost a visible hitch. `adoptActiveDeckSource` is what stops the audio bridge reloading the
     * deck out from under us. (Touching that deck at all depends on its blob URL still being live -
     * see `retireBlobUrl`, which is why the source outlives the advance now.)
     *
     * Returns the deck now carrying that track, for the caller to move or to stop. `resume` says
     * which way the transport is going afterwards, and it is the only difference between the two
     * callers.
     */
    const cancelBlendToDisplayedTrack = (resume: boolean): HTMLAudioElement | null => {
        if (!automix.isTransitionAudible()) return null;
        // The whole frozen picture, not just the song. A blend deliberately runs two sets of these:
        // the visible ones (this snapshot, the OUTGOING track) and the live state, which `playSong`
        // moved to the incoming track at the arm. Cancelling clears the snapshot, so every value in
        // it has to be handed back to the live state or the app keeps the incoming track's copy
        // under the outgoing track's name. `duration` is the one that breaks playback rather than
        // just looking wrong: the progress bar would rescale to the OTHER song's length, so the next
        // drag maps to a time past the real end of this one and the deck stops there - "I dragged
        // and it went silent". The old re-play fix got this back for free, because reloading the
        // song fired `onLoadedMetadata` again; keeping the deck means nothing refires it.
        const frozen = automix.transitionDisplay;
        const exitingSong = frozen?.song ?? currentSong;
        if (!exitingSong) return null;
        // The deck still playing the outgoing track - the one the frozen picture reads from.
        const tailElement = automix.getDisplayElement();
        if (!tailElement) return null;
        // The exact string that deck is rendering, so re-pointing `audioSrc` at it below changes no
        // src attribute and reloads nothing. Falls back to the element's own URL, then to `audioSrc`.
        const keepSrc = automix.tailSrc ?? tailElement.currentSrc ?? audioSrc;
        // Tell the bridge the active deck already holds this source, THEN cancel onto it: the cancel
        // repoints the audio ref at that deck, and the setAudioSrc below must not trigger a reload.
        if (keepSrc) adoptActiveDeckSource(keepSrc);
        const wasArmed = automix.cancelBlendKeepingTail();
        if (keepSrc) setAudioSrc(keepSrc);
        // Put the display and the queue pointer back on the outgoing song (both key off currentSong).
        showSong(exitingSong);
        if (resume) {
            // Force PLAYING: the advance dropped the transport to IDLE and only the incoming deck
            // starting would have cleared it - but that deck is the one being discarded.
            setPlayerState(PlayerState.PLAYING);
        } else if (wasArmed) {
            // Stopping, and the advance is already in flight: the incoming deck is loading with an
            // autoplay intent standing behind it, and cancelling cannot recall that. The intent now
            // points at the deck we just kept, so left alone the audio bridge presses play on the
            // very track this pause meant to stop. Same knob the ordinary mid-blend pause uses (the
            // playerState effect in useAutomixDecks), set here because by the time that effect runs
            // the session is already idle and it can no longer tell an armed blend was interrupted.
            automix.suppressAutoplayRef.current = true;
        }
        // The rest of the frozen picture - every field of it, which is the point: `TransitionDisplay`
        // is exactly the set of values a blend holds back, so handing all four to the live state is
        // what makes cancelling a no-op rather than a half-move. Without the length the deck reads
        // its own position against the other track's, which both mis-draws the bar and hands
        // `checkTransitionPoint` a wrong number to plan the NEXT blend from; the cover has to be put
        // back through `cachedCoverUrl` because the resolver prefers it over the song's own metadata.
        if (frozen) {
            setDuration(frozen.duration);
            setLyrics(frozen.lyrics);
            setCachedCoverUrl(frozen.coverUrl);
        }
        // The advance pointed this at the incoming track; playSong normally moves it, but this path
        // does not run playSong. Left stale, every callback gated on "is this still the current song"
        // (recovery, scrobble, the deck-playing handler) would answer for a track that isn't playing.
        // Put back, not started again: the outgoing song never stopped playing.
        askForSong(exitingSong, { putBack: true });
        // One line per cancel, because everything this path does is invisible by design - it is the
        // absence of a song change. Without it a report of "I pressed something and it went wrong"
        // has nothing in the log to sit next to, which is exactly how the wrong-duration bug above
        // stayed hidden.
        console.log(
            `[Automix] blend cancelled by a ${resume ? 'seek' : 'pause'} while ${wasArmed ? 'armed' : 'fading'},`
            + ` staying on "${exitingSong.name}" (${(frozen?.duration ?? 0).toFixed(1)}s long)`,
        );
        return tailElement;
    };
    /**
     * A seek that lands during an automix blend, or false when there is no blend to cancel.
     *
     * Held in a ref - declared up by the transport controller, and reused by the Electron bridge for
     * the remote's own seek - refreshed every render, so `seekMainAudio` itself can stay a stable
     * callback (it is threaded through the memoised overlay model) while this closure always sees
     * the live song, queue-mode and blend state.
     */
    seekDuringTransitionRef.current = (time: number) => {
        const tailElement = cancelBlendToDisplayedTrack(true);
        if (!tailElement) return false;
        const seekTarget = Math.max(0, time);
        tailElement.currentTime = seekTarget;
        currentTime.set(seekTarget);
        return true;
    };
    /**
     * A pause that lands during an automix blend, or false when there is no blend to cancel.
     *
     * Pressing pause is a statement about the track on screen, and mid-blend that track is on the
     * deck no control points at. Pausing the active deck instead stopped the ARRIVING track - silent
     * anyway for the whole lead - and left the outgoing one playing with its blend still scheduled,
     * so the listener pressed pause and then watched it hand over to the next song. Cancel onto the
     * track they meant and stop that deck; both end up silent, because the cancel's own settle
     * pauses the deck being discarded.
     *
     * Held in a ref for the same reason as the seek above: the transport controller that calls it is
     * wired far above the point where automix exists to write it.
     */
    pauseDuringTransitionRef.current = () => {
        const tailElement = cancelBlendToDisplayedTrack(false);
        if (!tailElement) return false;
        tailElement.pause();
        return true;
    };
    const seekMainAudio = useCallback((time: number) => {
        // A seek is a statement that playback should go on, same as it is on a paused track. If a
        // pause is still fading out, take it back (the audio never stopped) so the pending pause
        // cannot land after the seek.
        const resumedFromFade = playbackFade.cancelPendingPause();
        if (resumedFromFade) {
            setPlayerState(PlayerState.PLAYING);
        }
        if (seekDuringTransitionRef.current(time)) {
            return;
        }
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            if (audioRef.current.paused) {
                void audioRef.current.play();
                setPlayerState(PlayerState.PLAYING);
            }
            void publishStagePlayerPlaybackUpdate();
        }
    }, [publishStagePlayerPlaybackUpdate]);

    // Android 媒体通知按钮 / 蓝牙耳机键：把原生 mediaAction 派发到播放控制
    useNativeMediaActions({
        play: resumePlayback,
        pause: pausePlayback,
        toggle: () => togglePlay(),
        next: () => { void handleNextTrack(); },
        previous: () => { void handlePrevTrack(); },
        seek: (seconds: number) => { seekMainAudio(seconds); },
    });

    const handleMonetLyricLineSeek = useCallback((lyricTimeSec: number) => {
        if (isNowPlayingControlDisabled) {
            return;
        }

        const playbackTime = Math.max(0, lyricTimeSec + currentTime.get() - lyricCurrentTime.get());
        if (activePlaybackContext === 'stage' && stageActiveEntryKind === 'lyrics' && !audioSrc) {
            syncStageLyricsClock(playbackTime, duration, playerState, stageLyricsClockRef.current.startTimeSec);
            currentTime.set(playbackTime);
            if (playerState !== PlayerState.PLAYING) {
                setPlayerState(PlayerState.PLAYING);
            }
            void publishStagePlayerPlaybackUpdate();
        } else {
            seekMainAudio(playbackTime);
        }
    }, [
        activePlaybackContext,
        audioSrc,
        currentTime,
        duration,
        isNowPlayingControlDisabled,
        lyricCurrentTime,
        playerState,
        publishStagePlayerPlaybackUpdate,
        seekMainAudio,
        stageActiveEntryKind,
        stageLyricsClockRef,
        syncStageLyricsClock,
    ]);

    // Folium services (folium.playback / folium.ui) call through to these App handlers.
    useFoliumHostActions({
        play: resumePlayback,
        pause: pausePlayback,
        toggle: () => togglePlay(),
        seek: seekMainAudio,
        seekToLyricTime: handleMonetLyricLineSeek,
        next: () => { void handleNextTrack(); },
        previous: handlePrevTrack,
        playSong: (song) => playSong(song),
        playQueueSong: (song, queue, isFm) => playSong(song, queue, isFm),
        enqueue: addOnlineSongToQueue,
        navigateToPlayer,
        navigateToHome,
        shuffleQueue,
        toggleLike: handleLike,
        openVolume: () => commandPalette.invokeCommandById('playback-volume'),
        isLiked: commandPaletteContext.playback.isSongLiked,
        controlsDisabled: isNowPlayingControlDisabled,
        isLyricsLoading,
    });

    const visualizerRendererModel = useVisualizerRendererModel({
        theme: visualizerTheme,
        subtitleTheme: visualizerSubtitleTheme,
        seed: visualizerGeometrySeed,
        isObsBrowserSourceRendering,
        shouldPauseVisualizerBackground,
        hideTranslationSubtitle: shouldHidePlayerTranslationSubtitle,
        isPlayerPageTransparent,
        onLyricLineSeek: handleMonetLyricLineSeek,
        onBack: navigateBackFromPlayer,
    });

    const handlePlayerPanelAlbumSelect = useCallback(async (song: SongResult, album: Album) => {
        try {
            const ref = await resolveSongCatalogRef(song as UnifiedSong, 'album', album);
            if (ref) {
                navigateToCollection({
                    source: 'online',
                    providerId: ref.providerId,
                    id: ref.id,
                    type: 'album',
                    name: album.name || t('home.albums'),
                    coverUrl: album.coverUrl,
                }, 'player');
                return;
            }
        } catch (error) {
            console.warn('[CatalogNavigation] Failed to resolve player album:', error);
        }
        setStatusMsg({ type: 'error', text: t('search.catalogUnavailable') });
    }, [navigateToCollection, setStatusMsg, t]);

    const handlePlayerPanelArtistSelect = useCallback(async (song: SongResult, artist: Artist) => {
        try {
            const ref = await resolveSongCatalogRef(song as UnifiedSong, 'artist', artist);
            if (ref) {
                navigateToCollection({
                    source: 'online',
                    providerId: ref.providerId,
                    id: ref.id,
                    type: 'artist',
                    name: artist.name || t('navidrome.artists'),
                }, 'player');
                return;
            }
        } catch (error) {
            console.warn('[CatalogNavigation] Failed to resolve player artist:', error);
        }
        setStatusMsg({ type: 'error', text: t('search.catalogUnavailable') });
    }, [navigateToCollection, setStatusMsg, t]);

    // 两面墙（bravais 与 Lattice）右下角工具面板的宿主动作：命令面板的同一套命令与队列操作，host 身份稳定。
    const wallToolsHost = useAppWallToolsHost({
        invokeCommandById: commandPalette.invokeCommandById,
        canInvokeCommandById: commandPalette.canInvokeCommandById,
        isGeneratingTheme,
        previewVolume: handlePreviewVolume,
        navigateToPlayer,
        playQueue,
        playSong,
        moveQueueSongToNext,
        moveQueueSongToEnd,
        removeQueueSong,
        moveQueueSong,
        clearQueue,
        saveCurrentQueueAsLocalPlaylist,
    });
    const homeModel = useHomeModel({
        account: accountController,
        activeProvider,
        playSong,
        navigateToPlayer,
        navigateToLattice,
        togglePlayback: togglePlay,
        enterPlaybackView: navigateFromPlayerCapsule,
        refreshOnlineProviderPlaylists: refreshActiveProviderPlaylists,
        user,
        playlists,
        cloudPlaylist,
        focusedPlaylistIndex,
        setFocusedPlaylistIndex,
        navigateToSearch,
        localSongs,
        localLibraryCatalog,
        localPlaylists,
        onRefreshLocalSongs,
        onAddLocalSongToQueue: handleLocalQueueAdd,
        localMusicState,
        setLocalMusicState,
        onAddNavidromeSongsToQueue: addNavidromeSongsToQueue,
        navidromeFocusedAlbumIndex,
        setNavidromeFocusedAlbumIndex,
        stageSource,
        openStagePlayer,
        theme,
        playAll: playOnlineQueueFromStart,
        addAllToQueue: addOnlineSongsToQueue,
        addSongToQueue: addOnlineSongToQueue,
        onStatusMessage: setStatusMsg,
        onOpenCollection: openHomeCollection,
        onPushCollection: pushCollection,
        onPopCollectionTo: popCollectionTo,
        onBackCollection: backCollection,
    });
    const playerDisplayCatalogIndex = useMemo(() => buildLocalLibraryIndex(
        localLibraryCatalog.entities,
        localLibraryCatalog.assignments,
    ), [localLibraryCatalog.assignments, localLibraryCatalog.entities]);
    const playerDisplayCurrentSong = useMemo(() => (
        displaySong
            ? applyLocalLibraryEntityDisplay(displaySong, localLibraryCatalog, playerDisplayCatalogIndex)
            : null
    ), [displaySong, localLibraryCatalog, playerDisplayCatalogIndex]);
    const playerDisplayQueue = useMemo(() => (
        playQueue.map(song => applyLocalLibraryEntityDisplay(song, localLibraryCatalog, playerDisplayCatalogIndex))
    ), [localLibraryCatalog, playQueue, playerDisplayCatalogIndex]);
    // 搜索结果同样在展示时按当前目录重算：结果是提交那一刻的快照，导入后紧接着搜，实体目录可能还没加载完。
    const resolveSearchResultDisplay = useCallback((track: UnifiedSong) => (
        track.isLocal
            ? applyLocalLibraryEntityDisplay(track, localLibraryCatalog, playerDisplayCatalogIndex)
            : track
    ), [localLibraryCatalog, playerDisplayCatalogIndex]);
    const onlinePlaylists = useMemo(() => {
        return playerDisplayCurrentSong ? omni.getPlaylistsForSong(playerDisplayCurrentSong) : [];
    }, [onlineProviders, playerDisplayCurrentSong]);

    const playerPanelModel = usePlayerPanelModel({
        navigateToHome,
        navigateToLattice,
        handleDirectHomeFromPanel,
        currentSong: playerDisplayCurrentSong,
        handleAlbumSelect: handlePlayerPanelAlbumSelect,
        handleArtistSelect: handlePlayerPanelArtistSelect,
        effectiveLoopMode,
        toggleLoop,
        handleLike,
        generateAITheme: generateCurrentSongTheme,
        isGeneratingTheme,
        canGenerateAITheme,
        theme,
        setTheme,
        handleBgModeChange,
        hasCustomTheme,
        themeSourceModel,
        handleResetTheme,
        toggleTransparentModeWithHandoff,
        handleManualMatchOnline: openLyricMatch,
        handleUpdateLocalLyrics,
        handleChangeLyricsSource,
        handleImportOnlineLyrics,
        handleChangeOnlineLyricsSource,
        handleMatchOnlineLyrics: openLyricMatch,
        handleClearOnlineLyricsState,
        handleLyricTimelineOffsetChange,
        handleChangeReplayGainMode,
        fmModeLabel: personalFmSelectionLabel,
        handleOpenFmModePicker,
        handleFmTrash,
        handleNextTrack,
        handlePrevTrack,
        togglePlay,
        handlePreviewVolume,
        isNowPlayingControlDisabled,
        openCommandPalette: commandPalette.open,
        // 右侧按钮长按后向右滑：播放列表在按钮所在位置展开（和长按屏幕用的是同一条锚点链路）
        openQueueAt: (clientX: number, clientY: number) => {
            setPlayerPanelAnchor({ x: clientX, y: clientY });
            setPanelTab('queue');
            setIsPanelOpen(true);
        },
        isCommandPaletteOpen: commandPalette.isOpen,
        playQueue: playerDisplayQueue,
        playSong,
        queueScrollRef,
        shuffleQueue,
        removeQueueSong,
        moveQueueSongToEnd,
        moveQueueSongToNext,
        saveCurrentQueueAsLocalPlaylist,
        accountController,
        handleSyncData: handleActiveProviderSyncData,
        isSyncing: isProviderSyncing,
        handleToggleDaylight: toggleDaylightMode,
        // Derived inside the hook, but these are the sources only App.tsx holds.
        isLocalSongLiked,
        shouldHidePlayerRightPanelButton,
        localSongs,
        localLibraryCatalog,
        navigateToCollection,
    });
    const appOverlaysModel = useAppOverlaysModel({
        theme,
        closeSearchView,
        handleSearchOverlaySubmit,
        handleSearchLoadMore,
        handleSearchResultPlay,
        handleSearchResultAddToQueue,
        handleSearchResultArtistOpen,
        handleSearchResultAlbumOpen,
        resolveSearchResultDisplay,
        devDebugSnapshot,
        effectiveLoopMode,
        canToggleCurrentPlayback,
        isNowPlayingControlDisabled,
        stageActiveEntryKind,
        syncStageLyricsClock,
        stageLyricsClockRef,
        togglePlay,
        toggleLoop,
        navigateToPlayer,
        navigateFromPlayerCapsule,
        shouldHidePlayerProgressBar,
        onSeekMainAudio: seekMainAudio,
        onStagePlayerSeek: publishStagePlayerPlaybackUpdate,
        isNowPlayingStageActive,
        handlePrevTrack,
        handleNextTrack,
        shuffleQueue,
        handleLike,
        isDisplaySongLiked: commandPaletteContext.playback.isSongLiked,
        invokeCommandById: commandPalette.invokeCommandById,
        canInvokeCommandById: commandPalette.canInvokeCommandById,
        stageNextUp,
        stageIsNextUp,
        stageTrackPillOnScreen,
        openSongCardPanel,
    });
    const settingsDialog = useSettingsDialogModel({
        themeController,
        themeParkInitialTheme: themeParkSeedTheme,
        onToggleNavidrome: handleToggleNavidromeEnabled,
        loadLyricFilterPreview: loadCurrentSongLyricPreview,
        onSaveLyricFilterPattern: handleSaveLyricFilterPattern,
        stageStatus,
        stageSource,
        setStageStatus,
        leaveStagePlayback,
        clearStagePlaybackSession,
        clearPersistedStagePlaybackCache,
        loadStageSessionIntoPlayback,
        nowPlayingConnectionStatus,
        playerCapConnectionStatus,
        playerCapPlayers,
        obsBrowserSourceStatus,
        refreshObsBrowserSourceStatus,
        lyricApiStatus,
        setLyricApiEnabled,
        onAudioOutputDeviceChange: handleAudioOutputDeviceChange,
        onReplayGainModeChange: handleChangeReplayGainMode,
        onToggleTransparentPlayerBackground: toggleTransparentModeWithHandoff,
    });
    const appDialogsModel = useAppDialogsModel({
        isLyricMatchOpen,
        localSongs,
        closeLyricMatch,
        handleLyricMatchComplete,
        handleLyricMatchPureMusicMarkChanged,
        handleNaviLyricMatchComplete,
        handleOnlineLyricMatchComplete,
        pendingUnavailableReplacement,
        setPendingUnavailableReplacement,
        handleUnavailableReplacementConfirm,
        settingsDialog,
    });

    useEffect(() => {
        isNowPlayingControlDisabledRef.current = isNowPlayingControlDisabled;
    }, [isNowPlayingControlDisabled]);

    // Buffer progress debug helper reset. Keep commented out unless
    // buffered percent logging is explicitly needed during troubleshooting.
    // useEffect(() => {
    //     lastBufferedPercentLogRef.current = null;
    // }, [audioSrc]);

    // Optimize background layout cost: completely hide home surface when player is active.
    // Keep the mount state separate from opacity so transparent player mode never reveals Home during delayed unmount.
    // 翻牌交接（资料库墙 ↔ Lattice，设计稿 §7「进入队列」）：director 在视图切换的同一刻开会话，这里按会话决定首页层 /
    // Lattice 要不要留着、visualizer 要不要垫着。grid / TUI 没有会话，下面的一切照旧。
    useWallHandoffDirector();
    const wallHandoffSession = useWallHandoffStore(state => state.session);
    const wallHandoff = resolveWallHandoffPresentation(wallHandoffSession);
    // 首页墙能交接（bravais 的 stage 挂着）时空闲里先把 Lattice 的 chunk 取下来：第一次进 Lattice 也不用等它加载才开翻。
    const hasHomeWallPeer = useWallHandoffStore(state => state.homePeer !== null);
    useEffect(() => {
        if (!hasHomeWallPeer) return undefined;
        const timer = setTimeout(() => { void loadLattice(); }, 1500);
        return () => clearTimeout(timer);
    }, [hasHomeWallPeer]);
    const { shouldKeepHomeMounted, shouldShowHomeSurface, shouldRevealHomeSurface } = buildHomeSurfacePresentation({
        currentView,
        isSettingsModalOpen,
        isPanelOpen,
        keepsHomeForHandoff: wallHandoff.keepsHome,
    });
    // Home is taken down for the wall. A collection's page that was opened from the wall is left
    // with its cover flying back to the wall's tile (collectionOpenMorph): Home, which holds that
    // page and the flight's overlay, then stays under the wall until the flight is over: shown as
    // it was, for the wall fades in over it.
    const holdsHomeForFlight = useMorphKeepsHost(currentView === 'lattice');
    const isHomeSurfaceRevealed = shouldRevealHomeSurface || holdsHomeForFlight;
    useEffect(() => {
        if (shouldKeepHomeMounted || holdsHomeForFlight) {
            setIsHomeFullyHidden(false);
        } else {
            // Wait for the 300ms opacity transition to finish before applying display: none
            const timer = setTimeout(() => setIsHomeFullyHidden(true), 350);
            return () => clearTimeout(timer);
        }
    }, [shouldKeepHomeMounted, holdsHomeForFlight]);
    // 资料库 stage 完全遮挡播放页时（bravais 实色档，stage 自己报告）也卸载 visualizer：首页淡入结束后才卸载，
    // 首页一被面板盖住 / 离开就立即重挂；设置弹窗盖着时首页仍显示在遮罩下面，不重挂。App 只认报告，不认识 suite。
    const libraryOccludesPlayer = useLibraryPlayerOcclusionStore(selectLibraryOccludesPlayer);
    const hasLibraryOcclusionSettled = useLibraryOcclusionSettled(shouldRevealHomeSurface && libraryOccludesPlayer);
    const shouldMountVisualizer = shouldMountPlayerVisualizer({
        currentView,
        // Around a wall, the visualizer is taken down and put back by wallLayer.ts's rule.
        hasLatticeExited: visualizerAroundWall.isUp,
        shouldRevealHomeSurface,
        libraryOccludesPlayer,
        hasLibraryOcclusionSettled,
        handoffKeepsVisualizer: wallHandoff.keepsVisualizer,
    });
    // 首页墙透出来的 visualizer 加模糊（bravais「墙后的画面」，stage 报告；只在首页墙露着时）。
    const libraryBackdropBlur = useLibraryPlayerOcclusionStore(state => selectLibraryPlayerBackdrop(state).blur);
    const blursVisualizerBackdrop = resolveVisualizerBackdropBlur({ shouldRevealHomeSurface, backdropBlur: libraryBackdropBlur });

    // The two automix decks are identical and interchangeable. Every handler below ignores the
    // deck that is not currently active, so a track fading out in the background can never drive
    // the progress bar, the duration, the queue, or the player state.
    const renderAudioDeck = (deck: AutomixDeckId, register: (element: HTMLAudioElement | null) => void) => (
        <audio
            key={deck}
            data-folia-main-audio="1"
            // 哪一路是「当前」：原生侧每秒的焦点续播护栏靠它挑元素。两个 deck 都带
            // data-folia-main-audio，护栏原来用 querySelector 取第一个，第一次交叉淡化之后
            // 拿到的就是已经安静下来的那一路 —— 它会去 play() 那条本该停着的 deck。
            data-folia-active-deck={automix.activeDeck === deck ? '1' : undefined}
            ref={register}
            src={automix.deckSrc(deck)}
            preload="auto"
            crossOrigin="anonymous"
            loop={effectiveLoopMode === 'one' && automix.activeDeck === deck}
            onLoadStart={(e) => {
                // Silent unless the invariant breaks. A deck is only ever handed the source the
                // app is currently on, so the active deck loading anything else means the ref and
                // audioSrc have drifted apart - the state that once had a deck "start playing"
                // before it had a source, and then sit fully buffered in silence because the
                // autoplay intent had already been spent on it.
                // Never during a transition. There the active deck is *meant* to be rendering the
                // warmed source while audioSrc still names the track the other deck is finishing -
                // see resolveDeckSrc, where that fallthrough is what keeps the handover seamless.
                // Ordinarily the warm load happens seconds before the deck roles move and this is
                // never reached; entering the last few seconds abruptly, by seeking, collapses the
                // two into one pass and made this cry wolf.
                // Nor with no current source to contradict: between songs audioSrc is briefly null
                // while a deck is already loading the next one, and "differs from nothing" is not
                // a drift. The state this watches for is the opposite one - a source we are on
                // that some deck never picked up.
                if (automix.isTransitionAudible() || !audioSrc) return;
                if (automix.isActiveDeck(e.currentTarget) && e.currentTarget.getAttribute('src') !== audioSrc) {
                    console.error('[Audio] the active deck is loading something other than the current source', {
                        deck,
                        loading: e.currentTarget.getAttribute('src')?.slice(-40) ?? null,
                        audioSrc: audioSrc?.slice(-40) ?? null,
                    });
                }
            }}
            onPlay={(e) => {
                if (!automix.isActiveDeck(e.currentTarget)) return;
                shouldAutoPlay.current = false;
                // The same split onTimeUpdate, onSeeked and onLoadedMetadata all make, and the two
                // handlers that were missing it: while the picture is held this deck is the track
                // ARRIVING, so its position belongs to a song whose title nobody can see yet.
                if (!isShowingTail) currentTime.set(e.currentTarget.currentTime);
                setPlayerState(PlayerState.PLAYING);
            }}
            onPlaying={(e) => {
                if (!automix.isActiveDeck(e.currentTarget)) return;
                shouldAutoPlay.current = false;
                if (!isShowingTail) currentTime.set(e.currentTarget.currentTime);
                setupAudioAnalyzer();
                playbackAutoSkipCountRef.current = 0;
                // The source plays, so a later TTL refresh of the same media is legitimate again.
                lastAudioRecoverySourceRef.current = null;
                setPlayerState(PlayerState.PLAYING);
                // A preview clip is told of as it is heard, once per start of the song.
                notePreviewPlaying(e.currentTarget.currentSrc, t);
                // Last chance to refuse the blend, now that we know when this deck really started.
                automix.handleActiveDeckPlaying();
            }}
            onPause={(e) => {
                // A pause that flushing a fade-out made, while a new song is already being set up:
                // the transport state and play intent belong to that song now.
                if (consumeProgrammaticPause(e.currentTarget)) return;
                if (!automix.isActiveDeck(e.currentTarget)) return;
                // A deck whose source failed fires `pause` immediately AFTER `error` - Chromium
                // clears the play state as part of failing the load - and that is not the listener
                // pausing. Read as one, it dropped the transport to PAUSED and spent the autoplay
                // intent, and the transcode fallback then read that PAUSED back as "the listener
                // paused during recovery" and cancelled the resume: the track was transcoded, the
                // source re-pointed, and the deck left silent until play was pressed by hand.
                // What happens to a failed source belongs to the error path below.
                if (e.currentTarget.error) return;
                shouldAutoPlay.current = false;
                if (!e.currentTarget.ended) {
                    setPlayerState(PlayerState.PAUSED);
                }
            }}
            onTimeUpdate={(e) => {
                const audioElement = e.currentTarget;
                const isActive = automix.isActiveDeck(audioElement);
                // The clock and the transport are driven by different decks during a transition.
                // The picture still belongs to the track that is finishing, so the progress bar has
                // to be driven by ITS deck - the active one is seconds into a song nobody can see
                // the title of yet, and left on it the bar jumps to zero the moment a blend arms.
                // Only two decks exist and both render this handler, so "not active" is the tail.
                if (isShowingTail ? !isActive : isActive) {
                    if (!audioElement.paused && !audioElement.ended) currentTime.set(audioElement.currentTime);
                }
                // Everything below stays on the active deck whatever the picture is doing: player
                // state describes what the app is playing, and the transition check has to read
                // the position of the deck the NEXT blend will be planned from.
                if (!isActive) return;
                // Single loop: a wrap from the end back to the start is this track played in full,
                // cached as `onEnded` caches one (which a looping element never fires). Only on the
                // same source, so skipping to the next song near the end of this one is not a wrap.
                if (audioElement.loop) {
                    const previous = loopPositionRef.current;
                    const src = audioElement.currentSrc;
                    loopPositionRef.current = { src, time: audioElement.currentTime };
                    if (
                        previous?.src === src
                        && hasLoopedToStart(previous.time, audioElement.currentTime, audioElement.duration)
                        && audioSrc && !audioSrc.startsWith('blob:') && currentSong && !isStagePlaybackSong(currentSong)
                    ) {
                        cacheSongAssets();
                    }
                } else if (loopPositionRef.current) {
                    loopPositionRef.current = null;
                }
                // A track that is not moving is not approaching anything. `pause()` fires one last
                // timeupdate of its own, and a mid-blend pause cancels onto THIS deck before pausing
                // it - so that stray tick arrives with the deck already active and the track sitting
                // past its handover point, and arms the blend the listener just stopped, advancing
                // the queue behind it. Visible in the log as a cancel and a `playSong` in the same
                // second, or as a lone `plain cut` line when the track was too near its end to fade.
                if (audioElement.paused) return;
                // A pause that is still fading out has not reached the element yet, so this deck
                // reads as playing. Letting it through would flip the transport back to PLAYING for
                // the length of the fade and could arm a blend the listener just stopped.
                if (playbackFade.isFadingOut()) return;
                if (!audioElement.ended) setPlayerState(PlayerState.PLAYING);
                automix.checkTransitionPoint(audioElement.currentTime);
            }}
            onSeeked={(e) => {
                // Same split as onTimeUpdate: whichever deck the bar is showing is the one a seek
                // on it has to be reflected from.
                const isActive = automix.isActiveDeck(e.currentTarget);
                if (isShowingTail ? !isActive : isActive) currentTime.set(e.currentTarget.currentTime);
            }}
            // Buffer progress debug helper. Uncomment to inspect how much of
            // the current source the browser has actually buffered.
            // onProgress={(e) => {
            //     const audioElement = e.currentTarget;
            //     const buffered = audioElement.buffered;
            //     const source = audioElement.currentSrc || audioSrc;
            //     if (!source || buffered.length === 0 || !Number.isFinite(audioElement.duration) || audioElement.duration <= 0) {
            //         return;
            //     }
            //
            //     const bufferedEnd = buffered.end(buffered.length - 1);
            //     const bufferedPercent = Math.max(
            //         0,
            //         Math.min(100, Math.round((bufferedEnd / audioElement.duration) * 100))
            //     );
            //     if (lastBufferedPercentLogRef.current !== bufferedPercent) {
            //         lastBufferedPercentLogRef.current = bufferedPercent;
            //         console.log('[Audio] buffered percent', {
            //             src: source,
            //             currentTime: audioElement.currentTime,
            //             bufferedEnd,
            //             duration: audioElement.duration,
            //             bufferedPercent,
            //         });
            //     }
            // }}
            onEnded={(e) => {
                // A track finishing in the background has already handed the queue over.
                if (!automix.isActiveDeck(e.currentTarget)) {
                    automix.handleTailEnded();
                    return;
                }

                // Cache if playing fully
                if (audioSrc && !audioSrc.startsWith('blob:') && currentSong && !isStagePlaybackSong(currentSong)) {
                    cacheSongAssets();
                }

                // The track ran out while a pause was still fading: finish that pause instead of
                // advancing, or the next song starts under a player the listener just paused.
                if (playbackFade.isFadingOut()) {
                    playbackFade.flush();
                    return;
                }

                // If single loop is active, native loop handles it.
                // If not, we handle queue logic.
                if (effectiveLoopMode !== 'one') {
                    // 定时关闭选了「播完整首歌」：这一首放完就停，不换下一首。
                    if (finishSleepTimerTrackHold()) return;
                    void handleNextTrack({ allowStopOnMissing: true, shouldNavigateToPlayer: false });
                }
            }}
            onLoadedMetadata={(e) => {
                const audioElement = e.currentTarget;
                if (!automix.isActiveDeck(audioElement)) return;
                setDuration(audioElement.duration);
                // While the picture is held, this deck is the track ARRIVING: its length and its
                // position belong to a song the listener cannot see yet, and writing either here
                // would snap the bar to zero mid-blend. `duration` above is still set because the
                // transition planner needs it; only the visible clock is left alone.
                if (isShowingTail) return;

                const pendingResumeTime = pendingResumeTimeRef.current;
                if (pendingResumeTime !== null) {
                    const safeDuration = Number.isFinite(audioElement.duration) && audioElement.duration > 0
                        ? Math.max(audioElement.duration - 0.25, 0)
                        : pendingResumeTime;
                    const nextTime = Math.min(pendingResumeTime, safeDuration);
                    audioElement.currentTime = nextTime;
                    currentTime.set(nextTime);
                    pendingResumeTimeRef.current = null;
                    return;
                }

                currentTime.set(0); // Ensure currentTime is reset when new audio loads
            }}
            onError={(e) => {
                const audioElement = e.currentTarget;
                const isActiveDeck = automix.isActiveDeck(audioElement);
                const reportedDuration = Number.isFinite(audioElement.duration) && audioElement.duration > 0
                    ? audioElement.duration
                    : duration;
                const isLocalTailDecodeError = Boolean(
                    isActiveDeck &&
                    audioElement.error?.code === MediaError.MEDIA_ERR_DECODE &&
                    isLocalPlaybackSong(currentSong) &&
                    Number.isFinite(reportedDuration) &&
                    reportedDuration > 0 &&
                    audioElement.currentTime > 0 &&
                    reportedDuration - audioElement.currentTime <= LOCAL_TAIL_DECODE_ERROR_TOLERANCE_SEC
                );

                if (isLocalTailDecodeError) {
                    currentTime.set(Math.max(audioElement.currentTime, reportedDuration));
                    setPlayerState(PlayerState.IDLE);

                    if (effectiveLoopMode === 'one') {
                        audioElement.currentTime = 0;
                        audioElement.load();
                        const replayPromise = audioElement.play();
                        if (replayPromise !== undefined) {
                            replayPromise.catch(() => {
                                setPlayerState(PlayerState.PAUSED);
                            });
                        }
                        return;
                    }

                    void handleNextTrack({ allowStopOnMissing: true, shouldNavigateToPlayer: false });
                    return;
                }

                // A song that was loading to play has failed: it stops showing as playing while the
                // fallback, the address refresh or the skip below decide what comes next.
                if (isActiveDeck) endLoadingToPlay();

                if (handleTranscodeFallback(audioElement)) return;

                if (!isActiveDeck) {
                    automix.handleTailEnded();
                    return;
                }

                if (!audioSrc) {
                    return;
                }

                const failedSrc = audioElement.currentSrc || audioSrc;
                // Online sources (cached blobs included) refresh once and report a structured reason.
                if (currentSong && failedSrc && !isLocalPlaybackSong(currentSong) && !isNavidromePlaybackSong(currentSong) && !isStagePlaybackSong(currentSong)) {
                    void handleOnlineMediaFailure({
                        audioElement, failedSrc, song: currentSong, recoverOnlinePlaybackSource, skipAfterPlaybackFailure,
                        autoplay: (!audioElement.paused && !audioElement.ended) || playerState === PlayerState.PLAYING || shouldAutoPlay.current,
                    });
                    return;
                }

                skipAfterPlaybackFailure();
            }}
        />
    );
    return (
        <AppShell
            appStyle={appStyle}
            isElectronWindow={isElectronWindow}
            hideFullscreenButton={hideFullscreenButton}
            usesCustomWindowChrome={usesCustomWindowChrome}
            useCustomWindowRadius={isElectronWindow && transparentPlayerBackground && !wallpaperMode}
            showTransparentWindowBorder={showTransparentWindowBorder}
            isPlayerView={isPlayerView}
            isTitlebarRevealed={isTitlebarRevealed}
            alwaysShowMainWindowTitlebar={alwaysShowMainWindowTitlebar}
            isMainWindowClickThroughEnabled={isMainWindowClickThroughEnabled}
            showMainWindowClickThroughToggle={isMainWindowClickThroughEnabled ? isClickThroughToggleHotspotActive : isTitlebarRevealed}
            isDaylight={isDaylight}
            theme={theme}
            onToggleMainWindowClickThrough={() => {
                const nextEnabled = !isMainWindowClickThroughEnabled;
                if (!nextEnabled) {
                    setIsClickThroughToggleHotspotActive(false);
                }
                void window.electron?.setMainWindowClickThroughEnabled?.(nextEnabled);
                if (!nextEnabled) {
                    void window.electron?.setMainWindowClickThroughUnlockHover?.(false);
                }
            }}
            audioElement={<>
                {renderAudioDeck('A', automix.registerDeckA)}
                {renderAudioDeck('B', automix.registerDeckB)}
            </>}
        >

            {/* 首页层、Lattice 与两面墙共用的右下角工具按钮（WallToolsDock：交接时按钮节点不重建）。 */}
            <WallToolsDockHost host={wallToolsHost}>
            {/* Home Mount Point */}
            <div
                className="absolute inset-0 z-10"
                data-wall-handoff-layer="home"
                style={{
                    pointerEvents: shouldShowHomeSurface && !wallHandoff.active ? 'auto' : 'none',
                    visibility: isHomeSurfaceRevealed ? 'visible' : 'hidden',
                    transition: isHomeSurfaceRevealed
                        ? 'visibility 0s linear 0s'
                        : 'visibility 0s linear 0.25s',
                    display: isHomeFullyHidden && !wallHandoff.keepsHome ? 'none' : 'block',
                }}
            >
                <motion.div
                    className="absolute inset-0"
                    initial={false}
                    animate={{ opacity: isHomeSurfaceRevealed ? 1 : 0 }}
                    // 交接期间不跑整层淡入淡出：进 Lattice 时首页墙保持完全显示，回来时下面的墙要立刻是实的。
                    // Come up from the wall (it has not left the screen yet), Home is shown at
                    // once too: the wall is over it, and is what fades. A fade of both at a time
                    // lets what is under them through.
                    transition={{ duration: wallHandoff.active || !visualizerAroundWall.hasWallLeft ? 0 : 0.25, ease: 'easeInOut' }}
                >
                    {currentView === 'home' || currentView === 'player' || wallHandoff.keepsHome || holdsHomeForFlight ? (
                        <Home
                            model={homeModel}
                            isHomeFullyHidden={isHomeFullyHidden && !wallHandoff.keepsHome}
                            isInteractive={shouldShowHomeSurface}
                        />
                    ) : null}
                </motion.div>
            </div>

            <AnimatePresence
                initial={false}
                onExitComplete={wallExitCompleted}
            >
                {(currentView === 'lattice' || wallHandoff.keepsLattice) && (
                    <motion.div
                        key="lattice"
                        className={`absolute inset-0 z-10 ${wallHandoff.active ? 'pointer-events-none' : 'pointer-events-auto'}`}
                        data-wall-handoff-layer="lattice"
                        initial={wallHandoff.latticeOpacity && wallHandoff.latticeOpacity.initial !== false
                            ? { opacity: wallHandoff.latticeOpacity.initial }
                            : false}
                        animate={{ opacity: wallHandoff.latticeOpacity?.animate ?? 1 }}
                        // 交接期间：淡入淡出交叉用它自己的时长；翻牌交接时 Lattice 在翻完那一刻卸载，不再淡出。
                        // Otherwise how long the layer takes to leave depends on what the wall is left
                        // for, which is known when it leaves and not before (wallLayer.ts).
                        variants={WALL_LAYER}
                        custom={reduceLatticeMotion}
                        exit={wallHandoff.active ? { opacity: 0 } : 'gone'}
                        transition={{
                            duration: wallHandoff.latticeOpacity
                                ? wallHandoff.fadeSeconds
                                : wallHandoff.active || reduceLatticeMotion ? 0 : 0.62,
                            ease: wallHandoff.latticeOpacity ? 'easeInOut' : 'easeIn',
                        }}
                    >
                        <Suspense fallback={wallHandoff.active ? null : <div className="absolute inset-0 bg-[#070707]" />}>
                            <Lattice
                                controls={{ playback: commandPaletteContext.playback, loopMode: effectiveLoopMode,
                                    invokeCommandById: commandPalette.invokeCommandById, canInvokeCommandById: commandPalette.canInvokeCommandById,
                                    isStageActive: isNowPlayingStageActive, disabled: isNowPlayingControlDisabled }}
                                lyrics={commandPaletteContext.shared.lyrics}
                                lyricSource={visualizerRendererModel}
                                lyricKeywordColoringEnabled={visualizerRendererModel.visualizerTunings.monet.keywordColoringEnabled}
                                currentSong={displaySong}
                                playerState={displayPlayerState}
                                currentTime={currentTime}
                                playbackDuration={displayDuration}
                                canTogglePlayback={canToggleCurrentPlayback}
                                queue={playQueue}
                                isDaylight={isDaylight}
                                onBack={navigateBackFromLattice}
                                onGoHome={navigateToHome}
                                onOpenPlayer={navigateToPlayer}
                                onPlaySong={(song, queue) => {
                                    void playSong(song, queue, false, { shouldNavigateToPlayer: false });
                                }}
                                onTogglePlayback={togglePlay}
                                onSeek={seekMainAudio}
                                // For a wall opened from the explore tab: the page that tab shows, named as
                                // Grid3D names it, and a card's page opened as the tab opens it.
                                exploreProviderId={activeProviderId}
                                exploreAccountId={String(homeModel.surfaceProps.user?.id ?? '')}
                                onOpenCollection={collection => openHomeCollection(
                                    createOnlineGridViewCollection(collection, activeProviderId),
                                )}
                            />
                        </Suspense>
                    </motion.div>
                )}
            </AnimatePresence>
            </WallToolsDockHost>

            {/* --- VISUALIZER (Background Layer & Main Click Target) --- */}
            {/* 指针隐藏跟着控制栏的空闲时钟走，不另起一套计时：控件收起时页面上已经没有可点的东西，
                所以指针一起消失；任何鼠标移动都会同时唤回两者。class 只挂在这个视觉层容器上，
                弹窗、命令面板、浮动控件和标题栏按钮都是它的兄弟节点，不在作用域内。 */}
            {/* The visualizer is away while the wall covers it. When it is taken down and put
                back, and when it comes up in a fade of this layer, is wallLayer.ts's. */}
            <div
                className={`absolute inset-0 z-0${(shouldHidePlayerCursor || idleCursorHidden) ? ' cursor-auto-hidden' : ''}${visualizerAroundWall.fadesIn ? ' visualizer-comes-up' : ''}`}
                data-testid="player-visual-surface"
                data-library-backdrop-blur={blursVisualizerBackdrop || undefined}
                style={{
                    ...visualizerBackdropStyle(blursVisualizerBackdrop),
                    // 播放页只把横向手势留给应用：不设这个，手指一横移浏览器就判定为滚动手势，
                    // 直接发 pointercancel 掐断事件流 —— 长按滑轨「一亮就被收走」就是这么来的。
                    // 用 pan-y 而不是 none：纵向滚动照常可用（不需要横向滚动的页面元素不受影响）。
                    ...(currentView === 'player' ? { touchAction: 'pan-y' as const } : {}),
                }}
                onClick={handleContainerClick}
                {...playerSurfaceHandlers}
            >
                <PlayerBottomBarLayoutContext.Provider value={currentView === 'player'}>
                    {shouldMountVisualizer && <VisualizerRenderer {...visualizerRendererModel} animateStyleSwitch />}
                </PlayerBottomBarLayoutContext.Provider>
            </div>

            {/* 双击手势的落点反馈：只在触发后短暂出现，pointer-events-none，不占版面 */}
            <PlayerDoubleTapFeedback cue={doubleTapCue} />

            {/* 长按手势的落点控件：长按成立后浮现，左右滑动命中或取消时收起 */}
            <PlayerLongPressHandle position={longPressHandle} slideX={longPressSlideX} />

            {/* 在线更新弹窗：下载走系统浏览器，APK 由系统安装器接管 */}
            <AppUpdateDialog
                info={availableUpdate}
                onDownload={url => {
                    window.open(url, '_blank', 'noopener,noreferrer');
                    dismissUpdate();
                }}
                onLater={dismissUpdate}
                onSkip={skipUpdateVersion}
            />

            {/* 返回键二次确认：点确定才真的退到桌面 */}
            {/* 浮层位置的手动调整层：只在「拖动调整位置」开着时出现 */}
            <ChromeEditOverlay />

            <ExitConfirmDialog
                open={exitConfirmOpen}
                onCancel={() => setExitConfirmOpen(false)}
                onConfirm={() => {
                    setExitConfirmOpen(false);
                    void moveAppToBack();
                }}
            />

            <StageSessionEmptyState
                stageSource={stageSource}
                stageActiveEntryKind={stageActiveEntryKind}
                nowPlayingConnectionStatus={nowPlayingConnectionStatus}
                playerCapConnectionStatus={playerCapConnectionStatus}
            />

            <AppOverlays model={appOverlaysModel} />

            {/* Folium `app.overlay` stage layers: above the whole app, inert unless a layer opts in. */}
            <FoliumStageLayerSlot
                slot="app.overlay"
                theme={theme}
                isDaylight={isDaylight}
                paused={displayPlayerState !== PlayerState.PLAYING}
                className="fixed inset-0 pointer-events-none z-[1000]"
            />

            {/* Not in the overlays model: it takes no state from this file and no click from anyone.
                Mounted whenever its own switch is on, so the lazy animejs chunk loads only when it is
                wanted; the fallback is empty because it draws nothing until a cue arrives anyway.

                Its own switch, not shared with the card's border. It used to hide itself wherever the
                card was up, which on the lyrics page - the one people watch - meant the ring was never
                seen again after the card shipped. Two pictures of one blend is now something the
                listener asks for rather than something this file rules out. */}
            {transitionAnimation && transitionMode === 'automix' && (
                <Suspense fallback={null}>
                    <AutomixTransitionAnimation theme={theme} isDaylight={isDaylight} />
                </Suspense>
            )}

            {/* 旧版 automix 模型留在用户自选目录里时，问一次要不要删；没有就什么都不画。 */}
            <LegacyModelsPrompt isDaylight={isDaylight} />

            {/* 思索教程。常驻的只有悬停探测和提示胶囊；教程层自己走 React.lazy，
                animejs 不进 bootstrap chunk。 */}
            <PonderHost theme={theme} isDaylight={isDaylight} />

            {currentView === 'player' && !(isLyricMatchOpen && isLocalPlaybackSong(currentSong)) && (
                <PlayerPanel model={playerPanelModel} />
            )}

            <ThemeQuickEditorHost onSaveAiTheme={saveEditedAiDualTheme} onSaveCustomTheme={saveCustomDualTheme} />

            {/* Mounted here rather than inside the panel that used to own it: the picker answers a
                question about the current song, and a shortcut has to reach it with the panel shut. */}
            <AddToPlaylistHost
                isDaylight={isDaylight}
                localPlaylists={localPlaylists}
                onlinePlaylists={onlinePlaylists}
                onAddCurrentSongToLocalPlaylist={addCurrentSongToLocalPlaylist}
                onCreateCurrentLocalPlaylist={createCurrentLocalPlaylist}
                onAddCurrentSongToOnlinePlaylist={addCurrentSongToOnlinePlaylist}
                onCreateCurrentOnlinePlaylist={createCurrentOnlinePlaylist}
                onAddCurrentSongToNavidromePlaylist={addCurrentSongToNavidromePlaylist}
                onCreateCurrentNavidromePlaylist={createCurrentNavidromePlaylist}
            />

            <CommandPalette
                activeIndex={commandPalette.activeIndex}
                activePreview={commandPalette.activePreview}
                activeCommand={commandPalette.activeCommand}
                availableCommands={commandPalette.availableCommands}
                context={commandPaletteContext}
                isDaylight={isDaylight}
                isComposing={commandPalette.isComposing}
                isExecuting={commandPalette.isExecuting}
                isOpen={commandPalette.isOpen}
                matches={commandPalette.matches}
                pinnedCommands={commandPalette.pinnedCommands}
                query={commandPalette.query}
                theme={theme}
                onActiveCommandChange={commandPalette.setActiveCommand}
                onActiveIndexChange={commandPalette.setActiveIndex}
                onClose={commandPalette.close}
                onCompositionEnd={(value) => {
                    commandPalette.setIsComposing(false);
                    commandPalette.commitQuery(value);
                }}
                onCompositionStart={() => commandPalette.setIsComposing(true)}
                onExecuteActive={commandPalette.executeActive}
                onExecuteMatch={commandPalette.executeMatch}
                onExecutePinnedCommand={commandPalette.executePinnedCommand}
                onQueryChange={commandPalette.setQuery}
                onQueryCommit={commandPalette.commitQuery}
            />

            <AppDialogs model={appDialogsModel} />
            {/* 登录窗口挂在最外层：每个资料库界面（网格、Bravais、文本）都用 openLoginWindow 打开同一个窗口。 */}
            <LoginHost account={accountController} />
            {signOutDialog}
            <ReleaseNotesDialog
                isOpen={startupExperience.isReleaseNotesOpen}
                isDaylight={isDaylight}
                onClose={startupExperience.closeReleaseNotes}
            />
            <UserGuideModal theme={theme} />
            <PlaybackEntryViewPrompt theme={theme} />
            <LatticeFmNotice />
        </AppShell>
    );
}
