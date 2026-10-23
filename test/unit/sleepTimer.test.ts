// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useSleepTimer } from '../../src/hooks/useSleepTimer';
import { useSleepTimerStore } from '../../src/stores/useSleepTimerStore';

// 定时关闭的到点判定：把 hook 挂在一个最小宿主里，用假时钟推进，看它到底会不会执行到点动作。
// 这是「定时关闭不能用」那条反馈的回归用例。

const Harness = ({ onExpire }: { onExpire: () => void }) => {
    const enabled = useSleepTimerStore(state => state.sleepTimerEnabled);
    const hours = useSleepTimerStore(state => state.sleepTimerHours);
    const minutes = useSleepTimerStore(state => state.sleepTimerMinutes);
    useSleepTimer({ enabled, hours, minutes, onExpireFallback: onExpire });
    return null;
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const mount = (onExpire: () => void) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
        root!.render(createElement(Harness, { onExpire }));
    });
};

afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
    root = null;
    container = null;
    vi.useRealTimers();
    useSleepTimerStore.setState({
        sleepTimerEnabled: false,
        sleepTimerHours: 0,
        sleepTimerMinutes: 0,
        sleepTimerDeadlineMs: null,
        sleepTimerHoldsForTrackEnd: false,
    });
});

describe('useSleepTimer', () => {
    it('到点后就执行到点动作（立刻关闭）', () => {
        vi.useFakeTimers();
        const onExpire = vi.fn();
        mount(onExpire);

        act(() => {
            useSleepTimerStore.getState().handleSetSleepTimerMinutes(1);
            useSleepTimerStore.getState().handleToggleSleepTimer(true);
        });

        act(() => { vi.advanceTimersByTime(50_000); });
        expect(onExpire).not.toHaveBeenCalled();

        act(() => { vi.advanceTimersByTime(12_000); });
        expect(onExpire).toHaveBeenCalledTimes(1);
        expect(useSleepTimerStore.getState().sleepTimerEnabled).toBe(false);
    });

    it('没设时长就打开：按默认 15 分钟开始，而不是点了没反应', () => {
        vi.useFakeTimers();
        const onExpire = vi.fn();
        mount(onExpire);

        act(() => {
            useSleepTimerStore.getState().handleSetSleepTimerHours(0);
            useSleepTimerStore.getState().handleSetSleepTimerMinutes(0);
            useSleepTimerStore.getState().handleToggleSleepTimer(true);
        });

        // 打开之后时长被补成 15 分钟，并且定时确实是开着的
        expect(useSleepTimerStore.getState().sleepTimerMinutes).toBe(15);
        expect(useSleepTimerStore.getState().sleepTimerEnabled).toBe(true);

        act(() => { vi.advanceTimersByTime(14 * 60 * 1000); });
        expect(onExpire).not.toHaveBeenCalled();

        act(() => { vi.advanceTimersByTime(70 * 1000); });
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('页面重新可见时补一次到期检查（后台被冻住的定时器）', () => {
        vi.useFakeTimers();
        const onExpire = vi.fn();
        mount(onExpire);

        act(() => {
            useSleepTimerStore.getState().handleSetSleepTimerMinutes(1);
            useSleepTimerStore.getState().handleToggleSleepTimer(true);
        });

        // 假装这段时间页面在后台、tick 一次都没跑：只推进系统时间，不推进定时器。
        const realNow = Date.now();
        vi.setSystemTime(realNow + 90_000);
        act(() => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(onExpire).toHaveBeenCalledTimes(1);
    });
});
