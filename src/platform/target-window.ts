import { invoke } from '@tauri-apps/api/core';
import type { InputTarget } from '../core/task-scheduler';

export type CapturedTarget = Extract<InputTarget, { mode: 'window' }>;

export async function captureForegroundTarget(): Promise<CapturedTarget> {
  return invoke<CapturedTarget>('capture_target');
}
