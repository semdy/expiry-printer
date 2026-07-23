type BridgeCallback = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
};

type BridgeMessage =
  | { type: 'callback'; callbackId: number; success: boolean; data?: unknown; error?: string }
  | { type: 'event'; event: string; data?: unknown };

type EventListener = (data: unknown) => void;

declare global {
  interface Window {
    NativeBridgeAndroid?: { postMessage: (message: string) => void };
    webkit?: { messageHandlers?: { NativeBridge?: { postMessage: (message: unknown) => void } } };
    __nativeReceive?: (message: BridgeMessage | string) => void;
  }
}

class Bridge {
  private callbacks = new Map<number, BridgeCallback>();
  private events = new Map<string, Set<EventListener>>();
  private callbackId = 1;

  constructor() {
    // Native 调用这里
    window.__nativeReceive = (message) => this.handleMessage(message);
  }

  isAvailable() {
    return Boolean(window.NativeBridgeAndroid || window.webkit?.messageHandlers?.NativeBridge);
  }

  // 调用原生方法
  call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.isAvailable()) return Promise.reject(new Error('Native Bridge Not Found'));

    return new Promise<T>((resolve, reject) => {
      const callbackId = this.callbackId++;
      const timer = window.setTimeout(() => {
        this.callbacks.delete(callbackId);
        reject(new Error(`原生方法调用超时：${method}`));
      }, 30000);

      this.callbacks.set(callbackId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer
      });
      this.send({ type: 'call', method, params, callbackId });
    });
  }

  // 通知原生（无需返回）
  emit(event: string, data: Record<string, unknown> = {}) {
    this.send({ type: 'event', event, data });
  }

  // 监听原生事件
  on<T = unknown>(event: string, callback: (data: T) => void) {
    const listeners = this.events.get(event) ?? new Set<EventListener>();
    listeners.add(callback as EventListener);
    this.events.set(event, listeners);
    return () => this.off(event, callback);
  }

  off<T = unknown>(event: string, callback: (data: T) => void) {
    const listeners = this.events.get(event);
    listeners?.delete(callback as EventListener);
    if (listeners?.size === 0) this.events.delete(event);
  }

  // Native -> JS
  private handleMessage(message: BridgeMessage | string) {
    try {
      const parsed = typeof message === 'string' ? (JSON.parse(message) as BridgeMessage) : message;

      // 方法返回
      if (parsed.type === 'callback') {
        const callback = this.callbacks.get(parsed.callbackId);
        if (!callback) return;

        window.clearTimeout(callback.timer);
        this.callbacks.delete(parsed.callbackId);

        if (parsed.success) {
          callback.resolve(parsed.data);
        } else {
          callback.reject(new Error(parsed.error || '原生调用失败'));
        }
        return;
      }

      // 原生主动发事件
      if (parsed.type === 'event') {
        const listeners = this.events.get(parsed.event);
        listeners?.forEach((listener) => listener(parsed.data));
        return;
      }

      console.warn('Unknown Native Bridge message', parsed);
    } catch (error) {
      console.error('Native Bridge message error', error);
    }
  }

  private send(message: Record<string, unknown>) {
    const iosBridge = window.webkit?.messageHandlers?.NativeBridge;
    if (iosBridge) {
      iosBridge.postMessage(message);
      return;
    }
    window.NativeBridgeAndroid?.postMessage(JSON.stringify(message));
  }
}

const NativeBridge = new Bridge();

export default NativeBridge;
