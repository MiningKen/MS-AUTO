import { invoke } from '@tauri-apps/api/core';
import type { KeySender, KeyShortcut } from '../core/task-scheduler';

export class DesktopKeySender implements KeySender {
  async send(shortcut: KeyShortcut): Promise<void> {
    try {
      await invoke('send_shortcut', { shortcut });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.info('模擬送鍵：', shortcut, error);
        return;
      }
      throw error;
    }
  }
}
