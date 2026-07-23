import type { Tab } from '../types';

type HomeTabProps = {
  onTabChange: (tab: Tab) => void;
};

export default function HomeTab({ onTabChange }: HomeTabProps) {
  return (
    <div className="app-grid">
      <AppCard icon="🏷️" title="标签打印" onClick={() => onTabChange('print')} />
      <AppCard icon="⚠️" title="效期预警" onClick={() => onTabChange('warning')} />
      <AppCard icon="📦" title="物料操作" onClick={() => onTabChange('operation')} />
      <AppCard icon="🖨️" title="打印机设置" onClick={() => onTabChange('printerSettings')} />
    </div>
  );
}

function AppCard({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <div className="app-card" onClick={onClick}>
      <div className="app-icon">{icon}</div>
      <div className="app-title">{title}</div>
    </div>
  );
}
