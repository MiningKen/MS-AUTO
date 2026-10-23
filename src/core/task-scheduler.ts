export type KeyShortcut = {
  key: string;
  modifiers: string[];
};

export type ScheduledTask = {
  id: string;
  name: string;
  shortcut: KeyShortcut;
  intervalMs: number;
  randomIntervalMs?: { min: number; max: number };
  enabled: boolean;
};

export interface KeySender {
  send(task: ScheduledTask): void | Promise<void>;
}

export class TaskScheduler {
  private timers = new Set<ReturnType<typeof setTimeout>>();

  private running = false;

  constructor(
    private readonly sender: KeySender,
    private readonly onSendError: (error: unknown, task: ScheduledTask) => void = console.error,
    private readonly random: () => number = Math.random
  ) {}

  start(tasks: ScheduledTask[]): void {
    this.stop();
    this.running = true;

    for (const task of tasks) {
      if (!task.enabled) {
        continue;
      }

      this.schedule(task);
    }
  }

  stop(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
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

  private schedule(task: ScheduledTask): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.running) return;
      this.send(task);
      if (this.running) this.schedule(task);
    }, this.nextDelay(task));
    this.timers.add(timer);
  }

  private nextDelay(task: ScheduledTask): number {
    if (!task.randomIntervalMs) return task.intervalMs;
    const { min, max } = task.randomIntervalMs;
    return Math.round(min + (max - min) * this.random());
  }
}
