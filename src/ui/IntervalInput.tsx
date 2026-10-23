import { useEffect, useState } from 'react';

interface IntervalInputProps {
  intervalMs: number;
  onChange: (intervalMs: number) => void;
}

function secondsFromMs(intervalMs: number): string {
  return String(intervalMs / 1_000);
}

export function IntervalInput({ intervalMs, onChange }: IntervalInputProps) {
  const [value, setValue] = useState(() => secondsFromMs(intervalMs));

  useEffect(() => {
    setValue(secondsFromMs(intervalMs));
  }, [intervalMs]);

  const updateInterval = (nextValue: string) => {
    const seconds = Number(nextValue);
    if (nextValue !== '' && Number.isFinite(seconds) && seconds >= 0.1) {
      onChange(Math.round(seconds * 1_000));
    }
  };

  return <input
    inputMode="decimal"
    min="0.1"
    step="0.1"
    type="number"
    value={value}
    onBlur={() => {
      const seconds = Number(value);
      if (value === '' || !Number.isFinite(seconds) || seconds < 0.1) {
        setValue(secondsFromMs(intervalMs));
      }
    }}
    onChange={(event) => {
      const nextValue = event.target.value;
      setValue(nextValue);
      updateInterval(nextValue);
    }}
  />;
}
