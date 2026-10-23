import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { createDoublePressHandler } from '../core/double-press';
import { ProfileService, type ImportResolution, type Profile } from '../core/profile-service';
import { parseProfile, parseProfiles } from '../core/profile-codec';
import { TaskScheduler, type InputTarget, type KeyShortcut, type ScheduledTask } from '../core/task-scheduler';
import { registerControlShortcuts } from '../platform/global-shortcuts';
import { DesktopKeySender } from '../platform/key-sender';
import { notify } from '../platform/notifications';
import {
  accessibilityPermissionGranted,
  onTrayStop,
  openAccessibilitySettings,
  setTrayStatus
} from '../platform/app-lifecycle';
import { IntervalInput } from './IntervalInput';
import { captureForegroundTarget } from '../platform/target-window';

const noTasks: ScheduledTask[] = [];

function newTask(name: string, enabled = true): ScheduledTask {
  return { id: crypto.randomUUID(), name, shortcut: { key: 'A', modifiers: [] }, intervalMs: 1_000, enabled };
}

function defaultProfiles(): Profile[] {
  return [{ id: crypto.randomUUID(), name: '預設設定檔', tasks: [newTask('範例任務', false)], target: { mode: 'focused' } }];
}

function loadProfiles(): Profile[] {
  const saved = localStorage.getItem('key-pulse.profiles');
  if (saved) {
    try { return parseProfiles(saved); } catch { return defaultProfiles(); }
  }
  const legacyTasks = localStorage.getItem('key-pulse.tasks');
  if (legacyTasks) {
    try {
      const legacyProfile = parseProfile({
        id: crypto.randomUUID(),
        name: '預設設定檔',
        tasks: JSON.parse(legacyTasks),
        target: { mode: 'focused' }
      });
      return [legacyProfile];
    } catch { return defaultProfiles(); }
  }
  return defaultProfiles();
}

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>(loadProfiles);
  const [activeProfileId, setActiveProfileId] = useState(() => profiles[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<Profile | null>(null);
  const [accessibilityGranted, setAccessibilityGranted] = useState<boolean | null>(null);
  const [toggleShortcut, setToggleShortcut] = useState('F12');
  const [capturingTargetId, setCapturingTargetId] = useState<string | null>(null);
  const [message, setMessage] = useState('尚未執行。F12 可隨時啟動或停止。');
  const activeProfile = profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0];
  const targetByProfileId = useRef(new Map<string, InputTarget>(profiles.map((profile) => [profile.id, profile.target ?? { mode: 'focused' }])));
  const activeTarget = useMemo(
    () => targetByProfileId.current.get(activeProfile?.id ?? '') ?? activeProfile?.target ?? { mode: 'focused' as const },
    [activeProfile]
  );
  const tasks = activeProfile?.tasks ?? noTasks;
  const scheduler = useRef(new TaskScheduler(new DesktopKeySender(), (error, task) => {
    setRunning(false);
    void setTrayStatus(false);
    const reason = error instanceof Error ? error.message : String(error);
    setMessage(`任務「${task.name}」無法送出按鍵：${reason}`);
    void notify('KeyPulse 無法送出按鍵', `任務「${task.name}」失敗：${reason}`);
  }));
  const actions = useRef<{ toggle: () => void; stop: () => void }>({ toggle: () => {}, stop: () => {} });
  const localEscapeStop = useRef(createDoublePressHandler(() => actions.current.stop()));

  useEffect(() => { localStorage.setItem('key-pulse.profiles', JSON.stringify(profiles)); }, [profiles]);

  useEffect(() => {
    targetByProfileId.current = new Map(profiles.map((profile) => [profile.id, profile.target ?? { mode: 'focused' }]));
  }, [profiles]);

  useEffect(() => {
    const refreshPermission = () => void accessibilityPermissionGranted().then(setAccessibilityGranted);
    refreshPermission();
    window.addEventListener('focus', refreshPermission);
    return () => window.removeEventListener('focus', refreshPermission);
  }, []);

  const stop = useCallback(() => {
    scheduler.current.stop();
    setRunning(false);
    void setTrayStatus(false);
    setMessage('已停止所有任務。');
    void notify('KeyPulse 已停止', '所有鍵盤連點任務都已停止。');
  }, []);

  const start = useCallback(() => {
    try {
      if (capturingTargetId === activeProfile?.id) {
        setMessage('正在鎖定指定視窗，請完成後再啟動。');
        return;
      }
      if (accessibilityGranted === false) {
        setMessage('尚未取得 macOS「輔助使用」權限，請先開啟系統設定。');
        void notify('KeyPulse 需要輔助使用權限', '請在系統設定授予 KeyPulse 權限後再啟動。');
        return;
      }
      new ProfileService().validate({ id: 'current', name: '目前設定', tasks });
      scheduler.current.start(tasks.map((task) => ({ ...task, target: activeTarget })));
      setRunning(true);
      void setTrayStatus(true);
      setMessage('連點任務正在執行。快速連按兩次 Esc 可緊急停止。');
      void notify('KeyPulse 執行中', '連點任務正在執行。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '設定無法啟動。');
    }
  }, [accessibilityGranted, activeProfile?.id, activeTarget, capturingTargetId, tasks]);

  const toggle = useCallback(() => (running ? stop() : start()), [running, start, stop]);
  actions.current = { toggle, stop };

  useEffect(() => {
    let unregister: (() => Promise<void>) | undefined;
    void registerControlShortcuts(
      () => actions.current.toggle(),
      () => actions.current.stop(),
      (registration) => {
        const toggleHint = registration.toggleShortcut ?? 'F12 與 Ctrl + Shift + F12';
        const stopHint = registration.stopAvailable ? '' : '；雙擊 Esc 也無法使用';
        setMessage(`無法註冊 ${toggleHint} 全域熱鍵${stopHint}。請關閉佔用熱鍵的程式後重開 KeyPulse。`);
        void notify('KeyPulse 部分熱鍵不可用', `無法註冊 ${toggleHint}${stopHint}。`);
      }
    ).then((registration) => {
      unregister = registration.unregister;
      if (registration.toggleShortcut) setToggleShortcut(registration.toggleShortcut);
    });
    return () => { void unregister?.(); };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void onTrayStop(() => actions.current.stop()).then((cleanup) => { unlisten = cleanup; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (isTauri()) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'F12') { event.preventDefault(); actions.current.toggle(); }
      if (event.key === 'F1') localEscapeStop.current();
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const enabledCount = useMemo(() => tasks.filter((task) => task.enabled).length, [tasks]);
  const setTasks = useCallback((update: SetStateAction<ScheduledTask[]>) => {
    setProfiles((current) => current.map((profile) => {
      if (profile.id !== activeProfileId) return profile;
      const nextTasks = typeof update === 'function' ? update(profile.tasks) : update;
      return { ...profile, tasks: nextTasks };
    }));
  }, [activeProfileId]);

  function updateTask(id: string, update: Partial<ScheduledTask>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...update } : task)));
  }

  function updateProfileTarget(profileId: string, target: NonNullable<Profile['target']>) {
    targetByProfileId.current.set(profileId, target);
    setProfiles((current) => current.map((profile) => profile.id === profileId ? { ...profile, target } : profile));
  }

  function captureTarget() {
    const profileId = activeProfileId;
    setCapturingTargetId(profileId);
    setMessage('請在 3 秒內切換到要連點的目標視窗。');
    window.setTimeout(() => {
      void captureForegroundTarget().then((target) => {
        updateProfileTarget(profileId, target);
        setMessage(`已指定目標：「${target.title}」。`);
      }).catch(() => {
        setMessage('無法取得目標視窗。請確認 KeyPulse 已開啟並再試一次。');
      }).finally(() => setCapturingTargetId(null));
    }, 3_000);
  }

  async function testTarget(task: ScheduledTask) {
    try {
      await new DesktopKeySender().send({ ...task, target: activeTarget });
      const targetName = activeTarget.mode === 'window' ? activeTarget.title : '目前焦點';
      setMessage(`已送出測試按鍵到「${targetName}」。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '目標視窗未接受測試按鍵。');
    }
  }

  function captureShortcut(event: React.KeyboardEvent<HTMLButtonElement>, id: string) {
    if (recordingId !== id) return;
    event.preventDefault();
    event.stopPropagation();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
    updateTask(id, {
      shortcut: {
        key: event.key === ' ' ? 'Space' : event.key,
        modifiers: [
          ...(event.ctrlKey ? ['Control'] : []), ...(event.altKey ? ['Alt'] : []),
          ...(event.shiftKey ? ['Shift'] : []), ...(event.metaKey ? ['Meta'] : [])
        ]
      }
    });
    setRecordingId(null);
  }

  function addProfile() {
    const profile = { id: crypto.randomUUID(), name: `設定檔 ${profiles.length + 1}`, tasks: [newTask('新任務')], target: { mode: 'focused' as const } };
    setProfiles((current) => [...current, profile]);
    setActiveProfileId(profile.id);
    stop();
  }

  function exportProfile() {
    if (!activeProfile) return;
    const href = URL.createObjectURL(new Blob([JSON.stringify(activeProfile, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = href;
    link.download = `${activeProfile.name}.json`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function readImport(file: File | undefined) {
    if (!file) return;
    try {
      const profile = parseProfile(JSON.parse(await file.text()));
      new ProfileService().validate(profile);
      if (profiles.some((existing) => existing.name === profile.name)) { setPendingImport(profile); return; }
      setProfiles((current) => [...current, profile]);
      setActiveProfileId(profile.id);
      setMessage(`已匯入「${profile.name}」。`);
    } catch {
      setMessage('無法讀取設定檔。請選擇由 KeyPulse 匯出的 JSON 檔案。');
    }
  }

  function resolveImport(resolution: ImportResolution) {
    if (!pendingImport) return;
    const outcome = new ProfileService(profiles).import(pendingImport, resolution);
    if (outcome.type === 'imported') {
      setProfiles((current) => [...current, outcome.profile]);
      setActiveProfileId(outcome.profile.id);
    }
    if (outcome.type === 'replaced') {
      setProfiles((current) => current.map((profile) => (profile.name === outcome.profile.name ? outcome.profile : profile)));
      setActiveProfileId(outcome.profile.id);
    }
    setMessage(outcome.type === 'skipped' ? '已略過匯入。' : `已匯入「${outcome.profile.name}」。`);
    setPendingImport(null);
  }

  function moveTask(droppedOnId: string) {
    if (!draggedTaskId || draggedTaskId === droppedOnId) return;
    setTasks((current) => {
      const from = current.findIndex((task) => task.id === draggedTaskId);
      const to = current.findIndex((task) => task.id === droppedOnId);
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggedTaskId(null);
  }

  return (
    <main className="app-shell">
      <header>
        <div>
          <p className="eyebrow">KEYPULSE</p>
          <h1>鍵盤連點</h1>
          <p className="subtle">每個任務都有自己的按鍵與間隔，所有內容只保存於這台電腦。</p>
        </div>
        <button className={running ? 'stop-button' : 'start-button'} onClick={toggle}>{running ? `停止全部（${toggleShortcut}）` : `啟動全部（${toggleShortcut}）`}</button>
      </header>

      <section className="status" aria-live="polite"><strong>{running ? '執行中' : '已停止'}</strong><span>{message}</span></section>

      {accessibilityGranted === false && <section className="permission-card" aria-live="assertive">
        <strong>需要 macOS 輔助使用權限</strong>
        <span>KeyPulse 必須先取得此權限，才能將按鍵送到其他視窗。</span>
        <button className="secondary-button" onClick={() => void openAccessibilitySettings()}>開啟系統設定</button>
      </section>}

      <section className="profile-bar" aria-label="設定檔">
        <label>設定檔
          <select value={activeProfile?.id} onChange={(event) => { stop(); setActiveProfileId(event.target.value); }}>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
        <button className="secondary-button" onClick={addProfile}>新增設定檔</button>
        <button className="secondary-button" onClick={exportProfile}>匯出</button>
        <label className="secondary-button import-button">匯入
          <input accept="application/json" type="file" onChange={(event) => void readImport(event.target.files?.[0])} />
        </label>
      </section>

      <section className="target-panel" aria-label="所有任務的送鍵目標">
        <div><h2>所有任務的送鍵目標</h2><p>此設定檔中的全部任務都使用同一個目標。</p></div>
        <label>送鍵目標
          <select value={activeTarget.mode} onChange={(event) => event.target.value === 'window' ? captureTarget() : updateProfileTarget(activeProfileId, { mode: 'focused' })}>
            <option value="focused">目前焦點視窗</option>
            <option value="window">指定應用程式／視窗</option>
          </select>
        </label>
        {activeTarget.mode === 'window' && <div className="target-controls">
          <span title={activeTarget.title}>已鎖定：{activeTarget.title}</span>
          <button className="secondary-button" onClick={captureTarget} type="button">{capturingTargetId === activeProfileId ? '請切換視窗…' : '重新選取'}</button>
          <button className="secondary-button" onClick={() => void testTarget(tasks[0] ?? newTask('測試任務', false))} type="button">測試送鍵</button>
        </div>}
        {activeTarget.mode !== 'window' && <div className="target-controls">
          <button className="secondary-button" onClick={captureTarget} type="button">選取指定視窗</button>
          <button className="secondary-button" onClick={() => void testTarget(tasks[0] ?? newTask('測試任務', false))} type="button">測試目前焦點</button>
        </div>}
        <small>選取後有 3 秒可切到目標；Windows 會指定視窗，Mac 會指定應用程式。</small>
      </section>

      {pendingImport && <section className="import-conflict" aria-live="assertive">
        <strong>「{pendingImport.name}」已存在。</strong><span>請選擇要如何處理匯入的設定檔：</span>
        <div><button className="secondary-button" onClick={() => resolveImport('skip')}>略過</button><button className="secondary-button" onClick={() => resolveImport('copy')}>另存副本</button><button className="stop-button" onClick={() => resolveImport('replace')}>覆蓋現有設定檔</button></div>
      </section>}

      <section className="task-panel" aria-label="連點任務">
        <div className="panel-heading"><div><h2>連點任務</h2><p>{enabledCount} 個任務已啟用；可拖曳卡片調整順序。</p></div>
          <button className="secondary-button" onClick={() => setTasks((current) => [...current, newTask(`任務 ${current.length + 1}`)])}>＋ 新增任務</button>
        </div>
        <div className="task-list">
          {tasks.map((task) => <article className="task-card" draggable key={task.id} onDragOver={(event) => event.preventDefault()} onDragStart={() => setDraggedTaskId(task.id)} onDrop={() => moveTask(task.id)}>
            <span className="drag-handle" aria-label="拖曳以排序">⠿</span>
            <label>名稱<input value={task.name} onChange={(event) => updateTask(task.id, { name: event.target.value })} /></label>
            <label>要連點的按鍵
              <button className={recordingId === task.id ? 'key-button recording' : 'key-button'} onClick={() => setRecordingId(task.id)} onKeyDown={(event) => captureShortcut(event, task.id)}>{recordingId === task.id ? '現在按下按鍵…' : formatShortcut(task.shortcut)}</button>
              <small>點選後直接按鍵盤按鍵；這不是錄影。</small>
            </label>
            <label>間隔（秒）<IntervalInput intervalMs={task.intervalMs} onChange={(intervalMs) => updateTask(task.id, { intervalMs })} /></label>
            <label className="toggle-label"><input checked={task.enabled} type="checkbox" onChange={(event) => updateTask(task.id, { enabled: event.target.checked })} />啟用</label>
            <button className="remove-button" aria-label={`刪除 ${task.name}`} onClick={() => setTasks((current) => current.filter((item) => item.id !== task.id))}>刪除</button>
          </article>)}
        </div>
      </section>

      <aside className="help-card"><h2>使用提醒</h2><ul>
        <li>此設定檔的所有任務共用一個送鍵目標；選取指定視窗後，可在其他螢幕工作。部分程式可能拒絕背景按鍵。</li>
        <li>按 <kbd>{toggleShortcut}</kbd> 啟動或停止；0.5 秒內連按兩次 <kbd>F1</kbd> 可緊急停止。</li>
        <li>Mac 若 F12 是媒體鍵，請使用 <kbd>Fn</kbd> + <kbd>F12</kbd>。</li>
        <li>首次於 Mac 使用時，請依系統提示授予「輔助使用」權限。</li>
      </ul></aside>
    </main>
  );
}

function formatShortcut(shortcut: KeyShortcut): string {
  return [...shortcut.modifiers, shortcut.key].join(' + ');
}
