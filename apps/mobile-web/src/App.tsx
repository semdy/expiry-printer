import { Badge, Button, ErrorBlock, NavBar, Popup, SearchBar, Stepper, TabBar } from 'antd-mobile';
import { AppOutline, ExclamationCircleOutline, SetOutline, UnorderedListOutline } from 'antd-mobile-icons';
import cp936Table from 'iconv-lite/encodings/tables/cp936.json';
import gbkAddedTable from 'iconv-lite/encodings/tables/gbk-added.json';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiSend } from './api';
import { bytesToBase64, hasNativeBluetoothPrinter, NativeBluetoothPrinter, type NativeBluetoothDevice } from './bluetoothPrinter';
import NativeBridge from './nativeBridge';

type Tab = 'home' | 'print' | 'warning' | 'operation' | 'printer';

type Material = {
  id: number;
  code: string;
  name: string;
  category: string;
  type: string;
  typeRemark?: string;
  unit: string;
  openedLifeValue: number;
  openedLifeUnit: string;
  status: string;
};

type OpenedMaterial = {
  id: number;
  openedAt: string;
  expiresAt: string;
  computedStatus: string;
  remainingText: string;
  material: Material;
};

type LabelPayload = {
  materialName: string;
  materialType: string;
  printedAt: string;
  expiresAt: string;
  copies?: number;
};

type WritableBluetoothCharacteristic = {
  properties: { write?: boolean; writeWithoutResponse?: boolean };
  writeValue: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
};

type BluetoothPrinterDevice = {
  name?: string;
  gatt?: {
    connect: () => Promise<{
      getPrimaryService: (service: string) => Promise<{
        getCharacteristics: () => Promise<WritableBluetoothCharacteristic[]>;
      }>;
    }>;
    disconnect?: () => void;
  };
};

type BluetoothPrinterConnection = {
  kind: 'web';
  name: string;
  device: BluetoothPrinterDevice;
  characteristic: WritableBluetoothCharacteristic;
} | {
  kind: 'native';
  name: string;
  deviceId: string;
};

