export class EventEmitter {
  constructor() {
    this._listeners = {};
  }

  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    const arr = this._listeners[event];
    if (arr) this._listeners[event] = arr.filter((f) => f !== fn);
  }

  emit(event, payload) {
    const arr = this._listeners[event];
    if (arr) arr.forEach((fn) => fn(payload));
  }

  removeAllListeners() {
    this._listeners = {};
  }
}
