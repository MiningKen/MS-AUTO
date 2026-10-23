export type KeyShortcut = {
  key: string;
  modifiers: string[];
};

export type InputTarget =
  | { mode: 'focused' }
  | {
    mode: 'window';
    id: string;
    title: string;
    processId: number;
    platform: 'windows' | 'macos';
  };

export type ScheduledTask = {
  id: string;
  name: string;
  shortcut: KeyShortcut;
  intervalMs: number;
  enabled: boolean;
  target?: InputTarget;
};

export interface KeySender {
  send(task: ScheduledTask): void | Promise<void>;
}

export class TaskScheduler {
  private timers: ReturnType<typeof setInterval>[] = [];

  private running = false;

  constructor(
    private readonly sender: KeySender,
    private readonly onSendError: (error: unknown, task: ScheduledTask) => void = console.error
  ) {}

  start(tasks: ScheduledTask[]): void {
    this.stop();
    this.running = true;

    for (const task of tasks) {
      if (!task.enabled) {
        continue;
      }

      this.timers.push(
        setInterval(() => {
          this.send(task);
        }, task.intervalMs)
      );
    }
  }

  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private send(task: ScheduledTask): void {
    try {
      void Promise.resolve(this.sender.send(task)).catch((error: unknown) => {
        this.stop();
        this.onSendError(error, task);
      });
    } catch (error) {
      this.stop();
      this.onSendError(error, task);
    }
  }
}
