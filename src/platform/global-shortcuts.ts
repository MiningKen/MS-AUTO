import { register, unregister } from '@tauri-apps/plugin-global-shortcut';
import { createDoublePressHandler } from '../core/double-press';

export interface ControlShortcutRegistration {
  toggleShortcut: string | null;
  stopAvailable: boolean;
  unregister: () => Promise<void>;
}

export async function registerControlShortcuts(
  onToggle: () => void,
  onStop: () => void,
  onUnavailable: (registration: Pick<ControlShortcutRegistration, 'toggleShortcut' | 'stopAvailable'>) => void
): Promise<ControlShortcutRegistration> {
  const stopOnDoubleEscape = createDoublePressHandler(onStop);
  const registered: string[] = [];

  async function tryRegister(shortcut: string, handler: () => void) {
    try {
      await register(shortcut, (event) => {
        if (event.state === 'Pressed') handler();
      });
      registered.push(shortcut);
      return true;
    } catch (error) {
      console.info(`全域熱鍵 ${shortcut} 無法註冊。`, error);
      return false;
    }
  }

  const toggleShortcut = await tryRegister('F12', onToggle)
    ? 'F12'
    : await tryRegister('Control+Shift+F12', onToggle)
      ? 'Ctrl + Shift + F12'
      : null;
  const stopAvailable = await tryRegister('F1', stopOnDoubleEscape);
  const registration = {
    toggleShortcut,
    stopAvailable,
    unregister: async () => { await unregister(registered); }
  };

  if (!toggleShortcut || !stopAvailable) onUnavailable(registration);
  return registration;
}
