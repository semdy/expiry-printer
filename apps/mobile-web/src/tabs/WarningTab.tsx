import { ErrorBlock, SearchBar } from 'antd-mobile';
import type { CheckItem } from '@imsfe/organization-selector';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api';
import { FilterChips, OpenedCard } from '../components/MobileViews';
import OrganizationPicker from '../components/OrganizationPicker';
import type { OpenedMaterial, PrinterController, RequestConfirm, ShowNotice } from '../types';
import { useOpenedMaterialActions } from './useOpenedMaterialActions';

type Props = {
  active: boolean;
  printer: React.RefObject<PrinterController | null>;
  showNotice: ShowNotice;
  requestConfirm: RequestConfirm;
};

export default function WarningTab({ active, printer, showNotice, requestConfirm }: Props) {
  const [items, setItems] = useState<OpenedMaterial[]>([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [organizations, setOrganizations] = useState<CheckItem[]>([]);
  const loadItems = useCallback(async () => setItems(await apiGet('/api/opened-materials')), []);
  const actions = useOpenedMaterialActions({ items, printer, showNotice, requestConfirm, reload: loadItems });
  const filteredItems = useMemo(() => items.filter((item) => {
    const statusHit = status === 'all' ? ['warning', 'expired'].includes(item.computedStatus) : item.computedStatus === status;
    const keywordHit = !keyword || item.material.name.includes(keyword) || item.material.code.includes(keyword);
    return statusHit && keywordHit;
  }), [items, keyword, status]);

  useEffect(() => {
    if (active) void loadItems();
  }, [active, loadItems]);

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
