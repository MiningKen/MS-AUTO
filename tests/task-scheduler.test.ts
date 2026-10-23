import { describe, expect, it, vi } from 'vitest';
import { TaskScheduler, type KeySender } from '../src/core/task-scheduler';

const task = {
  id: 'paste',
  name: 'Paste value',
  shortcut: { key: 'V', modifiers: ['Control'] },
  intervalMs: 500,
  enabled: true
};

describe('TaskScheduler', () => {
  it('sends each enabled task on its own interval and stops cleanly', () => {
    vi.useFakeTimers();
    const sender: KeySender = { send: vi.fn() };
    const scheduler = new TaskScheduler(sender);

    scheduler.start([task]);
    vi.advanceTimersByTime(1_000);
    scheduler.stop();
    vi.advanceTimersByTime(1_000);

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenNthCalledWith(1, task);
    expect(scheduler.isRunning()).toBe(false);
  });

  it('restarts without leaving duplicate timers running', () => {
    vi.useFakeTimers();
    const sender: KeySender = { send: vi.fn() };
    const scheduler = new TaskScheduler(sender);

    scheduler.start([task]);
    scheduler.start([task]);
    vi.advanceTimersByTime(500);

    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it('uses a new random delay within the configured range for every send', () => {
    vi.useFakeTimers();
    const sender: KeySender = { send: vi.fn() };
    const scheduler = new TaskScheduler(sender, console.error, () => 0.5);
    const randomTask = { ...task, randomIntervalMs: { min: 500, max: 1_000 } };

    scheduler.start([randomTask]);
    vi.advanceTimersByTime(749);
    expect(sender.send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sender.send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(750);
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it('stops every task if the platform cannot send a key', async () => {
    vi.useFakeTimers();
    const sender: KeySender = { send: vi.fn(() => { throw new Error('permission denied'); }) };
    const onSendError = vi.fn();
    const scheduler = new TaskScheduler(sender, onSendError);

    scheduler.start([task]);
    await vi.advanceTimersByTimeAsync(500);

    expect(scheduler.isRunning()).toBe(false);
    expect(onSendError).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission denied' }), task);
  });
});
