// src/components/wall/wallView.ts

import type { Bounds } from './layout';

// Viewport <-> world conversions for the fixed-world wall. The pure geometry here talks about the
// world point under the seam line (the "view centre"); the DOM camera is a translation plus scale.

export type WallView = {
    /** Viewport size in screen px. */
    width: number;
    height: number;
    scale: number;
    /** Screen x of the seam's base line; the viewport's horizontal middle when omitted. */
    lineX?: number;
};

export type WallViewCenter = { x: number; y: number };

/** Same shape as the wall's DOM camera: `screen = camera + world * scale`. */
export type WallViewCamera = { x: number; y: number; scale: number };

export const getViewLineX = (view: WallView) => view.lineX ?? view.width / 2;

/**
 * The world layer's CSS transform for a camera, with the translation snapped to whole device pixels.
 * The world is deliberately not `will-change: transform` (see wall.css), and without that hint Chromium
 * aligns the layer's raster to the pixel grid: every change in the fractional part of the translation
 * throws the tiles away and rasterizes the whole visible wall again, i.e. on every frame of a wheel glide,
 * a drag or a camera tween. Moving in whole device pixels keeps that fraction fixed, so panning only moves
 * tiles, the same way the browser snaps its own scroll offsets.
 */
/**
 * 一个长度吸附到整设备像素。世界层与缝（页面内容那一栏）都用它：图层没有 will-change 时，Chromium
 * 按像素网格对齐栅格，位移的小数部分一变就把整层丢掉重新栅格化 —— 表现为拖动时文字发虚、偶尔闪一下。
 */
export const snapToDevicePixel = (value: number, devicePixelRatio = window.devicePixelRatio || 1) => (
    Math.round(value * devicePixelRatio) / devicePixelRatio
);

export const formatWorldTransform = (x: number, y: number, scale: number, devicePixelRatio = window.devicePixelRatio || 1) => {
    const snap = (value: number) => snapToDevicePixel(value, devicePixelRatio);
    return `translate3d(${snap(x)}px, ${snap(y)}px, 0) scale(${scale})`;
};

export const viewCenterFromCamera = (camera: WallViewCamera, view: WallView): WallViewCenter => ({
    x: (getViewLineX(view) - camera.x) / camera.scale,
    y: (view.height / 2 - camera.y) / camera.scale,
});

export const cameraFromViewCenter = (center: WallViewCenter, view: WallView): WallViewCamera => ({
    x: getViewLineX(view) - center.x * view.scale,
    y: view.height / 2 - center.y * view.scale,
    scale: view.scale,
});

/**
 * World rect on screen around a view centre. An open seam pushes the two halves apart, so the
 * horizontal span is widened by the seam width on both sides (as the prototype's culling does).
 */
export const getViewWorldBounds = (
    center: WallViewCenter,
    view: WallView,
    { seamWidth = 0, overscan = 0 }: { seamWidth?: number; overscan?: number } = {},
): Bounds => {
    const lineX = getViewLineX(view);
    return {
        left: center.x - (lineX + seamWidth) / view.scale - overscan,
        right: center.x + (view.width - lineX + seamWidth) / view.scale + overscan,
        top: center.y - view.height / 2 / view.scale - overscan,
        bottom: center.y + view.height / 2 / view.scale + overscan,
    };
};
