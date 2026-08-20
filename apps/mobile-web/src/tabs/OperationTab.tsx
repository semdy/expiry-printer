import { SearchBar } from 'antd-mobile';
import { useEffect, useMemo } from 'react';
import { FilterChips, OpenedOperationCard } from '@/components/MobileViews';
import OrganizationPicker from '@/components/OrganizationPicker';
import { toggleId } from '@/materialUtils';
import { useOperationTabStore } from '@/stores/operationTabStore';
import { useOpenedMaterialActions } from '@/tabs/useOpenedMaterialActions';
import type { PrinterController, RequestConfirm, ShowNotice } from '@/types';

type Props = {
  printer: React.RefObject<PrinterController | null>;
  showNotice: ShowNotice;
  requestConfirm: RequestConfirm;
};

export default function OperationTab({ printer, showNotice, requestConfirm }: Props) {
  const {
    items,
    keyword,
    category,
    selectedIds,
    organizations,
    refresh,
    setKeyword,
    setCategory,
    setSelectedIds,
    setOrganizations
  } = useOperationTabStore();
  const actions = useOpenedMaterialActions({
    items,
    printer,
    showNotice,
    requestConfirm,
    reload: refresh,
    onBatchComplete: () => setSelectedIds([])
  });
  const categories = useMemo(() => ['all', ...new Set(items.map((item) => item.material.category))], [items]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const keywordHit = !keyword || item.material.name.includes(keyword) || item.material.code.includes(keyword);
    return keywordHit && (category === 'all' || item.material.category === category);
  }), [items, keyword, category]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <>
      <div className="search-box warning-search-box">
        <SearchBar value={keyword} onChange={setKeyword} placeholder="搜索物料名称/编码" />
        <OrganizationPicker value={organizations} onChange={setOrganizations} />
      </div>
      <FilterChips items={categories} value={category} onChange={setCategory} />
      {selectedIds.length > 0 && (
        <div className="batch-toolbar">
          <div className="batch-toolbar-info">
            <span className="batch-toolbar-text">{t('已选 {count} 项', { count: selectedIds.length })}</span>
            <span className="batch-toolbar-clear" onClick={() => setSelectedIds([])}>取消</span>
          </div>
          <div className="batch-toolbar-actions">
            <button className="batch-btn batch-btn-use" onClick={() => actions.openBatch('use', selectedIds)}>批量使用</button>
            <button className="batch-btn batch-btn-scrap" onClick={() => actions.openBatch('scrap', selectedIds)}>批量废弃</button>
            <button className="batch-btn batch-btn-reprint" onClick={() => void actions.batchReprint(selectedIds).then((ok) => ok && setSelectedIds([]))}>批量补打</button>
          </div>
        </div>
      )}
      {filteredItems.map((item) => (
        <OpenedOperationCard
          key={item.id}
          item={item}
          checked={selectedIds.includes(item.id)}
          onToggle={() => toggleId(selectedIds, setSelectedIds, item.id)}
          onUse={actions.openUse}
          onScrap={actions.openScrap}
          onReprint={actions.reprint}
        />
      ))}
      {actions.popups}
    </>
  );
}
