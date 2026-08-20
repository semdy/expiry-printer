import { Badge, Button, Popup, SearchBar } from 'antd-mobile';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { hasNativeBluetoothPrinter, NativeBluetoothPrinter, type NativeBluetoothDevice } from '@/bluetoothPrinter';
import NativeBridge from '@/nativeBridge';
import {
  bluetoothServiceUuids,
  printLabelsViaBluetooth,
  reconnectBluetoothPrinter,
  requestBluetoothPrinter
} from '@/printerService';
import type { BluetoothPrinterConnection, PrinterController, ShowNotice } from '@/types';

const printerStorageKey = 'expiry-label-printer-name';
const printerIdStorageKey = 'expiry-label-printer-id';

type Props = {
  showNotice: ShowNotice;
  onConnectionRequired: () => void;
};

const PrinterSettingsTab = forwardRef<PrinterController, Props>(function PrinterSettingsTab(
  { showNotice, onConnectionRequired },
  ref
) {
  const [printerName, setPrinterName] = useState('');
  const [recentPrinterName, setRecentPrinterName] = useState(() => localStorage.getItem(printerStorageKey) || '');
  const [recentPrinterId, setRecentPrinterId] = useState(() => localStorage.getItem(printerIdStorageKey) || '');
  const [devices, setDevices] = useState<NativeBluetoothDevice[]>([]);
  const [deviceKeyword, setDeviceKeyword] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('未连接');
  const connection = useRef<BluetoothPrinterConnection | null>(null);
  const scanActive = useRef(false);
  const filteredDevices = useMemo(() => {
    const keyword = deviceKeyword.trim().toLocaleLowerCase();
    return keyword ? devices.filter((device) => device.name.toLocaleLowerCase().includes(keyword)) : devices;
  }, [devices, deviceKeyword]);

  useImperativeHandle(ref, () => ({
    async printLabels(labels) {
      if (!connection.current || !connected) {
        showNotice('打印机未连接', 'warning');
        onConnectionRequired();
        return false;
      }
      try {
        await printLabelsViaBluetooth(labels, connection.current);
        return true;
      } catch (error) {
        console.error(error);
        connection.current = null;
        setConnected(false);
        setStatus('发送失败');
        showNotice('蓝牙发送失败，请重新连接打印机', 'warning');
        onConnectionRequired();
        return false;
      }
    }
  }), [connected, onConnectionRequired, showNotice]);

  useEffect(() => {
    if (!hasNativeBluetoothPrinter()) return;
    const removeRestoring = NativeBridge.on<NativeBluetoothDevice>('bluetooth.restoring', (device) => {
      setPrinterName(device.name);
      setStatus('正在恢复连接');
    });
    const removeRestored = NativeBridge.on<NativeBluetoothDevice>('bluetooth.restored', (device) => {
      connection.current = { kind: 'native', name: device.name, deviceId: device.id };
      saveRecentDevice(device);
      setConnected(true);
      setStatus('已连接');
    });
    const removeRestoreFailed = NativeBridge.on<{ error?: string }>('bluetooth.restoreFailed', (data) => {
      connection.current = null;
      setConnected(false);
      setStatus(data.error || '恢复连接失败');
    });
    const removeDisconnected = NativeBridge.on('bluetooth.disconnected', () => {
      connection.current = null;
      setConnected(false);
      setStatus('连接已断开');
    });
    const removeDeviceDiscovered = NativeBridge.on<NativeBluetoothDevice>('bluetooth.deviceDiscovered', (device) => {
      if (!scanActive.current) return;
      setDevices((current) => {
        const exists = current.some((item) => item.id === device.id);
        return exists ? current.map((item) => item.id === device.id ? device : item) : [...current, device];
      });
      setStatus('发现设备，仍在搜索');
    });
    NativeBridge.emit('pageReady');
    return () => {
      removeRestoring();
      removeRestored();
      removeRestoreFailed();
      removeDisconnected();
      removeDeviceDiscovered();
    };
  }, []);

  function saveRecentDevice(device: NativeBluetoothDevice) {
    setPrinterName(device.name);
    setRecentPrinterName(device.name);
    setRecentPrinterId(device.id);
    localStorage.setItem(printerStorageKey, device.name);
    localStorage.setItem(printerIdStorageKey, device.id);
  }

  async function connect() {
    if (hasNativeBluetoothPrinter()) {
      scanActive.current = true;
      setDevices([]);
      setDeviceKeyword('');
      setPickerOpen(true);
      try {
        setStatus('搜索中');
        const result = await NativeBluetoothPrinter.scan({ serviceUuids: bluetoothServiceUuids, timeoutMs: 5000 });
        if (!scanActive.current) return;
        scanActive.current = false;
        if (!result.devices.length) throw new Error('未搜索到蓝牙设备，请确认打印机已开机');
        setDevices(result.devices);
        setStatus(t('发现 {count} 台设备', { count: result.devices.length }));
      } catch (error) {
        scanActive.current = false;
        setPickerOpen(false);
        setStatus('搜索失败');
        showNotice(error instanceof Error ? error.message : '蓝牙设备搜索失败', 'warning');
      }
      return;
    }
    if (!('bluetooth' in navigator)) {
      setStatus('浏览器不支持');
      showNotice('当前浏览器不支持蓝牙直连', 'warning');
      return;
    }
    try {
      setStatus('搜索中');
      const next = await requestBluetoothPrinter();
      connection.current = next;
      setPrinterName(next.name);
      setRecentPrinterName(next.name);
      setConnected(true);
      setStatus('已连接');
      localStorage.setItem(printerStorageKey, next.name);
      showNotice(t('已连接蓝牙打印机：{name}', { name: next.name }));
    } catch (error) {
      setStatus('连接失败');
      showNotice(error instanceof Error ? error.message : '蓝牙打印机连接失败', 'warning');
    }
  }

  async function connectNativeDevice(device: NativeBluetoothDevice) {
    scanActive.current = false;
    setPickerOpen(false);
    setStatus('连接中');
    try {
      const next = await NativeBluetoothPrinter.connect({ deviceId: device.id, serviceUuids: bluetoothServiceUuids });
      connection.current = { kind: 'native', name: next.name, deviceId: next.id };
      saveRecentDevice(next);
      setConnected(true);
      setStatus('已连接');
      showNotice(t('已连接蓝牙打印机：{name}', { name: next.name }));
    } catch (error) {
      setConnected(false);
      setStatus('连接失败');
      showNotice(error instanceof Error ? error.message : '蓝牙打印机连接失败', 'warning');
    }
  }

  async function quickConnect() {
    if (hasNativeBluetoothPrinter()) {
      if (!recentPrinterId) {
        showNotice('没有可快速连接的蓝牙打印机，请重新搜索', 'warning');
        return;
      }
      await connectNativeDevice({ id: recentPrinterId, name: recentPrinterName || '蓝牙打印机' });
      return;
    }
    if (!('bluetooth' in navigator)) {
      setStatus('浏览器不支持');
      showNotice('当前浏览器不支持蓝牙直连', 'warning');
      return;
    }
    try {
      setStatus('连接中');
      const next = await reconnectBluetoothPrinter(recentPrinterName);
      connection.current = next;
      setPrinterName(next.name);
      setRecentPrinterName(next.name);
      setConnected(true);
      setStatus('已连接');
      localStorage.setItem(printerStorageKey, next.name);
      showNotice(t('已连接蓝牙打印机：{name}', { name: next.name }));
    } catch (error) {
      setStatus('快速连接失败');
      showNotice(error instanceof Error ? error.message : '快速连接失败，请重新搜索打印机', 'warning');
    }
  }

  async function disconnect() {
    const current = connection.current;
    if (!current) {
      setConnected(false);
      setStatus('未连接');
      return;
    }
    try {
      setStatus('断开中');
      if (current.kind === 'native') await NativeBluetoothPrinter.disconnect();
      else current.device.gatt?.disconnect?.();
      connection.current = null;
      setPrinterName('');
      setConnected(false);
      setStatus('未连接');
      showNotice('已断开蓝牙打印机');
    } catch (error) {
      setStatus('断开失败');
      showNotice(error instanceof Error ? error.message : '断开蓝牙打印机失败', 'warning');
    }
  }

  return (
    <>
      <div className="printer-settings">
        <section className="panel printer-panel">
          <div className="printer-section-title">当前连接设备</div>
          <div className="printer-row">
            <div><strong>{connected ? printerName : '未连接'}</strong><div className="material-desc">55mm × 30mm 标签纸，蓝牙直连打印</div></div>
            <Badge content={connected ? '已连接' : '未连接'} color={connected ? '#16a34a' : '#d46b08'} />
          </div>
          <div className="printer-section-title">最近连接设备</div>
          <div className="printer-row">
            <div><strong>{recentPrinterName || '暂无最近设备'}</strong><div className="material-desc">已授权设备可尝试快速连接</div></div>
            <Button size="small" color={connected ? 'danger' : 'default'} disabled={!connected && !recentPrinterName} onClick={() => void (connected ? disconnect() : quickConnect())}>
              {connected ? '断开连接' : '快速连接'}
            </Button>
          </div>
          <div className="printer-form">
            <Button color="primary" block onClick={() => void connect()}>搜索并连接蓝牙打印机</Button>
            <div className="bluetooth-status" onClick={() => devices.length > 0 && setPickerOpen(true)}>
              <span>蓝牙连接状态</span><strong>{connected ? '已连接' : status}</strong>
            </div>
          </div>
          <div className="printer-tip">标签只通过已连接的蓝牙打印机输出。未连接时点击打印会自动进入本页。</div>
        </section>
      </div>
      <Popup visible={pickerOpen} onMaskClick={() => setPickerOpen(false)} bodyStyle={{ height: '95%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
        <div className="device-picker">
          <h3>选择蓝牙打印机</h3>
          <SearchBar className="device-picker-search" value={deviceKeyword} onChange={setDeviceKeyword} placeholder="按蓝牙名称搜索" />
          <div className="device-picker-content">
            {filteredDevices.length > 0 ? filteredDevices.map((device) => (
              <button key={device.id} className="device-picker-item" onClick={() => void connectNativeDevice(device)}>
                <strong>{device.name}</strong>
                <span>{typeof device.rssi === 'number' ? t('信号 {rssi} dBm', { rssi: device.rssi }) : device.id}</span>
              </button>
            )) : <div>{devices.length > 0 ? '没有匹配的蓝牙设备' : '正在搜索附近的蓝牙设备…'}</div>}
          </div>
          <Button block onClick={() => setPickerOpen(false)}>取消</Button>
        </div>
      </Popup>
    </>
  );
});

export default PrinterSettingsTab;
