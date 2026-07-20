import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeBluetoothDevice = {
  id: string;
  name: string;
  rssi?: number;
};

type BluetoothPrinterPlugin = {
  scan(options: { serviceUuids: string[]; timeoutMs?: number }): Promise<{ devices: NativeBluetoothDevice[] }>;
  connect(options: { deviceId: string; serviceUuids: string[] }): Promise<{ id: string; name: string }>;
  write(options: { data: string }): Promise<void>;
  disconnect(): Promise<void>;
};

export const NativeBluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>('BluetoothPrinter');

export function hasNativeBluetoothPrinter() {
  return Capacitor.isNativePlatform();
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return window.btoa(binary);
}
