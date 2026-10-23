import type { InputTarget, ScheduledTask } from './task-scheduler';

export type Profile = {
  id: string;
  name: string;
  tasks: ScheduledTask[];
  target?: InputTarget;
};

export type ImportResolution = 'skip' | 'copy' | 'replace';

export type ImportResult =
  | { type: 'skipped' }
  | { type: 'imported'; profile: Profile }
  | { type: 'replaced'; profile: Profile };

export class ProfileService {
  private profiles: Profile[];

  constructor(profiles: Profile[] = []) {
    this.profiles = [...profiles];
  }

  validate(profile: Profile): void {
    const enabledShortcuts = new Set<string>();

    for (const task of profile.tasks) {
      if (!task.enabled) {
        continue;
      }

      if (task.shortcut.modifiers.length === 0 && ['F1', 'F12'].includes(task.shortcut.key)) {
        throw new Error('不能使用 F12 或 Esc 作為連點按鍵');
      }

      const shortcut = shortcutId(task);
      if (enabledShortcuts.has(shortcut)) {
        throw new Error('每個已啟用按鍵必須唯一');
      }
      enabledShortcuts.add(shortcut);
    }

    for (const task of profile.tasks) {
      if (task.intervalMs < 100) {
        throw new Error('間隔至少必須是 0.1 秒');
      }
    }
  }

  import(profile: Profile, resolution: ImportResolution): ImportResult {
    this.validate(profile);
    const matchingIndex = this.profiles.findIndex(
      (existing) => existing.name === profile.name
    );

    if (matchingIndex === -1) {
      this.profiles.push(profile);
      return { type: 'imported', profile };
    }

    if (resolution === 'skip') {
      return { type: 'skipped' };
    }

    if (resolution === 'replace') {
      this.profiles[matchingIndex] = profile;
      return { type: 'replaced', profile };
    }

    const copiedProfile = {
      ...profile,
      id: crypto.randomUUID(),
      name: this.uniqueCopyName(profile.name)
    };
    this.profiles.push(copiedProfile);
    return { type: 'imported', profile: copiedProfile };
  }

  private uniqueCopyName(name: string): string {
    const existingNames = new Set(this.profiles.map((profile) => profile.name));
    const baseName = `${name} (副本)`;
    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let number = 2;
    while (existingNames.has(`${name} (副本 ${number})`)) {
      number += 1;
    }
    return `${name} (副本 ${number})`;
  }
}

function shortcutId(task: ScheduledTask): string {
  return [...task.shortcut.modifiers].sort().join('+') + `+${task.shortcut.key}`;
}
