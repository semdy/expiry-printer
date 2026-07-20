import NativeBridge from './nativeBridge';

export type NativeBluetoothDevice = {
  id: string;
  name: string;
  rssi?: number;
};

export const NativeBluetoothPrinter = {
  scan(options: { serviceUuids: string[]; timeoutMs?: number }) {
    return NativeBridge.call<{ devices: NativeBluetoothDevice[] }>('bluetooth.scan', options);
  },
  connect(options: { deviceId: string; serviceUuids: string[] }) {
    return NativeBridge.call<{ id: string; name: string }>('bluetooth.connect', options);
  },
  write(options: { data: string }) {
    return NativeBridge.call<void>('bluetooth.write', options);
  },
  disconnect() {
    return NativeBridge.call<void>('bluetooth.disconnect');
  }
};

export function hasNativeBluetoothPrinter() {
  return NativeBridge.isAvailable();
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}
