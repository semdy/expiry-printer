import { NavBar, TabBar } from 'antd-mobile';
import { useCallback, useRef, useState } from 'react';
import IconBox from './assets/svgs/box.svg?react';
import IconBell from './assets/svgs/bell.svg?react';
import IconPrinter from './assets/svgs/printer.svg?react';
import IconSettings from './assets/svgs/settings.svg?react';
import LanguageSwitcher from './components/LanguageSwitcher';
import HomeTab from './tabs/HomeTab';
import OperationTab from './tabs/OperationTab';
import PrinterSettingsTab from './tabs/PrinterSettingsTab';
import PrintTab, { type PrintTabHandle } from './tabs/PrintTab';
import WarningTab from './tabs/WarningTab';
import type { ConfirmOptions, NoticeType, PrinterController, Tab } from './types';

export default function MobileApp() {
  const [tab, setTab] = useState<Tab>('home');
  const [printDetailOpen, setPrintDetailOpen] = useState(false);
  const [printSelectionCount, setPrintSelectionCount] = useState(0);
  const [notice, setNotice] = useState<{ content: string; type: NoticeType } | null>(null);
  const [actionConfirm, setActionConfirm] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const printTab = useRef<PrintTabHandle>(null);
  const printer = useRef<PrinterController>(null);

  const showNotice = useCallback((content: string, type: NoticeType = 'success') => {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    setNotice({ content, type });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 1800);
  }, []);

  const requestConfirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setActionConfirm({ ...options, resolve })),
    []
  );

  function closeActionConfirm(ok: boolean) {
    const current = actionConfirm;
    setActionConfirm(null);
    current?.resolve(ok);
  }

  const changeTab = useCallback((nextTab: Tab) => {
    if (nextTab !== 'print') {
      printTab.current?.closeDetail();
      setPrintDetailOpen(false);
      setPrintSelectionCount(0);
    }
    setTab(nextTab);
  }, []);

  const title = printDetailOpen && tab === 'print'
    ? '打印明细'
    : {
        home: '应用中心',
        print: '标签打印',
        warning: '效期预警',
        operation: '物料操作',
        printerSettings: '打印机设置'
      }[tab];

  return (
    <div className="mobile-shell">
      <NavBar
        back={tab === 'print' && printDetailOpen ? '返回' : null}
        right={<LanguageSwitcher />}
        onBack={() => printTab.current?.closeDetail()}
      >
        {title}
      </NavBar>
      <main className={`page ${tab === 'print' && printSelectionCount > 0 && !printDetailOpen ? 'page-with-print-batch' : ''}`}>
        {tab === 'home' && <HomeTab onTabChange={changeTab} />}
        {tab === 'print' && (
          <PrintTab
            ref={printTab}
            active={tab === 'print'}
            printer={printer}
            showNotice={showNotice}
            onDetailChange={setPrintDetailOpen}
            onSelectionChange={setPrintSelectionCount}
          />
        )}
        {tab === 'warning' && (
          <WarningTab
            active={tab === 'warning'}
            printer={printer}
            showNotice={showNotice}
            requestConfirm={requestConfirm}
          />
        )}
        {tab === 'operation' && (
          <OperationTab
            active={tab === 'operation'}
            printer={printer}
            showNotice={showNotice}
            requestConfirm={requestConfirm}
          />
        )}
        <div hidden={tab !== 'printerSettings'}>
          <PrinterSettingsTab
            ref={printer}
            showNotice={showNotice}
            onConnectionRequired={() => changeTab('printerSettings')}
          />
        </div>
      </main>
      <TabBar activeKey={tab} onChange={(key) => changeTab(key as Tab)}>
        <TabBar.Item key="print" icon={<IconPrinter />} title="标签打印" />
        <TabBar.Item key="warning" icon={<IconBell />} title="效期预警" />
        <TabBar.Item key="operation" icon={<IconBox />} title="物料操作" />
        <TabBar.Item key="printerSettings" icon={<IconSettings />} title="打印机设置" />
      </TabBar>
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
    </div>
  );
}
