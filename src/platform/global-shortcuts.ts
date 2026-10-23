import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { createDoublePressHandler } from '../core/double-press';

export async function registerControlShortcuts(
  onToggle: () => void,
  onStop: () => void,
  onUnavailable: () => void
) {
  const stopOnDoubleEscape = createDoublePressHandler(onStop);
  let f12Registered = false;
  try {
    await register('F12', (event) => {
      if (event.state === 'Pressed') {
        onToggle();
      }
    });
    f12Registered = true;
    await register('Escape', (event) => {
      if (event.state === 'Pressed') {
        stopOnDoubleEscape();
      }
    });

    return async () => unregister(['F12', 'Escape']);
  } catch (error) {
    if (f12Registered) await unregister('F12');
    console.info('全域熱鍵無法註冊。', error);
    onUnavailable();
    return () => Promise.resolve();
  }
}
