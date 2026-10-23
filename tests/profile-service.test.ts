import { describe, expect, it } from 'vitest';
import { ProfileService, type Profile } from '../src/core/profile-service';
import { parseProfile, parseProfiles } from '../src/core/profile-codec';

const task = {
  id: 'copy',
  name: 'Copy',
  shortcut: { key: 'C', modifiers: ['Control'] },
  intervalMs: 500,
  enabled: true
};

const profile: Profile = { id: 'work', name: 'Office work', tasks: [task] };

describe('ProfileService', () => {
  it('rejects malformed imported and saved profile data before domain validation', () => {
    expect(() => parseProfile({ id: 'work', name: 'Office work', tasks: [{ id: 'copy' }] }))
      .toThrow('任務間隔必須是有效數字');
    expect(() => parseProfiles('{"id":"work"}')).toThrow('設定資料必須是設定檔陣列');
    expect(() => parseProfile({ ...profile, tasks: [{ ...task, randomIntervalMs: { min: 'fast', max: 500 } }] }))
      .toThrow('隨機間隔必須是有效數字');
  });

  it('rejects intervals below 0.1 seconds and duplicate enabled shortcuts', () => {
    const service = new ProfileService();

    expect(() =>
      service.validate({
        ...profile,
        tasks: [
          task,
          { ...task, id: 'copy-again', name: 'Copy again', intervalMs: 99 }
        ]
      })
    ).toThrow('每個已啟用按鍵必須唯一');

    expect(() =>
      service.validate({ ...profile, tasks: [{ ...task, intervalMs: 99 }] })
    ).toThrow('間隔至少必須是 0.1 秒');

    expect(() =>
      service.validate({ ...profile, tasks: [{ ...task, randomIntervalMs: { min: 1_000, max: 500 } }] })
    ).toThrow('隨機間隔的最小值至少為 0.1 秒，且不可大於最大值');
  });

  it('rejects enabled tasks that conflict with the F12 or Esc control keys', () => {
    const service = new ProfileService();

    expect(() => service.validate({ ...profile, tasks: [{ ...task, shortcut: { key: 'F12', modifiers: [] } }] }))
      .toThrow('不能使用 F12 或 Esc 作為連點按鍵');
  });

  it('requires an explicit resolution when an imported profile name already exists', () => {
    const service = new ProfileService([profile]);

    expect(service.import(profile, 'skip')).toEqual({ type: 'skipped' });
    expect(service.import(profile, 'copy')).toMatchObject({
      type: 'imported',
      profile: { name: 'Office work (副本)' }
    });
    expect(service.import({ ...profile, tasks: [] }, 'replace')).toEqual({
      type: 'replaced',
      profile: { ...profile, tasks: [] }
    });
  });
});
