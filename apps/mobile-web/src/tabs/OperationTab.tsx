import { SearchBar } from 'antd-mobile';
import { FilterChips, OpenedOperationCard } from '../components/MobileViews';
import type { OpenedMaterial } from '../types';

type OperationTabProps = {
  categories: string[];
  items: OpenedMaterial[];
  keyword: string;
  category: string;
  selectedIds: number[];
  onKeywordChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSelectionClear: () => void;
  onToggle: (id: number) => void;
  onUse: (item: OpenedMaterial) => void;
  onScrap: (item: OpenedMaterial) => void;
  onReprint: (item: OpenedMaterial) => void;
  onBatchUse: () => void;
  onBatchScrap: () => void;
  onBatchReprint: () => void;
};

export default function OperationTab({
  categories,
  items,
  keyword,
  category,
  selectedIds,
  onKeywordChange,
  onCategoryChange,
  onSelectionClear,
  onToggle,
  onUse,
  onScrap,
  onReprint,
  onBatchUse,
  onBatchScrap,
  onBatchReprint
}: OperationTabProps) {
  return (
    <>
      <div className="search-box">
        <SearchBar value={keyword} onChange={onKeywordChange} placeholder="搜索物料名称/编码" />
      </div>
      <FilterChips items={categories} value={category} onChange={onCategoryChange} />
      {selectedIds.length > 0 && (
        <div className="batch-toolbar">
          <div className="batch-toolbar-info">
            <span className="batch-toolbar-text">已选 {selectedIds.length} 项</span>
            <span className="batch-toolbar-clear" onClick={onSelectionClear}>
              取消
            </span>
          </div>
          <div className="batch-toolbar-actions">
            <button className="batch-btn batch-btn-use" onClick={onBatchUse}>
              批量使用
            </button>
            <button className="batch-btn batch-btn-scrap" onClick={onBatchScrap}>
              批量废弃
            </button>
            <button className="batch-btn batch-btn-reprint" onClick={onBatchReprint}>
              批量补打
            </button>
          </div>
        </div>
      )}
      {items.map((item) => (
        <OpenedOperationCard
          key={item.id}
          item={item}
          checked={selectedIds.includes(item.id)}
          onToggle={() => onToggle(item.id)}
          onUse={onUse}
          onScrap={onScrap}
          onReprint={onReprint}
        />
      ))}
    </>
  );
}
