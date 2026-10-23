import { beforeEach, describe, expect, it, vi } from 'vitest';

const shortcuts = vi.hoisted(() => ({ register: vi.fn(), unregister: vi.fn() }));

vi.mock('@tauri-apps/plugin-global-shortcut', () => shortcuts);

import { registerControlShortcuts } from '../src/platform/global-shortcuts';

describe('registerControlShortcuts', () => {
  beforeEach(() => {
    shortcuts.register.mockReset();
    shortcuts.unregister.mockReset();
    shortcuts.register.mockResolvedValue(undefined);
    shortcuts.unregister.mockResolvedValue(undefined);
  });

  it('keeps double-Escape available when F12 is already taken by another app', async () => {
    const onToggle = vi.fn();
    const onStop = vi.fn();
    shortcuts.register
      .mockRejectedValueOnce(new Error('F12 is already registered'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    const registration = await registerControlShortcuts(onToggle, onStop, vi.fn());

    expect(shortcuts.register).toHaveBeenCalledWith('F12', expect.any(Function));
    expect(shortcuts.register).toHaveBeenCalledWith('Control+Shift+F12', expect.any(Function));
    expect(shortcuts.register).toHaveBeenCalledWith('Escape', expect.any(Function));
    expect(registration.toggleShortcut).toBe('Ctrl + Shift + F12');
    expect(registration.stopAvailable).toBe(true);

    const escapeHandler = shortcuts.register.mock.calls[2][1];
    escapeHandler({ shortcut: 'Escape', id: 2, state: 'Pressed' });
    escapeHandler({ shortcut: 'Escape', id: 2, state: 'Pressed' });

    expect(onToggle).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
