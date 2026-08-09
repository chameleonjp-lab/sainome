export const WEBGL2_CONTEXT_NAME = 'webgl2';

export const WEBGL_SUPPORT_REASONS = Object.freeze({
  AVAILABLE: 'available',
  DOCUMENT_UNAVAILABLE: 'document-unavailable',
  CANVAS_UNAVAILABLE: 'canvas-unavailable',
  CONTEXT_UNAVAILABLE: 'context-unavailable',
  CONTEXT_ERROR: 'context-error'
});

function createResult(available, reason) {
  return Object.freeze({ available, reason });
}

export function checkWebGL2Support({
  documentObject = globalThis.document,
  contextName = WEBGL2_CONTEXT_NAME
} = {}) {
  if (typeof documentObject?.createElement !== 'function') {
    return createResult(false, WEBGL_SUPPORT_REASONS.DOCUMENT_UNAVAILABLE);
  }

  let canvas;
  try {
    canvas = documentObject.createElement('canvas');
  } catch {
    return createResult(false, WEBGL_SUPPORT_REASONS.CANVAS_UNAVAILABLE);
  }

  if (typeof canvas?.getContext !== 'function') {
    return createResult(false, WEBGL_SUPPORT_REASONS.CANVAS_UNAVAILABLE);
  }

  try {
    const context = canvas.getContext(contextName);
    return context
      ? createResult(true, WEBGL_SUPPORT_REASONS.AVAILABLE)
      : createResult(false, WEBGL_SUPPORT_REASONS.CONTEXT_UNAVAILABLE);
  } catch {
    return createResult(false, WEBGL_SUPPORT_REASONS.CONTEXT_ERROR);
  }
}
