import { useRef, useState } from 'react'
import OrganizationSelector, { SCREEN, Modal, type CheckItem, type DataProviderRef } from '@imsfe/organization-selector'
import IconOrg from '@/assets/svgs/org.svg?react'

type OrganizationPickerProps = {
  value: CheckItem[]
  onChange: (value: CheckItem[]) => void
  className?: string
}

const organizationConfig = {
  showHomeSearch: false,
  showOrgEntry: false,
  showGroupEntry: false,
  showRecentContacts: false,
  canSelectRegion: true,
  canSelectShop: true,
  canSelectMember: false,
  showNoShop: false,
  singleSelect: true,
  initialScreen: SCREEN.SHOP
}

export default function OrganizationPicker({ value, onChange, className = '' }: OrganizationPickerProps) {
  const modalRef = useRef<DataProviderRef>(null)
  const [visible, setVisible] = useState(false)
  const count = value.length

  const handleConfirm = (list: CheckItem[] | CheckItem) => {
    onChange(Array.isArray(list) ? list : [list])
    setVisible(false)
  }

  const handleVisibleChange = (nextVisible: boolean) => {
    if (nextVisible) modalRef.current?.setDefault(value)
  }

  return (
    <div className={`org-selector${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className={`org-selector-btn${count ? ' is-selected' : ''}`}
        onClick={() => setVisible(true)}
        aria-label={count ? `组织架构，已选 ${count} 项` : '选择组织架构'}
      >
        <span className="org-selector-icon" aria-hidden="true">
          <IconOrg />
        </span>
        <span className="org-selector-copy">
          <span className="org-selector-title">组织架构</span>
          <span className="org-selector-hint">{count ? `已选 ${count} 项` : '选择门店'}</span>
        </span>
        <span className="org-selector-chevron" aria-hidden="true">
          ›
        </span>
      </button>
      <Modal
        ref={modalRef}
        visible={visible}
        config={organizationConfig}
        onCancel={() => setVisible(false)}
        onConfirm={handleConfirm}
        onVisibleChange={handleVisibleChange}
      >
        <OrganizationSelector />
      </Modal>
    </div>
  )
}
