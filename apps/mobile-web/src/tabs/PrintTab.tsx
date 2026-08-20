import { SearchBar } from 'antd-mobile';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { apiSend } from '@/api';
import { BatchPrintPopup, FilterChips, MaterialPrintCard, PrintDetail } from '@/components/MobileViews';
import OrganizationPicker from '@/components/OrganizationPicker';
import { addLife, labelMaterialType, toggleId } from '@/materialUtils';
import { usePrintTabStore } from '@/stores/printTabStore';
import type { Material, PrinterController, ShowNotice } from '@/types';

export type PrintTabHandle = { closeDetail: () => void };

type Props = {
  printer: React.RefObject<PrinterController | null>;
  showNotice: ShowNotice;
  onDetailChange: (open: boolean) => void;
  onSelectionChange: (count: number) => void;
};

const PrintTab = forwardRef<PrintTabHandle, Props>(function PrintTab(
  { printer, showNotice, onDetailChange, onSelectionChange },
  ref
) {
  const {
    materials,
    keyword,
    category,
    selectedIds,
    detailMaterial,
    quantity,
    organizations,
    refresh,
    setKeyword,
    setCategory,
    setSelectedIds,
    setDetailMaterial,
    setQuantity,
    setOrganizations
  } = usePrintTabStore();
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchQuantities, setBatchQuantities] = useState<Record<number, number>>({});

  const categories = useMemo(() => ['all', ...new Set(materials.map((item) => item.category))], [materials]);
  const filteredMaterials = useMemo(
    () =>
      materials.filter((item) => {
        const keywordHit = !keyword || item.name.includes(keyword) || item.code.includes(keyword);
        return item.status === 'enabled' && keywordHit && (category === 'all' || item.category === category);
      }),
    [materials, keyword, category]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => onDetailChange(Boolean(detailMaterial)), [detailMaterial, onDetailChange]);
  useEffect(() => onSelectionChange(selectedIds.length), [selectedIds.length, onSelectionChange]);
  useImperativeHandle(ref, () => ({ closeDetail: () => setDetailMaterial(null) }), []);

  function openDetail(material: Material) {
    setDetailMaterial(material);
    setQuantity(1);
  }

  async function printMaterial(material: Material, copies: number) {
    const printedAt = new Date();
    const sent = await printer.current?.printLabels([
      {
        materialName: material.name,
        materialType: labelMaterialType(material),
        printedAt: printedAt.toISOString(),
        expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(),
        copies
      }
    ]);
    if (!sent) return false;
    await apiSend('/api/labels/print', 'POST', { materialId: material.id, printCount: copies });
    showNotice('打印成功');
    return true;
  }

  async function confirmPrint() {
    if (!detailMaterial) return;
    if (!quantity || quantity < 1) {
      showNotice('请输入有效的打印数量', 'warning');
      return;
    }
    if (await printMaterial(detailMaterial, quantity)) setDetailMaterial(null);
  }

  function openBatch() {
    setBatchQuantities((values) => Object.fromEntries(selectedIds.map((id) => [id, values[id] || 1])));
    setBatchOpen(true);
  }

  async function batchPrint() {
    const rows = materials.filter((item) => selectedIds.includes(item.id));
    if (!rows.length) return;
    const printedAt = new Date();
    const sent = await printer.current?.printLabels(
      rows.map((material) => ({
        materialName: material.name,
        materialType: labelMaterialType(material),
        printedAt: printedAt.toISOString(),
        expiresAt: addLife(printedAt, material.openedLifeValue, material.openedLifeUnit).toISOString(),
        copies: batchQuantities[material.id] || 1
      }))
    );
    if (!sent) return;
    for (const material of rows) {
      await apiSend('/api/labels/print', 'POST', {
        materialId: material.id,
        printCount: batchQuantities[material.id] || 1
      });
    }
    setSelectedIds([]);
    setBatchOpen(false);
    setBatchQuantities({});
    showNotice('批量打印成功');
  }

  function toggleBatchMaterial(id: number) {
    const next = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
    setSelectedIds(next);
    if (!next.length) setBatchOpen(false);
  }

  if (detailMaterial) {
    return (
      <PrintDetail
        material={detailMaterial}
        quantity={quantity}
        onQuantityChange={setQuantity}
        onPrint={() => void confirmPrint()}
      />
    );
  }

  return (
    <>
      <div className="search-box warning-search-box">
        <SearchBar value={keyword} onChange={setKeyword} placeholder="搜索物料名称/编码" />
        <OrganizationPicker value={organizations} onChange={setOrganizations} />
      </div>
      <FilterChips items={categories} value={category} onChange={setCategory} />
      <section className="card">
        <div className="card-title">
          <span>物料列表</span>
          <span className="card-count">共 {filteredMaterials.length} 条</span>
        </div>
        <div className="item-list">
          {filteredMaterials.map((item) => (
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
        onPrint={() => void batchPrint()}
      />
    </>
  );
});

export default PrintTab;
