import React, { useState } from 'react';
import { Crosshair } from 'lucide-react';
import { scaledPx, useWallChromeOffsetStore, WALL_CHROME_SCALE_DEFAULT_PERCENT } from '../../../stores/useWallChromeOffsetStore';

// src/components/app/playing-song-locator/GridLocateButton.tsx
// "Is the song that is playing on this page": the small round button that stands above a grid's
// action button (GridListSearchButton's `above`). It is lit while the song is one of the cards
// of the page it stands on, so that a glance tells what a press will find.
// A press answers at once with a ring that leaves the button and a mark that turns into place.
// A page that was opened to show the song (the player's "playing from") may still wait for the
// tracks that hold it: rings keep leaving the button for as long as it does.
// The walls (lattice, and the bravais library) carry the same button above their tools button, for their tiles.

interface GridLocateButtonProps {
    isDaylight: boolean;
    accentColor: string;
    /** The playing song is one of this page's cards. */
    isHere: boolean;
    /** The page was asked for the song and has not answered yet. */
    isSeeking: boolean;
    title: string;
    onLocate: () => void;
}

export const GridLocateButton: React.FC<GridLocateButtonProps> = ({ isDaylight, accentColor, isHere, isSeeking, title, onLocate }) => {
    const [presses, setPresses] = useState(0);
    // 位置微调用相对定位的 left/top，不用 transform：这个按钮的常态位移与悬停滑动都写在
    // translate-x-* 上，inline transform 会把它们盖掉。
    // 尺寸用内联 width/height 覆盖 Tailwind 的 h-10 w-10，图标跟着等比缩。
    const offset = useWallChromeOffsetStore(state => state.offsets.wallLocate);
    const scale = useWallChromeOffsetStore(state => state.scale);
    const sizePx = scaledPx(40, scale);
    const hasOffset = offset.x !== 0 || offset.y !== 0;
    const chromeStyle = {
        ...(hasOffset ? { position: 'relative' as const, left: offset.x, top: offset.y } : {}),
        ...(scale !== WALL_CHROME_SCALE_DEFAULT_PERCENT ? { width: sizePx, height: sizePx } : {}),
    };
    return (
        <button
            type="button"
            style={Object.keys(chromeStyle).length > 0 ? chromeStyle : undefined}
            data-grid-locate={isHere ? 'here' : 'elsewhere'}
            data-grid-locate-seeking={isSeeking ? 'yes' : 'no'}
            aria-busy={isSeeking}
            title={title}
            aria-label={title}
            onClick={() => {
                setPresses(count => count + 1);
                onLocate();
            }}
            // It moves with the action button below it: half out of the way on a narrow window, whole on a wide one.
            // 过渡只给颜色 / 透明度 / 变换，绝不给 all：拖动调位置时 left/top/width/height 每帧都在变，
            // all + duration-300 会让按钮拖着 300ms 的尾迹追手（实测反馈「不跟手」）。
            className={`relative mr-1 flex h-10 w-10 translate-x-1/2 items-center justify-center rounded-full opacity-60 shadow-lg backdrop-blur-md transition-[color,background-color,opacity,transform] duration-300 active:scale-90 group-hover:translate-x-0 group-hover:opacity-100 md:translate-x-0 md:opacity-100 md:hover:scale-105 ${isDaylight ? 'bg-white/70 text-zinc-900' : 'bg-black/40 text-white'}`}
        >
            {isSeeking
                ? <span className="locate-seeking pointer-events-none absolute inset-0 rounded-full border" style={{ borderColor: accentColor }} />
                : presses > 0 && <span key={`ring-${presses}`} className="locate-ring pointer-events-none absolute inset-0 rounded-full border" style={{ borderColor: accentColor }} />}
            <Crosshair key={presses} size={18} className={presses > 0 ? 'locate-mark' : undefined} style={{ color: isHere ? accentColor : undefined }} />
        </button>
    );
};
