import { ProfileService, type Profile } from './profile-service';
import type { InputTarget, KeyShortcut, ScheduledTask } from './task-scheduler';

export function parseProfiles(value: string): Profile[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error('設定資料必須是設定檔陣列');
  }
  return parsed.map(parseProfile);
}

export function parseProfile(value: unknown): Profile {
  const record = objectRecord(value, '設定檔');
  const tasks = record.tasks;
  if (!Array.isArray(tasks)) {
    throw new Error('設定檔的任務必須是陣列');
  }

  const parsedTasks = tasks.map(parseTask);
  const legacyTarget = parsedTasks.find((task) => task.target?.mode === 'window')?.target;
  const profile = {
    id: nonEmptyString(record.id, '設定檔 id'),
    name: nonEmptyString(record.name, '設定檔名稱'),
    tasks: parsedTasks.map((task) => {
      const migratedTask = { ...task };
      delete migratedTask.target;
      return migratedTask;
    }),
    target: parseTarget(record.target) ?? legacyTarget ?? { mode: 'focused' as const }
  };
  new ProfileService().validate(profile);
  return profile;
}

function parseTask(value: unknown): ScheduledTask {
  const record = objectRecord(value, '任務');
  const intervalMs = record.intervalMs;
  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs)) {
    throw new Error('任務間隔必須是有效數字');
  }
  if (typeof record.enabled !== 'boolean') {
    throw new Error('任務啟用狀態必須是布林值');
  }

  return {
    id: nonEmptyString(record.id, '任務 id'),
    name: nonEmptyString(record.name, '任務名稱'),
    intervalMs,
    enabled: record.enabled,
    shortcut: parseShortcut(record.shortcut),
    target: parseTarget(record.target)
  };
}

function parseTarget(value: unknown): InputTarget | undefined {
  if (value === undefined) return undefined;
  const record = objectRecord(value, '目標視窗');
  if (record.mode === 'focused') return { mode: 'focused' };
  if (record.mode !== 'window') throw new Error('目標視窗模式無效');
  const processId = record.processId;
  if (typeof processId !== 'number' || !Number.isInteger(processId) || processId <= 0) {
    throw new Error('目標視窗程序無效');
  }
  if (record.platform !== 'windows' && record.platform !== 'macos') {
    throw new Error('目標視窗平台無效');
  }
  return {
    mode: 'window',
    id: nonEmptyString(record.id, '目標視窗 id'),
    title: nonEmptyString(record.title, '目標視窗名稱'),
    processId,
    platform: record.platform
  };
}

function parseShortcut(value: unknown): KeyShortcut {
  const record = objectRecord(value, '按鍵');
  if (!Array.isArray(record.modifiers) || !record.modifiers.every((item) => typeof item === 'string')) {
    throw new Error('按鍵修飾鍵必須是文字陣列');
  }
  return {
    key: nonEmptyString(record.key, '按鍵'),
    modifiers: record.modifiers
  };
}

function objectRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name}格式無效`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name}必須是非空白文字`);
  }
  return value;
}
