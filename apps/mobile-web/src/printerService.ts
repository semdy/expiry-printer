import cp936Table from 'iconv-lite/encodings/tables/cp936.json';
import gbkAddedTable from 'iconv-lite/encodings/tables/gbk-added.json';
import { bytesToBase64, NativeBluetoothPrinter } from './bluetoothPrinter';
import { locale } from './locales';
import type {
  BluetoothPrinterConnection,
  BluetoothPrinterDevice,
  LabelPayload,
  WritableBluetoothCharacteristic
} from './types';

export const bluetoothServiceUuids = [
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae3a-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '000018f0-0000-1000-8000-00805f9b34fb'
];

const gbkEncodeMap = buildGbkEncodeMap();

export async function requestBluetoothPrinter(): Promise<BluetoothPrinterConnection> {
  const bluetooth = (
    navigator as Navigator & {
      bluetooth: {
        requestDevice: (options: {
          acceptAllDevices: boolean;
          optionalServices: string[];
        }) => Promise<BluetoothPrinterDevice>;
      };
    }
  ).bluetooth;

  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: bluetoothServiceUuids
  });
  return connectBluetoothDevice(device);
}

export async function reconnectBluetoothPrinter(recentName: string): Promise<BluetoothPrinterConnection> {
  const bluetooth = (
    navigator as Navigator & {
      bluetooth: {
        getDevices?: () => Promise<BluetoothPrinterDevice[]>;
      };
    }
  ).bluetooth;

  if (!bluetooth.getDevices) throw new Error('当前浏览器不支持快速连接，请重新搜索打印机');
  const devices = await bluetooth.getDevices();
  const device = devices.find((item) => item.name === recentName) || devices[0];
  if (!device) throw new Error('没有可快速连接的蓝牙打印机，请重新搜索');
  return connectBluetoothDevice(device);
}

async function connectBluetoothDevice(device: BluetoothPrinterDevice): Promise<BluetoothPrinterConnection> {
  const server = await device.gatt?.connect();
  if (!server) throw new Error('无法连接蓝牙打印机');

  for (const serviceUuid of bluetoothServiceUuids) {
    try {
      const service = await server.getPrimaryService(serviceUuid);
      const characteristics = await service.getCharacteristics();
      const characteristic = characteristics.find(
        (item) => item.properties.writeWithoutResponse || item.properties.write
      );
      if (characteristic) {
        return {
          kind: 'web',
          name: device.name || '蓝牙打印机',
          device,
          characteristic
        };
      }
    } catch {
      // Some printers expose only one of the common services; keep scanning.
    }
  }

  throw new Error('未找到可写入的蓝牙打印服务');
}

export async function printLabelsViaBluetooth(labels: LabelPayload[], connection: BluetoothPrinterConnection) {
  const flattened = labels.flatMap((label) => Array.from({ length: label.copies || 1 }, () => label));

  for (const label of flattened) {
    const command = buildTsplLabelCommand(label);
    if (connection.kind === 'native') {
      await NativeBluetoothPrinter.write({ data: bytesToBase64(command) });
    } else {
      await writeBluetoothChunks(connection.characteristic, command);
    }
  }
}

async function writeBluetoothChunks(characteristic: WritableBluetoothCharacteristic, bytes: Uint8Array) {
  const chunkSize = 180;
  for (let start = 0; start < bytes.length; start += chunkSize) {
    const chunk = bytes.slice(start, start + chunkSize);
    if (characteristic.properties.write && characteristic.writeValue) {
      await characteristic.writeValue(chunk);
    } else if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
  }
}

function buildTsplLabelCommand(label: LabelPayload) {
  return encodeGbk(
    [
      'SIZE 55 mm,30 mm',
      'GAP 2 mm,0 mm',
      'DIRECTION 0',
      'REFERENCE 0,0',
      'CODEPAGE 936',
      'CLS',
      tsplText(18, 24, `物料名称：${label.materialName}`),
      tsplText(18, 72, `物料类型：${label.materialType}`),
      tsplText(18, 134, `打印时间：${formatFullLabelDate(label.printedAt)}`),
      tsplText(18, 184, `到期时间：${formatFullLabelDate(label.expiresAt)}`),
      'PRINT 1,1',
      ''
    ].join('\r\n')
  );
}

function tsplText(x: number, y: number, text: string) {
  return `TEXT ${x},${y},"TSS24.BF2",0,1,1,"${escapeTsplText(text)}"`;
}

function escapeTsplText(value: string) {
  return value.replace(/["\\]/g, ' ');
}

function encodeGbk(value: string) {
  const bytes: number[] = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0) || 0;
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
      continue;
    }

    const gbkCode = gbkEncodeMap.get(char);
    if (!gbkCode) {
      bytes.push(0x3f);
      continue;
    }

    if (gbkCode <= 0xff) {
      bytes.push(gbkCode);
    } else {
      bytes.push((gbkCode >> 8) & 0xff, gbkCode & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function buildGbkEncodeMap() {
  const map = new Map<string, number>();
  const tables = [...cp936Table, ...gbkAddedTable] as Array<Array<string | number>>;

  for (const chunk of tables) {
    let gbkCode = Number.parseInt(String(chunk[0]), 16);
    let previousCodePoint = 0;

    for (const part of chunk.slice(1)) {
      if (typeof part === 'string') {
        for (const char of part) {
          map.set(char, gbkCode);
          previousCodePoint = char.codePointAt(0) || previousCodePoint;
          gbkCode += 1;
        }
      } else {
        for (let index = 0; index < part; index += 1) {
          previousCodePoint += 1;
          map.set(String.fromCodePoint(previousCodePoint), gbkCode);
          gbkCode += 1;
        }
      }
    }
  }

  return map;
}

export function formatFullLabelDate(value: string, language = locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  };

  try {
    return new Intl.DateTimeFormat(language, options).format(date);
  } catch {
    return new Intl.DateTimeFormat('zh-CN', options).format(date);
  }
}
