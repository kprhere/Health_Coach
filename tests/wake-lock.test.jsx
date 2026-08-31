// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { screenWakeLockSupported, useScreenWakeLock } from '../src/wakeLock.js';

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

function Harness({ enabled }) {
  const active = useScreenWakeLock(enabled);
  return <output>{active ? 'awake' : 'sleeping'}</output>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.wakeLock;
});

describe('screen wake lock', () => {
  test('reports unsupported browsers without requesting anything', () => {
    expect(screenWakeLockSupported()).toBe(false);
    render(<Harness enabled />);
    expect(screen.getByText('sleeping')).toBeTruthy();
  });

  test('holds a lock while enabled and releases it on cleanup', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ addEventListener: vi.fn(), release });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });

    const view = render(<Harness enabled />);
    await settle();

    expect(request).toHaveBeenCalledWith('screen');
    expect(screen.getByText('awake')).toBeTruthy();

    view.unmount();
    await settle();
    expect(release).toHaveBeenCalledOnce();
  });
});
