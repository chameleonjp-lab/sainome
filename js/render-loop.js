export class RenderLoopController {
  constructor({ requestFrame, cancelFrame, shouldRun, onFrame }) {
    if (typeof requestFrame !== 'function') {
      throw new TypeError('requestFrame must be a function');
    }
    if (typeof cancelFrame !== 'function') {
      throw new TypeError('cancelFrame must be a function');
    }
    if (typeof shouldRun !== 'function') {
      throw new TypeError('shouldRun must be a function');
    }
    if (typeof onFrame !== 'function') {
      throw new TypeError('onFrame must be a function');
    }

    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
    this.shouldRun = shouldRun;
    this.onFrame = onFrame;
    this.enabled = false;
    this.frameId = null;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.refresh();
  }

  refresh() {
    if (!this.enabled || !this.shouldRun()) {
      this.cancel();
      return;
    }
    if (this.frameId !== null) return;

    this.frameId = this.requestFrame(() => {
      this.frameId = null;
      if (!this.enabled || !this.shouldRun()) return;
      this.onFrame();
      this.refresh();
    });
  }

  cancel() {
    if (this.frameId === null) return;
    this.cancelFrame(this.frameId);
    this.frameId = null;
  }

  getSnapshot() {
    return Object.freeze({
      enabled: this.enabled,
      scheduled: this.frameId !== null
    });
  }
}
