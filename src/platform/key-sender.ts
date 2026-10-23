import { invoke } from '@tauri-apps/api/core';
import type { KeySender, ScheduledTask } from '../core/task-scheduler';

export class DesktopKeySender implements KeySender {
  async send(task: ScheduledTask): Promise<void> {
    try {
      await invoke('send_shortcut', { shortcut: task.shortcut, target: task.target ?? { mode: 'focused' } });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.info('模擬送鍵：', task.shortcut, error);
        return;
      }
      throw error;
    }
  }
}
