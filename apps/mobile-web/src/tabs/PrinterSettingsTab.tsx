import { Badge, Button } from 'antd-mobile';

type PrinterSettingsTabProps = {
  printerName: string;
  recentPrinterName: string;
  connected: boolean;
  status: string;
  discoveredDeviceCount: number;
  onShowDevices: () => void;
  onQuickConnect: () => void;
  onDisconnect: () => void;
  onConnect: () => void;
};

export default function PrinterSettingsTab({
  printerName,
  recentPrinterName,
  connected,
  status,
  discoveredDeviceCount,
  onShowDevices,
  onQuickConnect,
  onDisconnect,
  onConnect
}: PrinterSettingsTabProps) {
  function showDevices() {
    if (discoveredDeviceCount > 0) onShowDevices();
  }

  return (
    <div className="printer-settings">
      <section className="panel printer-panel">
        <div className="printer-section-title">当前连接设备</div>
        <div className="printer-row">
          <div>
            <strong>{connected ? printerName : '未连接'}</strong>
            <div className="material-desc">55mm × 30mm 标签纸，蓝牙直连打印</div>
          </div>
          <Badge content={connected ? '已连接' : '未连接'} color={connected ? '#16a34a' : '#d46b08'} />
        </div>

        <div className="printer-section-title">最近连接设备</div>
        <div className="printer-row">
          <div>
            <strong>{recentPrinterName || '暂无最近设备'}</strong>
            <div className="material-desc">已授权设备可尝试快速连接</div>
          </div>
          <Button
            size="small"
            color={connected ? 'danger' : 'default'}
            disabled={!connected && !recentPrinterName}
            onClick={connected ? onDisconnect : onQuickConnect}
          >
            {connected ? '断开连接' : '快速连接'}
          </Button>
        </div>

        <div className="printer-form">
          <Button color="primary" block onClick={onConnect}>
            搜索并连接蓝牙打印机
          </Button>
          <div className="bluetooth-status" onClick={showDevices}>
            <span>蓝牙连接状态</span>
            <strong>{connected ? '已连接' : status}</strong>
          </div>
        </div>
        <div className="printer-tip">标签只通过已连接的蓝牙打印机输出。未连接时点击打印会自动进入本页。</div>
      </section>
    </div>
  );
}
