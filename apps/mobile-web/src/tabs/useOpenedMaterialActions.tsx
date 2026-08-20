import { useState, type ReactNode } from 'react';
import { apiSend } from '@/api';
import { BatchOperationPopup, ScrapPopup, UsePopup } from '@/components/MobileViews';
import { labelMaterialType } from '@/materialUtils';
import type { OpenedMaterial, PrinterController, RequestConfirm, ShowNotice } from '@/types';

type Action = 'use' | 'scrap';

export function useOpenedMaterialActions({
  items,
  printer,
  showNotice,
  requestConfirm,
  reload,
  onBatchComplete
}: {
  items: OpenedMaterial[];
  printer: React.RefObject<PrinterController | null>;
  showNotice: ShowNotice;
  requestConfirm: RequestConfirm;
  reload: () => Promise<void>;
  onBatchComplete?: () => void;
}) {
  const [current, setCurrent] = useState<OpenedMaterial | null>(null);
  const [useOpen, setUseOpen] = useState(false);
  const [useQuantity, setUseQuantity] = useState('1');
  const [scrapOpen, setScrapOpen] = useState(false);
  const [scrapQuantity, setScrapQuantity] = useState('1');
  const [scrapRemark, setScrapRemark] = useState('');
  const [batchAction, setBatchAction] = useState<Action | null>(null);
  const [batchItems, setBatchItems] = useState<OpenedMaterial[]>([]);
  const [batchQuantities, setBatchQuantities] = useState<Record<number, string>>({});

  function openUse(item: OpenedMaterial) {
    if (item.computedStatus === 'expired') {
      showNotice('已过期物料不能使用，仅可废弃', 'warning');
      return;
    }
    setCurrent(item);
    setUseQuantity('1');
    setUseOpen(true);
  }

  async function confirmUse() {
    if (!current) return;
    const quantity = Number(useQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      showNotice('请输入有效的使用数量', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认使用',
      content: t('确定要使用“{name}”吗？使用数量：{quantity}{unit}', {
        name: current.material.name,
        quantity,
        unit: current.material.unit
      }),
      confirmText: '确认使用'
    });
    if (!ok) return;
    await apiSend(`/api/opened-materials/${current.id}/use`, 'POST', { quantity });
    setUseOpen(false);
    setCurrent(null);
    showNotice('使用成功');
    await reload();
  }

  function openScrap(item: OpenedMaterial) {
    setCurrent(item);
    setScrapQuantity('1');
    setScrapRemark('');
    setScrapOpen(true);
  }

  async function confirmScrap() {
    if (!current) return;
    const quantity = Number(scrapQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showNotice('请输入有效的废弃数量', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认废弃',
      content: t('确定要废弃“{name}”吗？废弃数量：{quantity}{unit}', {
        name: current.material.name,
        quantity,
        unit: current.material.unit
      }),
      confirmText: '确认废弃'
    });
    if (!ok) return;
    await apiSend(`/api/opened-materials/${current.id}/scrap`, 'POST', { quantity, remark: scrapRemark });
    setScrapOpen(false);
    setCurrent(null);
    showNotice('废弃成功');
    await reload();
  }

  async function reprint(item: OpenedMaterial) {
    if (item.computedStatus === 'expired') {
      showNotice('已过期物料不能补打标签，仅可废弃', 'warning');
      return;
    }
    const ok = await requestConfirm({
      title: '确认补打',
      content: t('确定要补打“{name}”的标签吗？默认补打 1 张。', { name: item.material.name }),
      confirmText: '确认补打'
    });
    if (!ok) return;
    const sent = await printer.current?.printLabels([
      {
        materialName: item.material.name,
        materialType: labelMaterialType(item.material),
        printedAt: new Date().toISOString(),
        expiresAt: item.expiresAt,
        copies: 1
      }
    ]);
    if (!sent) return;
    await apiSend(`/api/opened-materials/${item.id}/reprint`, 'POST');
    showNotice('补打成功');
    await reload();
  }

  function openBatch(action: Action, selectedIds: number[]) {
    const rows = items.filter((item) => selectedIds.includes(item.id));
    if (!rows.length) {
      showNotice('请先选择物料', 'warning');
      return;
    }
    if (action === 'use' && rows.some((item) => item.computedStatus === 'expired')) {
      showNotice('已过期物料不能使用，仅可废弃', 'warning');
      return;
    }
    setBatchAction(action);
    setBatchItems(rows);
    setBatchQuantities(Object.fromEntries(rows.map((item) => [item.id, '1'])));
  }

  async function confirmBatch() {
    if (!batchAction || !batchItems.length) return false;
    const payload = batchItems.map((item) => ({ id: item.id, quantity: Number(batchQuantities[item.id]) }));
    if (payload.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
      showNotice(batchAction === 'use' ? '请输入有效的使用数量' : '请输入有效的废弃数量', 'warning');
      return false;
    }
    const ok = await requestConfirm(
      batchAction === 'use'
        ? {
            title: '确认批量使用',
            content: t('确定要批量使用已选择的 {count} 个物料吗？已按填写数量执行。', { count: payload.length }),
            confirmText: '确认使用'
          }
        : {
            title: '确认批量废弃',
            content: t('确定要批量废弃已选择的 {count} 个物料吗？已按填写数量执行。', { count: payload.length }),
            confirmText: '确认废弃'
          }
    );
    if (!ok) return false;
    await apiSend(`/api/opened-materials/batch-${batchAction}`, 'POST', {
      items: payload.map((item) => ({ ...item, ...(batchAction === 'scrap' ? { remark: '批量废弃' } : {}) }))
    });
    showNotice(batchAction === 'use' ? '批量使用成功' : '批量废弃成功');
    setBatchAction(null);
    setBatchItems([]);
    setBatchQuantities({});
    onBatchComplete?.();
    await reload();
    return true;
  }

  async function batchReprint(selectedIds: number[]) {
    const rows = items.filter((item) => selectedIds.includes(item.id));
    if (!rows.length) {
      showNotice('请先选择物料', 'warning');
      return false;
    }
    if (rows.some((item) => item.computedStatus === 'expired')) {
      showNotice('已过期物料不能补打标签，仅可废弃', 'warning');
      return false;
    }
    const ok = await requestConfirm({
      title: '确认批量补打',
      content: t('确定要批量补打已选择的 {count} 个物料标签吗？每个物料默认补打 1 张。', { count: rows.length }),
      confirmText: '确认补打'
    });
    if (!ok) return false;
    const sent = await printer.current?.printLabels(
      rows.map((item) => ({
        materialName: item.material.name,
        materialType: labelMaterialType(item.material),
        printedAt: new Date().toISOString(),
        expiresAt: item.expiresAt,
        copies: 1
      }))
    );
    if (!sent) return false;
    for (const item of rows) await apiSend(`/api/opened-materials/${item.id}/reprint`, 'POST');
    showNotice('批量补打成功');
    await reload();
    return true;
  }

  const popups: ReactNode = (
    <>
      <ScrapPopup
        visible={scrapOpen}
        item={current}
        quantity={scrapQuantity}
        remark={scrapRemark}
        onQuantityChange={setScrapQuantity}
        onRemarkChange={setScrapRemark}
        onClose={() => setScrapOpen(false)}
        onConfirm={() => void confirmScrap()}
      />
      <UsePopup
        visible={useOpen}
        item={current}
        quantity={useQuantity}
        onQuantityChange={setUseQuantity}
        onClose={() => setUseOpen(false)}
        onConfirm={() => void confirmUse()}
      />
      <BatchOperationPopup
        visible={batchAction !== null}
        action={batchAction || 'use'}
        items={batchItems}
        quantities={batchQuantities}
        onQuantityChange={(id, value) => setBatchQuantities((values) => ({ ...values, [id]: value }))}
        onClose={() => setBatchAction(null)}
        onConfirm={() => void confirmBatch()}
      />
    </>
  );

  return { openUse, openScrap, reprint, openBatch, confirmBatch, batchReprint, popups };
}
