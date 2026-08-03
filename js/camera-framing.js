export const BOARD_BASE_SIZE = 8.2;

export const CAMERA_POSITION = Object.freeze({ x: 7.8, y: 9.2, z: 8.8 });
export const CAMERA_TARGET = Object.freeze({ x: 0, y: 0.5, z: 0 });

const PORTRAIT_VIEW_HEIGHT = 9.2;
const WIDE_VIEW_HEIGHT = 8.2;
const PORTRAIT_ASPECT_LIMIT = 0.9;
const HORIZONTAL_MARGIN = 0.25;

export function getProjectedBoardWidth() {
  const cameraOffsetX = CAMERA_POSITION.x - CAMERA_TARGET.x;
  const cameraOffsetZ = CAMERA_POSITION.z - CAMERA_TARGET.z;
  const horizontalDistance = Math.hypot(cameraOffsetX, cameraOffsetZ);

  return BOARD_BASE_SIZE
    * (Math.abs(cameraOffsetX) + Math.abs(cameraOffsetZ))
    / horizontalDistance;
}

export const MIN_BOARD_VIEW_WIDTH = getProjectedBoardWidth() + HORIZONTAL_MARGIN * 2;

export function calculateCameraFrustum(width, height) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const aspect = safeWidth / safeHeight;
  const preferredViewHeight = aspect < PORTRAIT_ASPECT_LIMIT
    ? PORTRAIT_VIEW_HEIGHT
    : WIDE_VIEW_HEIGHT;
  const viewHeight = Math.max(preferredViewHeight, MIN_BOARD_VIEW_WIDTH / aspect);
  const viewWidth = viewHeight * aspect;

  return {
    aspect,
    viewWidth,
    viewHeight,
    left: -viewWidth / 2,
    right: viewWidth / 2,
    top: viewHeight / 2,
    bottom: -viewHeight / 2
  };
}