const printerStorageKey = 'expiry-label-printer-name';
const printerIdStorageKey = 'expiry-label-printer-id';
const bluetoothServiceUuids = [
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae3a-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '000018f0-0000-1000-8000-00805f9b34fb'
];
const gbkEncodeMap = buildGbkEncodeMap();

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [openedMaterials, setOpenedMaterials] = useState<OpenedMaterial[]>([]);
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [openedKeyword, setOpenedKeyword] = useState('');
  const [printCategory, setPrintCategory] = useState('all');
  const [operationCategory, setOperationCategory] = useState('all');
  const [warningStatus, setWarningStatus] = useState('all');
  const [selectedMaterials, setSelectedMaterials] = useState<number[]>([]);
  const [selectedOpened, setSelectedOpened] = useState<number[]>([]);
  const [printDetailMaterial, setPrintDetailMaterial] = useState<Material | null>(null);
  const [printQuantity, setPrintQuantity] = useState(1);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [batchPrintQuantities, setBatchPrintQuantities] = useState<Record<number, number>>({});
  const [currentOpened, setCurrentOpened] = useState<OpenedMaterial | null>(null);
  const [scrapOpen, setScrapOpen] = useState(false);
  const [scrapQuantity, setScrapQuantity] = useState('1');
  const [scrapRemark, setScrapRemark] = useState('');
  const [actionConfirm, setActionConfirm] = useState<null | { title: string; content: string; confirmText: string; resolve: (ok: boolean) => void }>(null);
  const [printerName, setPrinterName] = useState('');
  const [recentPrinterName, setRecentPrinterName] = useState(() => window.localStorage.getItem(printerStorageKey) || '');
  const [recentPrinterId, setRecentPrinterId] = useState(() => window.localStorage.getItem(printerIdStorageKey) || '');
  const [nativeDevices, setNativeDevices] = useState<NativeBluetoothDevice[]>([]);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState('未连接');
  const [notice, setNotice] = useState<{ content: string; type?: 'success' | 'warning' } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const bluetoothPrinter = useRef<BluetoothPrinterConnection | null>(null);
  const nativeScanActive = useRef(false);

  const title = tab === 'print' && printDetailMaterial ? '打印明细' : { home: '应用中心', print: '标签打印', warning: '效期预警', operation: '物料操作', printer: '打印机设置' }[tab];
  const categories = useMemo(() => ['all', ...Array.from(new Set(materials.map((item) => item.category)))], [materials]);
  const filteredMaterials = useMemo(() => materials.filter((item) => {
    const keywordHit = !materialKeyword || item.name.includes(materialKeyword) || item.code.includes(materialKeyword);
    const categoryHit = printCategory === 'all' || item.category === printCategory;
    return item.status === 'enabled' && keywordHit && categoryHit;
  }), [materials, materialKeyword, printCategory]);
  const filteredOpened = useMemo(() => openedMaterials.filter((item) => {
    const keywordHit = !openedKeyword || item.material.name.includes(openedKeyword) || item.material.code.includes(openedKeyword);
    const categoryHit = operationCategory === 'all' || item.material.category === operationCategory;
    return keywordHit && categoryHit;
  }), [openedMaterials, openedKeyword, operationCategory]);
  const filteredWarnings = useMemo(() => openedMaterials.filter((item) => {
    const statusHit = warningStatus === 'all' ? ['warning', 'expired'].includes(item.computedStatus) : item.computedStatus === warningStatus;
    const keywordHit = !openedKeyword || item.material.name.includes(openedKeyword) || item.material.code.includes(openedKeyword);
    return statusHit && keywordHit;
  }), [openedMaterials, openedKeyword, warningStatus]);

  useEffect(() => {
    void Promise.all([loadMaterials(), loadOpened()]);
  }, []);

  useEffect(() => {
    if (!hasNativeBluetoothPrinter()) return;

    const removeRestoring = NativeBridge.on<NativeBluetoothDevice>('bluetooth.restoring', (device) => {
      setPrinterName(device.name);
      setBluetoothStatus('正在恢复连接');
    });
    const removeRestored = NativeBridge.on<NativeBluetoothDevice>('bluetooth.restored', (device) => {
      bluetoothPrinter.current = { kind: 'native', name: device.name, deviceId: device.id };
      setPrinterName(device.name);
      setRecentPrinterName(device.name);
      setRecentPrinterId(device.id);
      setBluetoothConnected(true);
      setBluetoothStatus('已连接');
      window.localStorage.setItem(printerStorageKey, device.name);
      window.localStorage.setItem(printerIdStorageKey, device.id);
    });
    const removeRestoreFailed = NativeBridge.on<{ error?: string }>('bluetooth.restoreFailed', (data) => {
      bluetoothPrinter.current = null;
      setBluetoothConnected(false);
      setBluetoothStatus(data.error || '恢复连接失败');
    });
    const removeDisconnected = NativeBridge.on('bluetooth.disconnected', () => {
      bluetoothPrinter.current = null;
      setBluetoothConnected(false);
      setBluetoothStatus('连接已断开');
    });
    const removeDeviceDiscovered = NativeBridge.on<NativeBluetoothDevice>('bluetooth.deviceDiscovered', (device) => {
      if (!nativeScanActive.current) return;
      setNativeDevices((current) => {
        const existingIndex = current.findIndex((item) => item.id === device.id);
        if (existingIndex < 0) return [...current, device];
        return current.map((item, index) => index === existingIndex ? device : item);
      });
      setBluetoothStatus('发现设备，仍在搜索');
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

  useEffect(() => {
    if (tab === 'print') void loadMaterials();
    if (tab === 'warning' || tab === 'operation') void loadOpened();
  }, [tab]);

  async function loadMaterials() {
    setMaterials(await apiGet('/api/materials'));
  }

  async function loadOpened() {
    setOpenedMaterials(await apiGet('/api/opened-materials'));
  }

  function openPrintDetail(material: Material) {
    setPrintDetailMaterial(material);
    setPrintQuantity(1);
  }

  async function printMaterial(material: Material, count = 1) {
    if (!ensurePrinterConnected()) return false;
    const printedAt = new Date();
    const labelSent = await dispatchLabels([{ materialName: material.name, materialType: labelMaterialType(material), printedAt: printedAt.toISOString(), expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(), copies: count }]);
    if (!labelSent) return false;
    await apiSend<{ openedMaterial: OpenedMaterial }>('/api/labels/print', 'POST', { materialId: material.id, printCount: count });
    showNotice('打印成功', 'success');
    await loadOpened();
    return true;
  }

  async function confirmPrintDetail() {
    if (!printDetailMaterial) return;
    if (!printQuantity || printQuantity < 1) {
      showNotice('请输入有效的打印数量', 'warning');
      return;
    }
    const printed = await printMaterial(printDetailMaterial, printQuantity);
    if (printed) setPrintDetailMaterial(null);
  }

  function openBatchPrint() {
    if (!selectedMaterials.length) {
      showNotice('请先选择物料', 'warning');
      return;
    }
    setBatchPrintQuantities((current) => Object.fromEntries(selectedMaterials.map((id) => [id, current[id] || 1])));
    setBatchPrintOpen(true);
  }

  function changeBatchPrintQuantity(id: number, nextValue: number) {
    setBatchPrintQuantities((current) => ({ ...current, [id]: Math.min(99, Math.max(1, nextValue)) }));
  }

  function toggleBatchPrintMaterial(id: number) {
    const next = selectedMaterials.includes(id) ? selectedMaterials.filter((item) => item !== id) : [...selectedMaterials, id];
    setSelectedMaterials(next);
    if (!next.length) setBatchPrintOpen(false);
  }

  async function batchPrint() {
    if (!selectedMaterials.length) {
      showNotice('请先选择物料', 'warning');
      return;
    }
    if (!ensurePrinterConnected()) return;
    const labels: LabelPayload[] = [];
    const payloads: Array<{ id: number; count: number }> = [];
    for (const id of selectedMaterials) {
      const material = materials.find((item) => item.id === id);
      if (!material) continue;
      const count = batchPrintQuantities[id] || 1;
      const printedAt = new Date();
      labels.push({ materialName: material.name, materialType: labelMaterialType(material), printedAt: printedAt.toISOString(), expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(), copies: count });
      payloads.push({ id, count });
    }
    const labelSent = await dispatchLabels(labels);
    if (!labelSent) return;
    for (const item of payloads) {
      await apiSend<{ openedMaterial: OpenedMaterial }>('/api/labels/print', 'POST', { materialId: item.id, printCount: item.count });
    }
    setSelectedMaterials([]);
    setBatchPrintOpen(false);
    setBatchPrintQuantities({});
    showNotice('批量打印成功', 'success');
    await loadOpened();
  }

  async function useOpened(item: OpenedMaterial) {
    if (item.computedStatus === 'expired') {
      showNotice('已过期物料不能使用，仅可废弃', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认使用',
      content: `确定要使用“${item.material.name}”吗？`,
      confirmText: '确认使用'
    });
    if (!ok) return;
    await apiSend(`/api/opened-materials/${item.id}/use`, 'POST');
    showNotice('使用成功', 'success');
    await loadOpened();
  }

  function requestConfirm({ title, content, confirmText }: { title: string; content: string; confirmText: string }) {
    return new Promise<boolean>((resolve) => setActionConfirm({ title, content, confirmText, resolve }));
  }

  function closeActionConfirm(ok: boolean) {
    const current = actionConfirm;
    setActionConfirm(null);
    current?.resolve(ok);
  }

  function openScrap(item: OpenedMaterial) {
    setCurrentOpened(item);
    setScrapQuantity('1');
    setScrapRemark('');
    setScrapOpen(true);
  }

  async function confirmScrap() {
    if (!currentOpened) return;
    const quantity = Number(scrapQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showNotice('请输入有效的废弃数量', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认废弃',
      content: `确定要废弃“${currentOpened.material.name}”吗？废弃数量：${quantity}${currentOpened.material.unit}`,
      confirmText: '确认废弃'
    });
    if (!ok) return;
    await apiSend(`/api/opened-materials/${currentOpened.id}/scrap`, 'POST', { quantity, remark: scrapRemark });
    showNotice('废弃成功', 'success');
    setScrapOpen(false);
    setCurrentOpened(null);
    await loadOpened();
  }

  async function reprintOpened(item: OpenedMaterial) {
    if (item.computedStatus === 'expired') {
      showNotice('已过期物料不能补打标签，仅可废弃', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认补打',
      content: `确定要补打“${item.material.name}”的标签吗？默认补打 1 张。`,
      confirmText: '确认补打'
    });
    if (!ok) return;
    if (!ensurePrinterConnected()) return;
    const labelSent = await dispatchLabels([{ materialName: item.material.name, materialType: labelMaterialType(item.material), printedAt: new Date().toISOString(), expiresAt: item.expiresAt, copies: 1 }]);
    if (!labelSent) return;
    await apiSend<{ openedMaterial: OpenedMaterial }>(`/api/opened-materials/${item.id}/reprint`, 'POST');
    showNotice('补打成功', 'success');
    await loadOpened();
  }

  async function batchUse() {
    const rows = openedMaterials.filter((item) => selectedOpened.includes(item.id));
    if (!rows.length) {
      showNotice('请先选择物料', 'warning');
      return;
    }
    if (rows.some((item) => item.computedStatus === 'expired')) {
      showNotice('已过期物料不能使用，仅可废弃', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认批量使用',
      content: `确定要批量使用已选择的 ${rows.length} 个物料吗？`,
      confirmText: '确认使用'
    });
    if (!ok) return;
    await apiSend('/api/opened-materials/batch-use', 'POST', { ids: rows.map((item) => item.id) });
    setSelectedOpened([]);
    showNotice('批量使用成功', 'success');
    await loadOpened();
  }

  async function batchScrap() {
    const rows = openedMaterials.filter((item) => selectedOpened.includes(item.id));
    if (!rows.length) {
      showNotice('请先选择物料', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认批量废弃',
      content: `确定要批量废弃已选择的 ${rows.length} 个物料吗？每个物料默认废弃数量为 1。`,
      confirmText: '确认废弃'
    });
    if (!ok) return;
    await apiSend('/api/opened-materials/batch-scrap', 'POST', { items: rows.map((item) => ({ id: item.id, quantity: 1, remark: '批量废弃' })) });
    setSelectedOpened([]);
    showNotice('批量废弃成功', 'success');
    await loadOpened();
  }

  async function batchReprint() {
    const rows = openedMaterials.filter((item) => selectedOpened.includes(item.id));
    if (!rows.length) {
      showNotice('请先选择物料', 'warning');
      return;
    }
    if (rows.some((item) => item.computedStatus === 'expired')) {
      showNotice('已过期物料不能补打标签，仅可废弃', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认批量补打',
      content: `确定要批量补打已选择的 ${rows.length} 个物料标签吗？每个物料默认补打 1 张。`,
      confirmText: '确认补打'
    });
    if (!ok) return;
    if (!ensurePrinterConnected()) return;
    const labels = rows.map((item) => ({ materialName: item.material.name, materialType: labelMaterialType(item.material), printedAt: new Date().toISOString(), expiresAt: item.expiresAt, copies: 1 }));
    const labelSent = await dispatchLabels(labels);
    if (!labelSent) return;
    for (const item of rows) {
      await apiSend<{ openedMaterial: OpenedMaterial }>(`/api/opened-materials/${item.id}/reprint`, 'POST');
    }
    setSelectedOpened([]);
    showNotice('批量补打成功', 'success');
    await loadOpened();
  }

  async function dispatchLabels(labels: LabelPayload[]) {
    if (!labels.length) return false;
    const connection = bluetoothPrinter.current;
    if (!connection) {
      ensurePrinterConnected();
      return false;
    }
    try {
      await printLabelsViaBluetooth(labels, connection);
      return true;
    } catch (error) {
      setBluetoothConnected(false);
      setBluetoothStatus('发送失败');
      bluetoothPrinter.current = null;
      showNotice('蓝牙发送失败，请重新连接打印机', 'warning');
      setTab('printer');
      return false;
    }
  }

  function ensurePrinterConnected() {
    if (bluetoothPrinter.current && bluetoothConnected) return true;
    showNotice('打印机未连接', 'warning');
    setPrintDetailMaterial(null);
    setBatchPrintOpen(false);
    setTab('printer');
    return false;
  }

  function showNotice(content: string, type: 'success' | 'warning' = 'success') {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ content, type });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1800);
  }

  function changeTab(nextTab: Tab) {
    if (nextTab !== 'print') setPrintDetailMaterial(null);
    setTab(nextTab);
  }

  async function connectBluetoothPrinter() {
    if (hasNativeBluetoothPrinter()) {
      nativeScanActive.current = true;
      setNativeDevices([]);
      setDevicePickerOpen(true);
      try {
        setBluetoothStatus('搜索中');
        const { devices } = await NativeBluetoothPrinter.scan({ serviceUuids: bluetoothServiceUuids, timeoutMs: 5000 });
        if (!nativeScanActive.current) return;
        nativeScanActive.current = false;
        if (!devices.length) throw new Error('未搜索到蓝牙设备，请确认打印机已开机');
        setNativeDevices(devices);
        setBluetoothStatus(`发现 ${devices.length} 台设备`);
      } catch (error) {
        nativeScanActive.current = false;
        setDevicePickerOpen(false);
        setBluetoothStatus('搜索失败');
        showNotice(error instanceof Error ? error.message : '蓝牙设备搜索失败', 'warning');
      }
      return;
    }
    if (!('bluetooth' in navigator)) {
      showNotice('当前浏览器不支持蓝牙直连', 'warning');
      setBluetoothStatus('浏览器不支持');
      return;
    }

    try {
      setBluetoothStatus('搜索中');
      const connection = await requestBluetoothPrinter();
      bluetoothPrinter.current = connection;
      setPrinterName(connection.name);
      setRecentPrinterName(connection.name);
      setBluetoothConnected(true);
      setBluetoothStatus('已连接');
      window.localStorage.setItem(printerStorageKey, connection.name);
      showNotice(`已连接蓝牙打印机：${connection.name}`, 'success');
    } catch (error) {
      setBluetoothStatus('连接失败');
      showNotice(error instanceof Error ? error.message : '蓝牙打印机连接失败', 'warning');
    }
  }

  async function connectNativeDevice(device: NativeBluetoothDevice) {
    nativeScanActive.current = false;
    setDevicePickerOpen(false);
    setBluetoothStatus('连接中');
    try {
      const connected = await NativeBluetoothPrinter.connect({ deviceId: device.id, serviceUuids: bluetoothServiceUuids });
      bluetoothPrinter.current = { kind: 'native', name: connected.name, deviceId: connected.id };
      setPrinterName(connected.name);
      setRecentPrinterName(connected.name);
      setRecentPrinterId(connected.id);
      setBluetoothConnected(true);
      setBluetoothStatus('已连接');
      window.localStorage.setItem(printerStorageKey, connected.name);
      window.localStorage.setItem(printerIdStorageKey, connected.id);
      showNotice(`已连接蓝牙打印机：${connected.name}`, 'success');
    } catch (error) {
      setBluetoothConnected(false);
      setBluetoothStatus('连接失败');
      showNotice(error instanceof Error ? error.message : '蓝牙打印机连接失败', 'warning');
    }
  }

  async function quickConnectBluetoothPrinter() {
    if (hasNativeBluetoothPrinter()) {
      if (!recentPrinterId) {
        showNotice('没有可快速连接的蓝牙打印机，请重新搜索', 'warning');
        return;
      }
      await connectNativeDevice({ id: recentPrinterId, name: recentPrinterName || '蓝牙打印机' });
      return;
    }
    if (!('bluetooth' in navigator)) {
      showNotice('当前浏览器不支持蓝牙直连', 'warning');
      setBluetoothStatus('浏览器不支持');
      return;
    }

    try {
      setBluetoothStatus('连接中');
      const connection = await reconnectBluetoothPrinter(recentPrinterName);
      bluetoothPrinter.current = connection;
      setPrinterName(connection.name);
      setRecentPrinterName(connection.name);
      setBluetoothConnected(true);
      setBluetoothStatus('已连接');
      window.localStorage.setItem(printerStorageKey, connection.name);
      showNotice(`已连接蓝牙打印机：${connection.name}`, 'success');
    } catch (error) {
      setBluetoothStatus('快速连接失败');
      showNotice(error instanceof Error ? error.message : '快速连接失败，请重新搜索打印机', 'warning');
    }
  }

  async function disconnectBluetoothPrinter() {
    const connection = bluetoothPrinter.current;
    if (!connection) {
      setBluetoothConnected(false);
      setBluetoothStatus('未连接');
      return;
    }

    try {
      setBluetoothStatus('断开中');
      if (connection.kind === 'native') await NativeBluetoothPrinter.disconnect();
      else connection.device.gatt?.disconnect?.();
      bluetoothPrinter.current = null;
      setPrinterName('');
      setBluetoothConnected(false);
      setBluetoothStatus('未连接');
      showNotice('已断开蓝牙打印机', 'success');
    } catch (error) {
      setBluetoothStatus('断开失败');
      showNotice(error instanceof Error ? error.message : '断开蓝牙打印机失败', 'warning');
    }
  }

  return (
    <div className="mobile-shell">
      <NavBar back={tab === 'print' && printDetailMaterial ? '返回' : null} onBack={() => setPrintDetailMaterial(null)}>{title}</NavBar>
      <main className={`page ${tab === 'print' && selectedMaterials.length > 0 && !printDetailMaterial ? 'page-with-print-batch' : ''}`}>
        {tab === 'home' && <Home setTab={changeTab} />}
        {tab === 'print' && (
          printDetailMaterial ? (
            <PrintDetail material={printDetailMaterial} quantity={printQuantity} onQuantityChange={setPrintQuantity} onPrint={() => { void confirmPrintDetail(); }} />
          ) : (
            <>
              <div className="search-box"><SearchBar value={materialKeyword} onChange={setMaterialKeyword} placeholder="搜索物料名称/编码" /></div>
              <FilterChips items={categories} value={printCategory} onChange={setPrintCategory} />
              <section className="card">
                <div className="card-title">
                  <span>物料列表</span>
                  <span className="card-count">共 {filteredMaterials.length} 条</span>
                </div>
                <div className="item-list">
                  {filteredMaterials.map((item) => <MaterialPrintCard key={item.id} item={item} checked={selectedMaterials.includes(item.id)} onToggle={() => toggleId(selectedMaterials, setSelectedMaterials, item.id)} onPrint={() => openPrintDetail(item)} />)}
                </div>
              </section>
            </>
          )
        )}
        {tab === 'warning' && (
          <>
            <div className="search-box"><SearchBar value={openedKeyword} onChange={setOpenedKeyword} placeholder="搜索物料名称/编码" /></div>
            <FilterChips items={['all', 'warning', 'expired']} labels={{ all: '全部', warning: '即将过期', expired: '已过期' }} value={warningStatus} onChange={setWarningStatus} />
            {filteredWarnings.length ? filteredWarnings.map((item) => <OpenedCard key={item.id} item={item} onUse={useOpened} onScrap={openScrap} onReprint={reprintOpened} />) : <ErrorBlock status="empty" />}
          </>
        )}
        {tab === 'operation' && (
          <>
            <div className="search-box"><SearchBar value={openedKeyword} onChange={setOpenedKeyword} placeholder="搜索物料名称/编码" /></div>
            <FilterChips items={categories} value={operationCategory} onChange={setOperationCategory} />
            {selectedOpened.length > 0 && (
              <div className="batch-toolbar">
                <div className="batch-toolbar-info">
                  <span className="batch-toolbar-text">已选 {selectedOpened.length} 项</span>
                  <span className="batch-toolbar-clear" onClick={() => setSelectedOpened([])}>取消</span>
                </div>
                <div className="batch-toolbar-actions">
                  <button className="batch-btn batch-btn-use" onClick={() => { void batchUse(); }}>批量使用</button>
                  <button className="batch-btn batch-btn-scrap" onClick={() => { void batchScrap(); }}>批量废弃</button>
                  <button className="batch-btn batch-btn-reprint" onClick={() => { void batchReprint(); }}>批量补打</button>
                </div>
              </div>
            )}
            {filteredOpened.map((item) => <OpenedOperationCard key={item.id} item={item} checked={selectedOpened.includes(item.id)} onToggle={() => toggleId(selectedOpened, setSelectedOpened, item.id)} onUse={useOpened} onScrap={openScrap} onReprint={reprintOpened} />)}
          </>
        )}
        {tab === 'printer' && <PrinterSettings printerName={printerName} recentPrinterName={recentPrinterName} bluetoothConnected={bluetoothConnected} bluetoothStatus={bluetoothStatus} onQuickConnect={() => { void quickConnectBluetoothPrinter(); }} onDisconnect={() => { void disconnectBluetoothPrinter(); }} onConnectBluetooth={() => { void connectBluetoothPrinter(); }} />}
      </main>
      <TabBar activeKey={tab} onChange={(key) => changeTab(key as Tab)}>
        <TabBar.Item key="print" icon={<AppOutline />} title="标签打印" />
        <TabBar.Item key="warning" icon={<ExclamationCircleOutline />} title="效期预警" />
        <TabBar.Item key="operation" icon={<UnorderedListOutline />} title="物料操作" />
        <TabBar.Item key="printer" icon={<SetOutline />} title="打印机设置" />
      </TabBar>
      {tab === 'print' && !printDetailMaterial && selectedMaterials.length > 0 && (
        <div className="print-batch-bar">
          <div className="print-batch-info">
            <span className="print-batch-count">已选 {selectedMaterials.length} 项</span>
            <button className="print-batch-clear" onClick={() => setSelectedMaterials([])}>取消</button>
          </div>
          <button className="print-batch-btn" onClick={openBatchPrint}>批量打印</button>
        </div>
      )}
      <BatchPrintPopup
        visible={batchPrintOpen}
        materials={materials.filter((item) => selectedMaterials.includes(item.id))}
        quantities={batchPrintQuantities}
        onClose={() => setBatchPrintOpen(false)}
        onToggle={toggleBatchPrintMaterial}
        onQuantityChange={changeBatchPrintQuantity}
        onPrint={() => { void batchPrint(); }}
      />
      <ScrapPopup
        visible={scrapOpen}
        item={currentOpened}
        quantity={scrapQuantity}
        remark={scrapRemark}
        onQuantityChange={setScrapQuantity}
        onRemarkChange={setScrapRemark}
        onClose={() => setScrapOpen(false)}
        onConfirm={() => { void confirmScrap(); }}
      />
      {actionConfirm && (
        <div className="action-confirm-mask" role="dialog" aria-modal="true" aria-label={actionConfirm.title}>
          <div className="action-confirm-dialog">
            <div className="action-confirm-title">{actionConfirm.title}</div>
            <div className="action-confirm-content">{actionConfirm.content}</div>
            <div className="action-confirm-actions">
              <button className="action-confirm-btn action-confirm-cancel" onClick={() => closeActionConfirm(false)}>取消</button>
              <button className="action-confirm-btn action-confirm-ok" onClick={() => closeActionConfirm(true)}>{actionConfirm.confirmText}</button>
            </div>
          </div>
        </div>
      )}
      {notice && <div className={`local-toast local-toast-${notice.type}`}>{notice.content}</div>}
      <Popup visible={devicePickerOpen} onMaskClick={() => setDevicePickerOpen(false)} bodyStyle={{ height: '95%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
        <div className="device-picker">
          <h3>选择蓝牙打印机</h3>
          <div className="device-picker-content">
            {nativeDevices.length > 0 ? nativeDevices.map((device) => (
              <button key={device.id} className="device-picker-item" onClick={() => { void connectNativeDevice(device); }}>
                <strong>{device.name}</strong>
                <span>{typeof device.rssi === 'number' ? `信号 ${device.rssi} dBm` : device.id}</span>
              </button>
            )) : <div>正在搜索附近的蓝牙设备…</div>}
          </div>
          <Button block onClick={() => setDevicePickerOpen(false)}>取消</Button>
        </div>
      </Popup>
    </div>
  );
}

function Home({ setTab }: { setTab: (tab: Tab) => void }) {
  return <div className="app-grid">
    <AppCard icon="🏷️" title="标签打印" onClick={() => setTab('print')} />
    <AppCard icon="⚠️" title="效期预警" onClick={() => setTab('warning')} />
    <AppCard icon="📦" title="物料操作" onClick={() => setTab('operation')} />
    <AppCard icon="🖨️" title="打印机设置" onClick={() => setTab('printer')} />
  </div>;
}

function AppCard({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return <div className="app-card" onClick={onClick}><div className="app-icon">{icon}</div><div className="app-title">{title}</div></div>;
}

function FilterChips({ items, value, onChange, labels = {} }: { items: string[]; value: string; onChange: (value: string) => void; labels?: Record<string, string> }) {
  return <div className="filter-row">{items.map((item) => <button key={item} className={`filter-chip ${value === item ? 'active' : ''}`} onClick={() => onChange(item)}>{labels[item] || (item === 'all' ? '全部' : item)}</button>)}</div>;
}

function MaterialPrintCard({ item, checked, onToggle, onPrint }: { item: Material; checked: boolean; onToggle: () => void; onPrint: () => void }) {
  return <div className="item-row">
    <label className="row-check"><input type="checkbox" checked={checked} onChange={onToggle} /></label>
    <div className="item-info">
      <div className="item-name">{item.name}</div>
      <div className="item-desc">编码: {item.code} | {item.type} | 开封效期: {item.openedLifeValue}{unitText(item.openedLifeUnit)}</div>
    </div>
    <div className="item-action">
      <button className="action-btn action-btn-primary" onClick={onPrint}>📄</button>
    </div>
  </div>;
}

function PrintDetail({ material, quantity, onQuantityChange, onPrint }: { material: Material; quantity: number; onQuantityChange: (value: number) => void; onPrint: () => void }) {
  const openedAt = new Date();
  const expiresAt = addLife(openedAt, material.openedLifeValue, material.openedLifeUnit);

  return <div className="print-detail">
    <section className="detail-card">
      <div className="detail-title">物料信息</div>
      <InfoRow label="物料名称" value={material.name} />
      <InfoRow label="物料编码" value={material.code} />
      <InfoRow label="物料分类" value={material.category} />
      <InfoRow label="物料类型" value={material.type} />
      <InfoRow label="规格单位" value={material.unit} />
      <InfoRow label="开封效期" value={`${material.openedLifeValue}${unitText(material.openedLifeUnit)}`} />
    </section>

    <section className="label-preview-card">
      <div className="label-preview-title">效期标签预览</div>
      <div className="label-preview">
        <div className="label-name">{material.name}</div>
        <div className="label-code">{material.code}</div>
        <div className="label-grid">
          <span>开封时间</span>
          <strong>{formatDate(openedAt.toISOString())}</strong>
          <span>到期时间</span>
          <strong>{formatDate(expiresAt.toISOString())}</strong>
          <span>操作人</span>
          <strong>默认用户</strong>
        </div>
      </div>
    </section>

    <section className="detail-card">
      <div className="quantity-row">
        <div>
          <div className="quantity-title">打印数量</div>
          <div className="quantity-desc">选择本次需要打印的标签张数</div>
        </div>
        <Stepper value={quantity} min={1} max={99} onChange={(value) => onQuantityChange(Number(value))} />
      </div>
    </section>

    <button className="btn btn-primary" onClick={onPrint}>确认打印</button>
  </div>;
}

function BatchPrintPopup({ visible, materials, quantities, onClose, onToggle, onQuantityChange, onPrint }: { visible: boolean; materials: Material[]; quantities: Record<number, number>; onClose: () => void; onToggle: (id: number) => void; onQuantityChange: (id: number, value: number) => void; onPrint: () => void }) {
  return <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ borderRadius: '8px 8px 0 0', padding: 0 }}>
    <div className="batch-print-modal">
      <div className="modal-header">
        <div className="modal-title">批量打印</div>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">
        <div className="form-label">选择物料并设置数量</div>
        <div className="batch-print-list">
          {materials.map((item) => {
            const quantity = quantities[item.id] || 1;
            return <div className="batch-print-item" key={item.id}>
              <label className="batch-checkbox">
                <input type="checkbox" checked onChange={() => onToggle(item.id)} />
              </label>
              <div className="batch-info">
                <div className="batch-name">{item.name}</div>
                <div className="batch-desc">{item.code}</div>
              </div>
              <div className="batch-count">
                <button className="count-btn-sm" onClick={() => onQuantityChange(item.id, quantity - 1)}>-</button>
                <span className="count-value-sm">{quantity}</span>
                <button className="count-btn-sm" onClick={() => onQuantityChange(item.id, quantity + 1)}>+</button>
              </div>
            </div>;
          })}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={onPrint}>批量打印</button>
      </div>
    </div>
  </Popup>;
}

function ScrapPopup({
  visible,
  item,
  quantity,
  remark,
  onQuantityChange,
  onRemarkChange,
  onClose,
  onConfirm
}: {
  visible: boolean;
  item: OpenedMaterial | null;
  quantity: string;
  remark: string;
  onQuantityChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ borderRadius: '8px 8px 0 0', padding: 0 }}>
    <div className="scrap-popup">
      <div className="modal-header">
        <div className="modal-title">物料废弃</div>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div className="modal-body">
        <div className="material-desc">{item ? `${item.material.name} ${item.material.code}` : ''}</div>
        <label className="scrap-field">
          <span className="form-label">废弃数量</span>
          <div className="scrap-quantity-row">
            <input
              className="scrap-input"
              name="scrapQuantity"
              inputMode="decimal"
              min="1"
              type="number"
              value={quantity}
              onChange={(event) => onQuantityChange(event.target.value)}
            />
            <span className="scrap-unit">{item?.material.unit || ''}</span>
          </div>
        </label>
        <label className="scrap-field">
          <span className="form-label">备注</span>
          <textarea
            className="scrap-textarea"
            value={remark}
            onChange={(event) => onRemarkChange(event.target.value)}
            placeholder="请输入废弃原因"
          />
        </label>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={onConfirm}>确认废弃</button>
      </div>
    </div>
  </Popup>;
}

