export function createDoublePressHandler(
  onDoublePress: () => void,
  intervalMs = 500,
  now: () => number = Date.now
): () => boolean {
  let previousPressAt: number | undefined;

  return () => {
    const pressedAt = now();
    const isDoublePress = previousPressAt !== undefined
      && pressedAt >= previousPressAt
      && pressedAt - previousPressAt <= intervalMs;

    previousPressAt = isDoublePress ? undefined : pressedAt;
    if (isDoublePress) onDoublePress();
    return isDoublePress;
  };
}
