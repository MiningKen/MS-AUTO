import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export async function setTrayStatus(running: boolean): Promise<void> {
  try {
    await invoke('set_tray_status', { running });
  } catch (error) {
    console.info('系統匣狀態只會在 Tauri 桌面版生效。', error);
  }
}

export async function accessibilityPermissionGranted(): Promise<boolean | null> {
  try {
    return await invoke<boolean>('accessibility_permission_status');
  } catch (error) {
    console.info('輔助使用權限檢查只會在 Tauri 桌面版生效。', error);
    return null;
  }
}

export async function openAccessibilitySettings(): Promise<void> {
  await invoke('open_accessibility_settings');
}

export async function onTrayStop(handler: () => void): Promise<UnlistenFn | undefined> {
  try {
    return await listen('stop-tasks', handler);
  } catch (error) {
    console.info('系統匣事件只會在 Tauri 桌面版生效。', error);
    return undefined;
  }
}
