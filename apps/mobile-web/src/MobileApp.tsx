import { Button, NavBar, Popup, SearchBar, TabBar } from 'antd-mobile';
import { AppOutline, ExclamationCircleOutline, SetOutline, UnorderedListOutline } from 'antd-mobile-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiSend } from './api';
import { hasNativeBluetoothPrinter, NativeBluetoothPrinter, type NativeBluetoothDevice } from './bluetoothPrinter';
import { BatchPrintPopup, ScrapPopup } from './components/MobileViews';
import LanguageSwitcher from './components/LanguageSwitcher';
import { addLife, labelMaterialType, toggleId } from './materialUtils';
import NativeBridge from './nativeBridge';
import {
  bluetoothServiceUuids,
  printLabelsViaBluetooth,
  reconnectBluetoothPrinter,
  requestBluetoothPrinter
} from './printerService';
import HomeTab from './tabs/HomeTab';
import OperationTab from './tabs/OperationTab';
import PrinterSettingsTab from './tabs/PrinterSettingsTab';
import PrintTab from './tabs/PrintTab';
import WarningTab from './tabs/WarningTab';
import type { BluetoothPrinterConnection, LabelPayload, Material, OpenedMaterial, Tab } from './types';

const printerStorageKey = 'expiry-label-printer-name';
const printerIdStorageKey = 'expiry-label-printer-id';

