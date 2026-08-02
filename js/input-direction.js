export const DEFAULT_SWIPE_DISTANCE = 24;
export const DEFAULT_DIAGONAL_RATIO = 0.3;

export function directionFromDiagonalSwipe(
  deltaX,
  deltaY,
  {
    minimumDistance = DEFAULT_SWIPE_DISTANCE,
    minimumDiagonalRatio = DEFAULT_DIAGONAL_RATIO
  } = {}
) {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return null;

  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);
  if (Math.hypot(deltaX, deltaY) < minimumDistance) return null;

  const longerComponent = Math.max(absoluteX, absoluteY);
  const shorterComponent = Math.min(absoluteX, absoluteY);
  if (
    longerComponent === 0
    || shorterComponent / longerComponent < minimumDiagonalRatio
  ) return null;

  if (deltaX > 0 && deltaY < 0) return 'up';
  if (deltaX > 0 && deltaY > 0) return 'right';
  if (deltaX < 0 && deltaY > 0) return 'down';
  if (deltaX < 0 && deltaY < 0) return 'left';
  return null;
}
