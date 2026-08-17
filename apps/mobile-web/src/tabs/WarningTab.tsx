import { ErrorBlock, SearchBar } from 'antd-mobile';
import type { CheckItem } from '@imsfe/organization-selector';
import { useState } from 'react';
import { FilterChips, OpenedCard } from '@/components/MobileViews';
import OrganizationPicker from '@/components/OrganizationPicker';
import type { OpenedMaterial } from '@/types';

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
  const [organizations, setOrganizations] = useState<CheckItem[]>([]);

  return (
    <>
      <div className="search-box warning-search-box">
        <SearchBar value={keyword} onChange={onKeywordChange} placeholder="搜索物料名称/编码" />
        <OrganizationPicker value={organizations} onChange={setOrganizations} />
      </div>
      <FilterChips
        items={['all', 'warning', 'expired']}
        labels={{
          all: '全部',
          warning: (
            <span className="warning-filter-label">
              即将过期<span className="warning-filter-badge">0</span>
            </span>
          ),
          expired: (
            <span className="warning-filter-label">
              已过期<span className="warning-filter-badge">0</span>
            </span>
          )
        }}
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