export default function MobileApp() {
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
  const [actionConfirm, setActionConfirm] = useState<null | {
    title: string;
    content: string;
    confirmText: string;
    resolve: (ok: boolean) => void;
  }>(null);
  const [printerName, setPrinterName] = useState('');
  const [recentPrinterName, setRecentPrinterName] = useState(
    () => window.localStorage.getItem(printerStorageKey) || ''
  );
  const [recentPrinterId, setRecentPrinterId] = useState(() => window.localStorage.getItem(printerIdStorageKey) || '');
  const [nativeDevices, setNativeDevices] = useState<NativeBluetoothDevice[]>([]);
  const [deviceNameKeyword, setDeviceNameKeyword] = useState('');
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [bluetoothConnected, setBluetoothConnected] = useState(false);
  const [bluetoothStatus, setBluetoothStatus] = useState('未连接');
  const [notice, setNotice] = useState<{ content: string; type?: 'success' | 'warning' } | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const bluetoothPrinter = useRef<BluetoothPrinterConnection | null>(null);
  const nativeScanActive = useRef(false);

  const title =
    tab === 'print' && printDetailMaterial
      ? '打印明细'
      : {
          home: '应用中心',
          print: '标签打印',
          warning: '效期预警',
          operation: '物料操作',
          printerSettings: '打印机设置'
        }[tab];
  const filteredNativeDevices = useMemo(() => {
    const keyword = deviceNameKeyword.trim().toLocaleLowerCase();
    if (!keyword) return nativeDevices;
    return nativeDevices.filter((device) => device.name.toLocaleLowerCase().includes(keyword));
  }, [nativeDevices, deviceNameKeyword]);
  const categories = useMemo(
    () => ['all', ...Array.from(new Set(materials.map((item) => item.category)))],
    [materials]
  );
  const filteredMaterials = useMemo(
    () =>
      materials.filter((item) => {
        const keywordHit =
          !materialKeyword || item.name.includes(materialKeyword) || item.code.includes(materialKeyword);
        const categoryHit = printCategory === 'all' || item.category === printCategory;
        return item.status === 'enabled' && keywordHit && categoryHit;
      }),
    [materials, materialKeyword, printCategory]
  );
  const filteredOpened = useMemo(
    () =>
      openedMaterials.filter((item) => {
        const keywordHit =
          !openedKeyword || item.material.name.includes(openedKeyword) || item.material.code.includes(openedKeyword);
        const categoryHit = operationCategory === 'all' || item.material.category === operationCategory;
        return keywordHit && categoryHit;
      }),
    [openedMaterials, openedKeyword, operationCategory]
  );
  const filteredWarnings = useMemo(
    () =>
      openedMaterials.filter((item) => {
        const statusHit =
          warningStatus === 'all'
            ? ['warning', 'expired'].includes(item.computedStatus)
            : item.computedStatus === warningStatus;
        const keywordHit =
          !openedKeyword || item.material.name.includes(openedKeyword) || item.material.code.includes(openedKeyword);
        return statusHit && keywordHit;
      }),
    [openedMaterials, openedKeyword, warningStatus]
  );

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
        return current.map((item, index) => (index === existingIndex ? device : item));
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
    const labelSent = await dispatchLabels([
      {
        materialName: material.name,
        materialType: labelMaterialType(material),
        printedAt: printedAt.toISOString(),
        expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(),
        copies: count
      }
    ]);
    if (!labelSent) return false;
    await apiSend<{ openedMaterial: OpenedMaterial }>('/api/labels/print', 'POST', {
      materialId: material.id,
      printCount: count
    });
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
    const next = selectedMaterials.includes(id)
      ? selectedMaterials.filter((item) => item !== id)
      : [...selectedMaterials, id];
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
      labels.push({
        materialName: material.name,
        materialType: labelMaterialType(material),
        printedAt: printedAt.toISOString(),
        expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(),
        copies: count
      });
      payloads.push({ id, count });
    }
    const labelSent = await dispatchLabels(labels);
    if (!labelSent) return;
    for (const item of payloads) {
      await apiSend<{ openedMaterial: OpenedMaterial }>('/api/labels/print', 'POST', {
        materialId: item.id,
        printCount: item.count
      });
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
      content: t('确定要使用“{name}”吗？', { name: item.material.name }),
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
      content: t('确定要废弃“{name}”吗？废弃数量：{quantity}{unit}', {
        name: currentOpened.material.name,
        quantity,
        unit: currentOpened.material.unit
      }),
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
      content: t('确定要补打“{name}”的标签吗？默认补打 1 张。', { name: item.material.name }),
      confirmText: '确认补打'
    });
    if (!ok) return;
    if (!ensurePrinterConnected()) return;
    const labelSent = await dispatchLabels([
      {
        materialName: item.material.name,
        materialType: labelMaterialType(item.material),
        printedAt: new Date().toISOString(),
        expiresAt: item.expiresAt,
        copies: 1
      }
    ]);
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
      content: t('确定要批量使用已选择的 {count} 个物料吗？', { count: rows.length }),
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
      content: t('确定要批量废弃已选择的 {count} 个物料吗？每个物料默认废弃数量为 1。', {
        count: rows.length
      }),
      confirmText: '确认废弃'
    });
    if (!ok) return;
    await apiSend('/api/opened-materials/batch-scrap', 'POST', {
      items: rows.map((item) => ({ id: item.id, quantity: 1, remark: '批量废弃' }))
    });
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
      content: t('确定要批量补打已选择的 {count} 个物料标签吗？每个物料默认补打 1 张。', {
        count: rows.length
      }),
      confirmText: '确认补打'
    });
    if (!ok) return;
    if (!ensurePrinterConnected()) return;
    const labels = rows.map((item) => ({
      materialName: item.material.name,
      materialType: labelMaterialType(item.material),
      printedAt: new Date().toISOString(),
      expiresAt: item.expiresAt,
      copies: 1
    }));
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
      console.error(error);
      setBluetoothConnected(false);
      setBluetoothStatus('发送失败');
      bluetoothPrinter.current = null;
      showNotice('蓝牙发送失败，请重新连接打印机', 'warning');
      setTab('printerSettings');
      return false;
    }
  }

  function ensurePrinterConnected() {
    if (bluetoothPrinter.current && bluetoothConnected) return true;
    showNotice('打印机未连接', 'warning');
    setPrintDetailMaterial(null);
    setBatchPrintOpen(false);
    setTab('printerSettings');
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
      setDeviceNameKeyword('');
      setDevicePickerOpen(true);
      try {
        setBluetoothStatus('搜索中');
        const { devices } = await NativeBluetoothPrinter.scan({ serviceUuids: bluetoothServiceUuids, timeoutMs: 5000 });
        if (!nativeScanActive.current) return;
        nativeScanActive.current = false;
        if (!devices.length) throw new Error('未搜索到蓝牙设备，请确认打印机已开机');
        setNativeDevices(devices);
        setBluetoothStatus(t('发现 {count} 台设备', { count: devices.length }));
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
      showNotice(t('已连接蓝牙打印机：{name}', { name: connection.name }), 'success');
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
      const connected = await NativeBluetoothPrinter.connect({
        deviceId: device.id,
        serviceUuids: bluetoothServiceUuids
      });
      bluetoothPrinter.current = { kind: 'native', name: connected.name, deviceId: connected.id };
      setPrinterName(connected.name);
      setRecentPrinterName(connected.name);
      setRecentPrinterId(connected.id);
      setBluetoothConnected(true);
      setBluetoothStatus('已连接');
      window.localStorage.setItem(printerStorageKey, connected.name);
      window.localStorage.setItem(printerIdStorageKey, connected.id);
      showNotice(t('已连接蓝牙打印机：{name}', { name: connected.name }), 'success');
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
      showNotice(t('已连接蓝牙打印机：{name}', { name: connection.name }), 'success');
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
      <NavBar
        back={tab === 'print' && printDetailMaterial ? '返回' : null}
        right={<LanguageSwitcher />}
        onBack={() => setPrintDetailMaterial(null)}
      >
        {title}
      </NavBar>
      <main
        className={`page ${tab === 'print' && selectedMaterials.length > 0 && !printDetailMaterial ? 'page-with-print-batch' : ''}`}
      >
        {tab === 'home' && <HomeTab onTabChange={changeTab} />}
        {tab === 'print' && (
          <PrintTab
            categories={categories}
            filteredMaterials={filteredMaterials}
            keyword={materialKeyword}
            category={printCategory}
            selectedIds={selectedMaterials}
            detailMaterial={printDetailMaterial}
            quantity={printQuantity}
            onKeywordChange={setMaterialKeyword}
            onCategoryChange={setPrintCategory}
            onToggle={(id: number) => toggleId(selectedMaterials, setSelectedMaterials, id)}
            onOpenDetail={openPrintDetail}
            onQuantityChange={setPrintQuantity}
            onPrint={() => {
              void confirmPrintDetail();
            }}
          />
        )}
        {tab === 'warning' && (
          <WarningTab
            items={filteredWarnings}
            keyword={openedKeyword}
            status={warningStatus}
            onKeywordChange={setOpenedKeyword}
            onStatusChange={setWarningStatus}
            onUse={useOpened}
            onScrap={openScrap}
            onReprint={reprintOpened}
          />
        )}
        {tab === 'operation' && (
          <OperationTab
            categories={categories}
            items={filteredOpened}
            keyword={openedKeyword}
            category={operationCategory}
            selectedIds={selectedOpened}
            onKeywordChange={setOpenedKeyword}
            onCategoryChange={setOperationCategory}
            onSelectionClear={() => setSelectedOpened([])}
            onToggle={(id) => toggleId(selectedOpened, setSelectedOpened, id)}
            onUse={useOpened}
            onScrap={openScrap}
            onReprint={reprintOpened}
            onBatchUse={() => {
              void batchUse();
            }}
            onBatchScrap={() => {
              void batchScrap();
            }}
            onBatchReprint={() => {
              void batchReprint();
            }}
          />
        )}
        {tab === 'printerSettings' && (
          <PrinterSettingsTab
            printerName={printerName}
            recentPrinterName={recentPrinterName}
            connected={bluetoothConnected}
            status={bluetoothStatus}
            discoveredDeviceCount={nativeDevices.length}
            onShowDevices={() => setDevicePickerOpen(true)}
            onQuickConnect={() => {
              void quickConnectBluetoothPrinter();
            }}
            onDisconnect={() => {
              void disconnectBluetoothPrinter();
            }}
            onConnect={() => {
              void connectBluetoothPrinter();
            }}
          />
        )}
      </main>
      <TabBar activeKey={tab} onChange={(key) => changeTab(key as Tab)}>
        <TabBar.Item key="print" icon={<AppOutline />} title="标签打印" />
        <TabBar.Item key="warning" icon={<ExclamationCircleOutline />} title="效期预警" />
        <TabBar.Item key="operation" icon={<UnorderedListOutline />} title="物料操作" />
        <TabBar.Item key="printerSettings" icon={<SetOutline />} title="打印机设置" />
      </TabBar>
      {tab === 'print' && !printDetailMaterial && selectedMaterials.length > 0 && (
        <div className="print-batch-bar">
          <div className="print-batch-info">
            <span className="print-batch-count">{t('已选 {count} 项', { count: selectedMaterials.length })}</span>
            <button className="print-batch-clear" onClick={() => setSelectedMaterials([])}>
              取消
            </button>
          </div>
          <button className="print-batch-btn" onClick={openBatchPrint}>
            批量打印
          </button>
        </div>
      )}
      <BatchPrintPopup
        visible={batchPrintOpen}
        materials={materials.filter((item) => selectedMaterials.includes(item.id))}
        quantities={batchPrintQuantities}
        onClose={() => setBatchPrintOpen(false)}
        onToggle={toggleBatchPrintMaterial}
        onQuantityChange={changeBatchPrintQuantity}
        onPrint={() => {
          void batchPrint();
        }}
      />
      <ScrapPopup
        visible={scrapOpen}
        item={currentOpened}
        quantity={scrapQuantity}
        remark={scrapRemark}
        onQuantityChange={setScrapQuantity}
        onRemarkChange={setScrapRemark}
        onClose={() => setScrapOpen(false)}
        onConfirm={() => {
          void confirmScrap();
        }}
      />
      {actionConfirm && (
        <div className="action-confirm-mask" role="dialog" aria-modal="true" aria-label={actionConfirm.title}>
          <div className="action-confirm-dialog">
            <div className="action-confirm-title">{actionConfirm.title}</div>
            <div className="action-confirm-content">{actionConfirm.content}</div>
            <div className="action-confirm-actions">
              <button className="action-confirm-btn action-confirm-cancel" onClick={() => closeActionConfirm(false)}>
                取消
              </button>
              <button className="action-confirm-btn action-confirm-ok" onClick={() => closeActionConfirm(true)}>
                {actionConfirm.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && <div className={`local-toast local-toast-${notice.type}`}>{notice.content}</div>}
      <Popup
        visible={devicePickerOpen}
        onMaskClick={() => setDevicePickerOpen(false)}
        bodyStyle={{ height: '95%', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div className="device-picker">
          <h3>选择蓝牙打印机</h3>
          <SearchBar
            className="device-picker-search"
            value={deviceNameKeyword}
            onChange={setDeviceNameKeyword}
            placeholder="按蓝牙名称搜索"
          />
          <div className="device-picker-content">
            {filteredNativeDevices.length > 0 ? (
              filteredNativeDevices.map((device) => (
                <button
                  key={device.id}
                  className="device-picker-item"
                  onClick={() => {
                    void connectNativeDevice(device);
                  }}
                >
                  <strong>{device.name}</strong>
                  <span>
                    {typeof device.rssi === 'number' ? t('信号 {rssi} dBm', { rssi: device.rssi }) : device.id}
                  </span>
                </button>
              ))
            ) : (
              <div>{nativeDevices.length > 0 ? '没有匹配的蓝牙设备' : '正在搜索附近的蓝牙设备…'}</div>
            )}
          </div>
          <Button block onClick={() => setDevicePickerOpen(false)}>
            取消
          </Button>
        </div>
      </Popup>
    </div>
  );
}
