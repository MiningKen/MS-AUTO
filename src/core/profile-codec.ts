import { ProfileService, type Profile } from './profile-service';
import type { KeyShortcut, ScheduledTask } from './task-scheduler';

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

  const profile = {
    id: nonEmptyString(record.id, '設定檔 id'),
    name: nonEmptyString(record.name, '設定檔名稱'),
    tasks: tasks.map(parseTask)
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
    shortcut: parseShortcut(record.shortcut)
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
