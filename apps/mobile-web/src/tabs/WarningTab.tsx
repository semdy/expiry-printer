import { ErrorBlock, SearchBar } from 'antd-mobile';
import { FilterChips, OpenedCard } from '../components/MobileViews';
import type { OpenedMaterial } from '../types';

type WarningTabProps = {
  items: OpenedMaterial[];
  keyword: string;
  status: string;
  onKeywordChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onUse: (item: OpenedMaterial) => void;
  onScrap: (item: OpenedMaterial) => void;
  onReprint: (item: OpenedMaterial) => void;
};

export default function WarningTab({
  items,
  keyword,
  status,
  onKeywordChange,
  onStatusChange,
  onUse,
  onScrap,
  onReprint
}: WarningTabProps) {
  return (
    <>
      <div className="search-box">
        <SearchBar value={keyword} onChange={onKeywordChange} placeholder="搜索物料名称/编码" />
      </div>
      <FilterChips
        items={['all', 'warning', 'expired']}
        labels={{ all: '全部', warning: '即将过期', expired: '已过期' }}
        value={status}
        onChange={onStatusChange}
      />
      {items.length ? (
        items.map((item) => (
          <OpenedCard key={item.id} item={item} onUse={onUse} onScrap={onScrap} onReprint={onReprint} />
        ))
      ) : (
        <ErrorBlock status="empty" />
      )}
    </>
  );
}
