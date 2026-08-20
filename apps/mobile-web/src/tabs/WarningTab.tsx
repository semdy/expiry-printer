import { ErrorBlock, SearchBar } from 'antd-mobile'
import { useEffect, useMemo, useRef } from 'react'
import { FilterChips, OpenedCard } from '@/components/MobileViews'
import OrganizationPicker from '@/components/OrganizationPicker'
import { useWarningTabStore } from '@/stores/warningTabStore'
import { useOpenedMaterialActions, type OpenedMaterialActionApi } from '@/tabs/useOpenedMaterialActions'
import type { PrinterController, RequestConfirm, ShowNotice } from '@/types'
import { batchScrapOpenedApi, batchUseOpenedApi, reprintLabelApi } from 'ims-data/api/expiryPrint'

type Props = {
  printer: React.RefObject<PrinterController | null>
  showNotice: ShowNotice
  requestConfirm: RequestConfirm
}

const warningActionApi: OpenedMaterialActionApi = {
  use: (items) => batchUseOpenedApi({ items }),
  scrap: (items, remark) => batchScrapOpenedApi({ items, remark }),
  reprint: (openedMaterialId) => reprintLabelApi({ openedMaterialId })
}

export default function WarningTab({ printer, showNotice, requestConfirm }: Props) {
  const {
    items,
    categories,
    loaded,
    loading,
    loadingMore,
    page,
    total,
    hasMore,
    keyword,
    categoryId,
    status,
    organizations,
    refresh,
    loadNextPage,
    loadCategories,
    setKeyword,
    setCategoryId,
    setStatus,
    setOrganizations
  } = useWarningTabStore()
  const actions = useOpenedMaterialActions({
    items,
    printer,
    showNotice,
    requestConfirm,
    reload: refresh,
    actionApi: warningActionApi
  })
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const previousKeyword = useRef(keyword)
  const categoryIds = useMemo(() => ['all', ...categories.map((item) => item.id)], [categories])
  const categoryLabels = useMemo(() => Object.fromEntries(categories.map((item) => [item.id, item.name])), [categories])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    void refresh()
  }, [categoryId, status, organizations, refresh])

  useEffect(() => {
    if (previousKeyword.current === keyword) return
    previousKeyword.current = keyword
    const timer = window.setTimeout(() => void refresh(), 300)
    return () => window.clearTimeout(timer)
  }, [keyword, refresh])

  useEffect(() => {
    if (!loadMoreRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadNextPage()
      },
      { rootMargin: '160px 0px' }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [loadNextPage])

  return (
    <>
      <div className="search-box warning-search-box">
        <SearchBar value={keyword} onChange={setKeyword} placeholder="搜索物料名称/编码" />
        <OrganizationPicker value={organizations} onChange={setOrganizations} />
      </div>
      <FilterChips items={categoryIds} labels={categoryLabels} value={categoryId} onChange={setCategoryId} />
      <FilterChips
        items={['all', 'warning', 'expired']}
        labels={{ all: '全部', warning: '即将过期', expired: '已过期' }}
        value={status}
        onChange={setStatus}
      />
      <section className="card">
        <div className="card-title">
          <span>预警列表</span>
          <span className="card-count">共 {total} 条</span>
        </div>
        <div className="item-list">
          {items.map((item) => (
            <OpenedCard
              key={item.id}
              item={item}
              onUse={actions.openUse}
              onScrap={actions.openScrap}
              onReprint={actions.reprint}
            />
          ))}
        </div>
        {loaded && !loading && items.length === 0 && <ErrorBlock status="empty" />}
      </section>
      <div ref={loadMoreRef} className="load-more-status">
        {loading || loadingMore
          ? '加载中…'
          : hasMore
            ? '继续上滑加载更多'
            : loaded && items.length > 0 && page > 1
              ? '没有更多了'
              : ''}
      </div>
      {actions.popups}
    </>
  )
}
