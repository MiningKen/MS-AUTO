import { describe, expect, it, vi } from 'vitest';
import { createDoublePressHandler } from '../src/core/double-press';

describe('createDoublePressHandler', () => {
  it('only invokes the action after two presses within its time window', () => {
    const onDoublePress = vi.fn();
    let time = 1_000;
    const press = createDoublePressHandler(onDoublePress, 500, () => time);

    expect(press()).toBe(false);
    time += 400;
    expect(press()).toBe(true);
    expect(onDoublePress).toHaveBeenCalledTimes(1);
  });

  it('does not combine presses that are too far apart', () => {
    const onDoublePress = vi.fn();
    let time = 1_000;
    const press = createDoublePressHandler(onDoublePress, 500, () => time);

    press();
    time += 501;
    expect(press()).toBe(false);
    expect(onDoublePress).not.toHaveBeenCalled();
  });
});
