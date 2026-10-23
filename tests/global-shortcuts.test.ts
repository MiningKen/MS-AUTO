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

  it('registers F12 and Escape together so controls are never only partially available', async () => {
    const onToggle = vi.fn();
    const onStop = vi.fn();
    await registerControlShortcuts(onToggle, onStop, vi.fn());

    expect(shortcuts.register).toHaveBeenCalledTimes(1);
    expect(shortcuts.register).toHaveBeenCalledWith(['F12', 'Escape'], expect.any(Function));

    const handler = shortcuts.register.mock.calls[0][1];
    handler({ shortcut: 'F12', id: 1, state: 'Pressed' });
    handler({ shortcut: 'Escape', id: 2, state: 'Pressed' });
    handler({ shortcut: 'Escape', id: 2, state: 'Pressed' });

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