function OpenedCard({ item, onUse, onScrap, onReprint }: { item: OpenedMaterial; onUse: (item: OpenedMaterial) => void; onScrap: (item: OpenedMaterial) => void; onReprint: (item: OpenedMaterial) => void }) {
  return <div className="item-row warning-row">
    <div className="item-info">
      <div className="item-name-line">
        <span className="item-name">{item.material.name}</span>
        <span className={`status-tag status-${item.computedStatus}`}>{statusText(item.computedStatus)}</span>
      </div>
      <div className="item-desc">编码: {item.material.code} | {item.material.category} | {item.material.type}</div>
      <div className="item-desc">开封时间: {formatDate(item.openedAt)}</div>
      <div className="item-desc">剩余时间: {item.remainingText}</div>
      <div className="row-actions">
        <button className="mini-btn mini-btn-use" disabled={item.computedStatus === 'expired'} onClick={() => onUse(item)}>使用</button>
        <button className="mini-btn mini-btn-scrap" onClick={() => onScrap(item)}>废弃</button>
        <button className="mini-btn mini-btn-reprint" disabled={item.computedStatus === 'expired'} onClick={() => onReprint(item)}>补打</button>
      </div>
    </div>
  </div>;
}

function OpenedOperationCard({ item, checked, onToggle, onUse, onScrap, onReprint }: { item: OpenedMaterial; checked: boolean; onToggle: () => void; onUse: (item: OpenedMaterial) => void; onScrap: (item: OpenedMaterial) => void; onReprint: (item: OpenedMaterial) => void }) {
  return <div className="material-card">
    <div className="material-card-check"><input type="checkbox" checked={checked} onChange={onToggle} /></div>
    <div className="material-card-content">
      <div className="material-card-header">
        <span className="material-name">{item.material.name}</span>
        <span className={`status-tag status-${item.computedStatus}`}>{statusText(item.computedStatus)}</span>
      </div>
      <div className="material-card-body">
        <InfoRow label="物料编码" value={item.material.code} />
        <InfoRow label="物料分类" value={item.material.category} />
        <InfoRow label="物料类型" value={item.material.type} />
        <InfoRow label="开封时间" value={formatDate(item.openedAt)} />
        <InfoRow label="到期时间" value={formatDate(item.expiresAt)} />
        <InfoRow label="剩余时间" value={item.remainingText} danger={item.computedStatus === 'expired'} />
      </div>
      <div className="row-actions">
        <button className="mini-btn mini-btn-use" disabled={item.computedStatus === 'expired'} onClick={() => onUse(item)}>使用</button>
        <button className="mini-btn mini-btn-scrap" onClick={() => onScrap(item)}>废弃</button>
        <button className="mini-btn mini-btn-reprint" disabled={item.computedStatus === 'expired'} onClick={() => onReprint(item)}>补打</button>
      </div>
    </div>
  </div>;
}

function InfoRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div className="material-info-row"><span className="material-info-label">{label}</span><span className={`material-info-value ${danger ? 'text-danger' : ''}`}>{value}</span></div>;
}

function PrinterSettings({
  printerName,
  recentPrinterName,
  bluetoothConnected,
  bluetoothStatus,
  onQuickConnect,
  onDisconnect,
  onConnectBluetooth
}: {
  printerName: string;
  recentPrinterName: string;
  bluetoothConnected: boolean;
  bluetoothStatus: string;
  onQuickConnect: () => void;
  onDisconnect: () => void;
  onConnectBluetooth: () => void;
}) {
  return <div className="printer-settings">
    <section className="panel printer-panel">
      <div className="printer-section-title">当前连接设备</div>
      <div className="printer-row">
        <div>
          <strong>{bluetoothConnected ? printerName : '未连接'}</strong>
          <div className="material-desc">55mm × 30mm 标签纸，蓝牙直连打印</div>
        </div>
        <Badge content={bluetoothConnected ? '已连接' : '未连接'} color={bluetoothConnected ? '#16a34a' : '#d46b08'} />
      </div>

      <div className="printer-section-title">最近连接设备</div>
      <div className="printer-row">
        <div>
          <strong>{recentPrinterName || '暂无最近设备'}</strong>
          <div className="material-desc">已授权设备可尝试快速连接</div>
        </div>
        <Button
          size="small"
          color={bluetoothConnected ? 'danger' : 'default'}
          disabled={!bluetoothConnected && !recentPrinterName}
          onClick={bluetoothConnected ? onDisconnect : onQuickConnect}
        >
          {bluetoothConnected ? '断开连接' : '快速连接'}
        </Button>
      </div>

      <div className="printer-form">
        <Button color="primary" block onClick={onConnectBluetooth}>搜索并连接蓝牙打印机</Button>
        <div className="bluetooth-status">
          <span>蓝牙连接状态</span>
          <strong>{bluetoothConnected ? '已连接' : bluetoothStatus}</strong>
        </div>
      </div>
      <div className="printer-tip">
        标签只通过已连接的蓝牙打印机输出。未连接时点击打印会自动进入本页。
      </div>
    </section>
  </div>;
}

