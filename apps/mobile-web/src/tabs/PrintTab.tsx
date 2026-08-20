import { SearchBar } from 'antd-mobile'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { BatchPrintPopup, FilterChips, MaterialPrintCard, PrintDetail } from '@/components/MobileViews'
import OrganizationPicker from '@/components/OrganizationPicker'
import { addLife, labelMaterialType, toggleId } from '@/materialUtils'
import { usePrintTabStore } from '@/stores/printTabStore'
import type { PrintMaterial, PrinterController, ShowNotice } from '@/types'
import { printLabelApi } from 'ims-data/api/expiryPrint'

export type PrintTabHandle = { closeDetail: () => void }

type Props = {
  printer: React.RefObject<PrinterController | null>
  showNotice: ShowNotice
  onDetailChange: (open: boolean) => void
  onSelectionChange: (count: number) => void
}

const PrintTab = forwardRef<PrintTabHandle, Props>(function PrintTab(
  { printer, showNotice, onDetailChange, onSelectionChange },
  ref
) {
  const {
    materials,
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
    detailMaterial,
    quantity,
    organizations,
    refresh,
    loadNextPage,
    loadCategories,
    setKeyword,
    setCategoryId,
    setSelectedIds,
    setDetailMaterial,
    setQuantity,
    setOrganizations
  } = usePrintTabStore()
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchQuantities, setBatchQuantities] = useState<Record<string, number>>({})
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
    if (detailMaterial || !loadMoreRef.current) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void loadNextPage()
      },
      { rootMargin: '160px 0px' }
    )
    observer.observe(loadMoreRef.current)
    return () => observer.disconnect()
  }, [detailMaterial, loadNextPage])

  useEffect(() => onDetailChange(Boolean(detailMaterial)), [detailMaterial, onDetailChange])

  useEffect(() => onSelectionChange(selectedIds.length), [selectedIds.length, onSelectionChange])

  useImperativeHandle(ref, () => ({ closeDetail: () => setDetailMaterial(null) }), [])

  function openDetail(material: PrintMaterial) {
    setDetailMaterial(material)
    setQuantity(1)
  }

  async function printMaterial(material: PrintMaterial, copies: number) {
    const printedAt = new Date()
    const sent = await printer.current?.printLabels([
      {
        materialName: material.name,
        materialType: labelMaterialType(material),
        printedAt: printedAt.toISOString(),
        expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(),
        copies
      }
    ])
    if (!sent) return false
    await printLabelApi({ items: [{ materialId: material.id, printCount: copies }] })
    showNotice('打印成功')
    return true
  }

  async function confirmPrint() {
    if (!detailMaterial) return
    if (!quantity || quantity < 1) {
      showNotice('请输入有效的打印数量', 'warning')
      return
    }
    if (await printMaterial(detailMaterial, quantity)) {
      setDetailMaterial(null)
    }
  }

  function openBatch() {
    setBatchQuantities((values) => Object.fromEntries(selectedIds.map((id) => [id, values[id] || 1])))
    setBatchOpen(true)
  }

  async function batchPrint() {
    const rows = materials.filter((item) => selectedIds.includes(item.id))
    if (!rows.length) return
    const printedAt = new Date()
    const sent = await printer.current?.printLabels(
      rows.map((material) => ({
        materialName: material.name,
        materialType: labelMaterialType(material),
        printedAt: printedAt.toISOString(),
        expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(),
        copies: batchQuantities[material.id] || 1
      }))
    )
    if (!sent) return
    await printLabelApi({
      items: rows.map((material) => ({
        materialId: material.id,
        printCount: batchQuantities[material.id] || 1
      }))
    })
    setSelectedIds([])
    setBatchOpen(false)
    setBatchQuantities({})
    showNotice('批量打印成功')
  }

  function toggleBatchMaterial(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]
    setSelectedIds(next)
    if (!next.length) setBatchOpen(false)
  }

  if (detailMaterial) {
    return (
      <PrintDetail
        material={detailMaterial}
        quantity={quantity}
        onQuantityChange={setQuantity}
        onPrint={confirmPrint}
      />
    )
  }

  return (
    <>
      <div className="search-box warning-search-box">
        <SearchBar value={keyword} onChange={setKeyword} placeholder="搜索物料名称/编码" />
        <OrganizationPicker value={organizations} onChange={setOrganizations} />
      </div>
      <FilterChips items={categoryIds} labels={categoryLabels} value={categoryId} onChange={setCategoryId} />
      <section className="card">
        <div className="card-title">
          <span>物料列表</span>
          <span className="card-count">共 {total} 条</span>
        </div>
        <div className="item-list">
          {materials.map((item) => (
            <MaterialPrintCard
              key={item.id}
              item={item}
              checked={selectedIds.includes(item.id)}
              onToggle={() => toggleId(selectedIds, setSelectedIds, item.id)}
              onPrint={() => openDetail(item)}
            />
          ))}
        </div>
      </section>
      <div ref={loadMoreRef} className="load-more-status">
        {loading || loadingMore
          ? '加载中…'
          : hasMore
            ? '继续上滑加载更多'
            : loaded && materials.length > 0 && page > 1
              ? '没有更多了'
              : loaded && materials.length === 0
                ? '暂无物料'
                : ''}
      </div>
      {selectedIds.length > 0 && (
        <div className="print-batch-bar">
          <div className="print-batch-info">
            <span className="print-batch-count">{t('已选 {count} 项', { count: selectedIds.length })}</span>
            <button className="print-batch-clear" onClick={() => setSelectedIds([])}>
              取消
            </button>
          </div>
          <button className="print-batch-btn" onClick={openBatch}>
            批量打印
          </button>
        </div>
      )}
      <BatchPrintPopup
        visible={batchOpen}
        materials={materials.filter((item) => selectedIds.includes(item.id))}
        quantities={batchQuantities}
        onClose={() => setBatchOpen(false)}
        onToggle={toggleBatchMaterial}
        onQuantityChange={(id, value) =>
          setBatchQuantities((values) => ({ ...values, [id]: Math.min(99, Math.max(1, value)) }))
        }
        onPrint={batchPrint}
      />
    </>
  )
})

export default PrintTab
