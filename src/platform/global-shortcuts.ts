import { register, unregister } from '@tauri-apps/plugin-global-shortcut';

export async function registerControlShortcuts(
  onToggle: () => void,
  onStop: () => void,
  onUnavailable: () => void
) {
  try {
    await register('F12', (event) => {
      if (event.state === 'Pressed') {
        onToggle();
      }
    });
    await register('Esc', (event) => {
      if (event.state === 'Pressed') {
        onStop();
      }
    });

    return async () => unregister(['F12', 'Esc']);
  } catch (error) {
    console.info('全域熱鍵無法註冊。', error);
    onUnavailable();
    return () => Promise.resolve();
  }
}
