import { ErrorBlock, SearchBar } from 'antd-mobile';
import OrganizationSelector, { SCREEN, Modal, type CheckItem, type DataProviderRef } from '@imsfe/organization-selector'
import { FilterChips, OpenedCard } from '../components/MobileViews';
import type { OpenedMaterial } from '../types';
import { useRef, useState } from 'react';
import LocaleWrapper from 'shared/i18n/LocaleWrapper'

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
  const orgModalRef = useRef<DataProviderRef>(null)
  const [orgModalVisible, setOrgModalVisible] = useState(false)
  const [orgCheckList, setOrgCheckList] = useState<CheckItem[]>([])
  const [orgConfig] = useState({
    showHomeSearch: false,
    showOrgEntry: false,
    showGroupEntry: false,
    showRecentContacts: false,
    canSelectRegion: true,
    canSelectShop: true,
    canSelectMember: false,
    showNoShop: false,
    initialScreen: SCREEN.SHOP
  })

  const handleConfirm = (list: CheckItem[] | CheckItem) => {
    setOrgModalVisible(prev => !prev)
    console.log(list)
    setOrgCheckList(list as CheckItem[])
  }

  const handleVisibleChange = (visible: boolean) => {
    if (visible) {
      orgModalRef.current?.setDefault(orgCheckList)
    }
  }

  return (
    <>
      <div className="search-box">
        <SearchBar value={keyword} onChange={onKeywordChange} placeholder="搜索物料名称/编码" />
        <button onClick={() => setOrgModalVisible(true)}>+</button>
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
      <LocaleWrapper>
        <Modal
          ref={orgModalRef}
          visible={orgModalVisible}
          config={orgConfig}
          onCancel={() => setOrgModalVisible(false)}
          onConfirm={handleConfirm}
          onVisibleChange={handleVisibleChange}
        >
          <OrganizationSelector />
        </Modal>
      </LocaleWrapper>
    </>
  );
}
