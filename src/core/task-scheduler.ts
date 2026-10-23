export type KeyShortcut = {
  key: string;
  modifiers: string[];
};

export type ScheduledTask = {
  id: string;
  name: string;
  shortcut: KeyShortcut;
  intervalMs: number;
  enabled: boolean;
};

export interface KeySender {
  send(shortcut: KeyShortcut): void | Promise<void>;
}

export class TaskScheduler {
  private timers: ReturnType<typeof setInterval>[] = [];

  private running = false;

  constructor(
    private readonly sender: KeySender,
    private readonly onSendError: (error: unknown) => void = console.error
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
          this.send(task.shortcut);
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

  private send(shortcut: KeyShortcut): void {
    try {
      void Promise.resolve(this.sender.send(shortcut)).catch((error: unknown) => {
        this.stop();
        this.onSendError(error);
      });
    } catch (error) {
      this.stop();
      this.onSendError(error);
    }
  }
}
