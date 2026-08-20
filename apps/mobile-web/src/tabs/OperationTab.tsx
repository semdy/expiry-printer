import { ErrorBlock, SearchBar } from 'antd-mobile'
import { useEffect, useMemo, useRef } from 'react'
import { FilterChips, OpenedOperationCard } from '@/components/MobileViews'
import OrganizationPicker from '@/components/OrganizationPicker'
import { toggleId } from '@/materialUtils'
import { useOperationTabStore } from '@/stores/operationTabStore'
import { useOpenedMaterialActions, type OpenedMaterialActionApi } from '@/tabs/useOpenedMaterialActions'
import type { PrinterController, RequestConfirm, ShowNotice } from '@/types'
import { batchScrapOpenedApi, batchUseOpenedApi, reprintLabelApi } from 'ims-data/api/expiryPrint'

type Props = {
  printer: React.RefObject<PrinterController | null>
  showNotice: ShowNotice
  requestConfirm: RequestConfirm
}

const operationActionApi: OpenedMaterialActionApi = {
  use: (items) => batchUseOpenedApi({ items }),
  scrap: (items, remark) => batchScrapOpenedApi({ items, remark }),
  reprint: (openedMaterialId) => reprintLabelApi({ openedMaterialId })
}

export default function OperationTab({ printer, showNotice, requestConfirm }: Props) {
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
    selectedIds,
    organizations,
    refresh,
    loadNextPage,
    loadCategories,
    setKeyword,
    setCategoryId,
    setSelectedIds,
    setOrganizations
  } = useOperationTabStore()
  const actions = useOpenedMaterialActions({
    items,
    printer,
    showNotice,
    requestConfirm,
    reload: refresh,
    onBatchComplete: () => setSelectedIds([]),
    actionApi: operationActionApi
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
  }, [categoryId, organizations, refresh])

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
      {selectedIds.length > 0 && (
        <div className="batch-toolbar">
          <div className="batch-toolbar-info">
            <span className="batch-toolbar-text">{t('已选 {count} 项', { count: selectedIds.length })}</span>
            <span className="batch-toolbar-clear" onClick={() => setSelectedIds([])}>
              取消
            </span>
          </div>
          <div className="batch-toolbar-actions">
            <button className="batch-btn batch-btn-use" onClick={() => actions.openBatch('use', selectedIds)}>
              批量使用
            </button>
            <button className="batch-btn batch-btn-scrap" onClick={() => actions.openBatch('scrap', selectedIds)}>
              批量废弃
            </button>
            <button
              className="batch-btn batch-btn-reprint"
              onClick={() => void actions.batchReprint(selectedIds).then((ok) => ok && setSelectedIds([]))}
            >
              批量补打
            </button>
          </div>
        </div>
      )}
      <div className="card-title">
        <span>物料列表</span>
        <span className="card-count">共 {total} 条</span>
      </div>
      <div>
        {items.map((item) => (
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
      </div>
      {loaded && !loading && items.length === 0 && <ErrorBlock status="empty" />}
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
