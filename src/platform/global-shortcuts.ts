import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { createDoublePressHandler } from '../core/double-press';

export async function registerControlShortcuts(
  onToggle: () => void,
  onStop: () => void,
  onUnavailable: () => void
) {
  const stopOnDoubleEscape = createDoublePressHandler(onStop);
  try {
    await register(['F12', 'Escape'], (event) => {
      if (event.state !== 'Pressed') return;
      if (event.shortcut.toLowerCase() === 'f12') {
        onToggle();
      }
      if (['escape', 'esc'].includes(event.shortcut.toLowerCase())) {
        stopOnDoubleEscape();
      }
    });

    return async () => unregister(['F12', 'Escape']);
  } catch (error) {
    console.info('全域熱鍵無法註冊。', error);
    onUnavailable();
    return () => Promise.resolve();
  }
}