async function requestBluetoothPrinter(): Promise<BluetoothPrinterConnection> {
  const bluetooth = (navigator as Navigator & {
    bluetooth: {
      requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<BluetoothPrinterDevice>;
    };
  }).bluetooth;

  const device = await bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: bluetoothServiceUuids
  });
  return connectBluetoothDevice(device);
}

async function reconnectBluetoothPrinter(recentName: string): Promise<BluetoothPrinterConnection> {
  const bluetooth = (navigator as Navigator & {
    bluetooth: {
      getDevices?: () => Promise<BluetoothPrinterDevice[]>;
    };
  }).bluetooth;

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
      const characteristic = characteristics.find((item) => item.properties.writeWithoutResponse || item.properties.write);
      if (characteristic) {
        return {
          kind: 'web',
          name: device.name || '蓝牙打印机',
          device,
          characteristic
        };
      }
    } catch (error) {
      // Some printers expose only one of the common services; keep scanning.
    }
  }

  throw new Error('未找到可写入的蓝牙打印服务');
}

async function printLabelsViaBluetooth(labels: LabelPayload[], connection: BluetoothPrinterConnection) {
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
  return encodeGbk([
    'SIZE 55 mm,30 mm',
    'GAP 2 mm,0 mm',
    'DIRECTION 0',
    'REFERENCE 0,0',
    'CODEPAGE 936',
    'CLS',
    tsplText(24, 24, `物料名称：${label.materialName}`),
    tsplText(24, 72, `物料类型：${label.materialType}`),
    tsplText(24, 134, `打印时间：${formatFullLabelDate(label.printedAt)}`),
    tsplText(24, 184, `到期时间：${formatFullLabelDate(label.expiresAt)}`),
    'PRINT 1,1',
    ''
  ].join('\r\n'));
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

function formatFullLabelDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toggleId(items: number[], setItems: (items: number[]) => void, id: number) {
  setItems(items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
}

function unitText(unit: string) {
  return ({ minutes: '分钟', hours: '小时', days: '天' } as Record<string, string>)[unit] || unit;
}

function labelMaterialType(material: Material) {
  return material.typeRemark ? `${material.type},${material.typeRemark}` : material.type;
}

function statusText(status: string) {
  return ({ normal: '正常', warning: '即将过期', expired: '已过期' } as Record<string, string>)[status] || status;
}

function addLife(date: Date, value: number, unit: string) {
  const minutes = unit === 'minutes' ? value : unit === 'hours' ? value * 60 : value * 24 * 60;
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}
