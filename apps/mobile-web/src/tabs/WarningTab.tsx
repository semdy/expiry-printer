import { ErrorBlock, SearchBar } from 'antd-mobile';
import { useEffect, useMemo } from 'react';
import { FilterChips, OpenedCard } from '@/components/MobileViews';
import OrganizationPicker from '@/components/OrganizationPicker';
import { useWarningTabStore } from '@/stores/warningTabStore';
import { useOpenedMaterialActions } from '@/tabs/useOpenedMaterialActions';
import type { PrinterController, RequestConfirm, ShowNotice } from '@/types';

type Props = {
  printer: React.RefObject<PrinterController | null>;
  showNotice: ShowNotice;
  requestConfirm: RequestConfirm;
};

export default function WarningTab({ printer, showNotice, requestConfirm }: Props) {
  const { items, keyword, status, organizations, refresh, setKeyword, setStatus, setOrganizations } = useWarningTabStore();
  const actions = useOpenedMaterialActions({ items, printer, showNotice, requestConfirm, reload: refresh });
  const filteredItems = useMemo(() => items.filter((item) => {
    const statusHit = status === 'all' ? ['warning', 'expired'].includes(item.computedStatus) : item.computedStatus === status;
    const keywordHit = !keyword || item.material.name.includes(keyword) || item.material.code.includes(keyword);
    return statusHit && keywordHit;
  }), [items, keyword, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <div className="search-box warning-search-box">
        <SearchBar value={keyword} onChange={setKeyword} placeholder="搜索物料名称/编码" />
        <OrganizationPicker value={organizations} onChange={setOrganizations} />
      </div>
      <FilterChips
        items={['all', 'warning', 'expired']}
        labels={{
          all: '全部',
          warning: <span className="warning-filter-label">即将过期<span className="warning-filter-badge">0</span></span>,
          expired: <span className="warning-filter-label">已过期<span className="warning-filter-badge">0</span></span>
        }}
        value={status}
        onChange={setStatus}
      />
      {filteredItems.length ? filteredItems.map((item) => (
        <OpenedCard key={item.id} item={item} onUse={actions.openUse} onScrap={actions.openScrap} onReprint={actions.reprint} />
      )) : <ErrorBlock status="empty" />}
      {actions.popups}
    </>
  );
}
