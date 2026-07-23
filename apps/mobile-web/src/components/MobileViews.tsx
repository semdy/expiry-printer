import { Popup, Stepper } from 'antd-mobile';
import { addLife, formatDate, statusText, unitText } from '../materialUtils';
import type { Material, OpenedMaterial } from '../types';

function FilterChips({
  items,
  value,
  onChange,
  labels = {}
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  labels?: Record<string, string>;
}) {
  return (
    <div className="filter-row">
      {items.map((item) => (
        <button key={item} className={`filter-chip ${value === item ? 'active' : ''}`} onClick={() => onChange(item)}>
          {labels[item] || (item === 'all' ? '全部' : item)}
        </button>
      ))}
    </div>
  );
}

function MaterialPrintCard({
  item,
  checked,
  onToggle,
  onPrint
}: {
  item: Material;
  checked: boolean;
  onToggle: () => void;
  onPrint: () => void;
}) {
  return (
    <div className="item-row">
      <label className="row-check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </label>
      <div className="item-info">
        <div className="item-name">{item.name}</div>
        <div className="item-desc">
          编码: {item.code} | {item.type} | 开封效期: {item.openedLifeValue}
          {unitText(item.openedLifeUnit)}
        </div>
      </div>
      <div className="item-action">
        <button className="action-btn action-btn-primary" onClick={onPrint}>
          📄
        </button>
      </div>
    </div>
  );
}

function PrintDetail({
  material,
  quantity,
  onQuantityChange,
  onPrint
}: {
  material: Material;
  quantity: number;
  onQuantityChange: (value: number) => void;
  onPrint: () => void;
}) {
  const openedAt = new Date();
  const expiresAt = addLife(openedAt, material.openedLifeValue, material.openedLifeUnit);

  return (
    <div className="print-detail">
      <section className="detail-card">
        <div className="detail-title">物料信息</div>
        <InfoRow label="物料名称" value={material.name} />
        <InfoRow label="物料编码" value={material.code} />
        <InfoRow label="物料分类" value={material.category} />
        <InfoRow label="物料类型" value={material.type} />
        <InfoRow label="规格单位" value={material.unit} />
        <InfoRow label="开封效期" value={`${material.openedLifeValue}${unitText(material.openedLifeUnit)}`} />
      </section>

      <section className="label-preview-card">
        <div className="label-preview-title">效期标签预览</div>
        <div className="label-preview">
          <div className="label-name">{material.name}</div>
          <div className="label-code">{material.code}</div>
          <div className="label-grid">
            <span>开封时间</span>
            <strong>{formatDate(openedAt.toISOString())}</strong>
            <span>到期时间</span>
            <strong>{formatDate(expiresAt.toISOString())}</strong>
            <span>操作人</span>
            <strong>默认用户</strong>
          </div>
        </div>
      </section>

      <section className="detail-card">
        <div className="quantity-row">
          <div>
            <div className="quantity-title">打印数量</div>
            <div className="quantity-desc">选择本次需要打印的标签张数</div>
          </div>
          <Stepper value={quantity} min={1} max={99} onChange={(value) => onQuantityChange(Number(value))} />
        </div>
      </section>

      <button className="btn btn-primary" onClick={onPrint}>
        确认打印
      </button>
    </div>
  );
}

function BatchPrintPopup({
  visible,
  materials,
  quantities,
  onClose,
  onToggle,
  onQuantityChange,
  onPrint
}: {
  visible: boolean;
  materials: Material[];
  quantities: Record<number, number>;
  onClose: () => void;
  onToggle: (id: number) => void;
  onQuantityChange: (id: number, value: number) => void;
  onPrint: () => void;
}) {
  return (
    <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ borderRadius: '8px 8px 0 0', padding: 0 }}>
      <div className="batch-print-modal">
        <div className="modal-header">
          <div className="modal-title">批量打印</div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="form-label">选择物料并设置数量</div>
          <div className="batch-print-list">
            {materials.map((item) => {
              const quantity = quantities[item.id] || 1;
              return (
                <div className="batch-print-item" key={item.id}>
                  <label className="batch-checkbox">
                    <input type="checkbox" checked onChange={() => onToggle(item.id)} />
                  </label>
                  <div className="batch-info">
                    <div className="batch-name">{item.name}</div>
                    <div className="batch-desc">{item.code}</div>
                  </div>
                  <div className="batch-count">
                    <button className="count-btn-sm" onClick={() => onQuantityChange(item.id, quantity - 1)}>
                      -
                    </button>
                    <span className="count-value-sm">{quantity}</span>
                    <button className="count-btn-sm" onClick={() => onQuantityChange(item.id, quantity + 1)}>
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onPrint}>
            批量打印
          </button>
        </div>
      </div>
    </Popup>
  );
}

function ScrapPopup({
  visible,
  item,
  quantity,
  remark,
  onQuantityChange,
  onRemarkChange,
  onClose,
  onConfirm
}: {
  visible: boolean;
  item: OpenedMaterial | null;
  quantity: string;
  remark: string;
  onQuantityChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Popup visible={visible} onMaskClick={onClose} bodyStyle={{ borderRadius: '8px 8px 0 0', padding: 0 }}>
      <div className="scrap-popup">
        <div className="modal-header">
          <div className="modal-title">物料废弃</div>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="material-desc">{item ? `${item.material.name} ${item.material.code}` : ''}</div>
          <label className="scrap-field">
            <span className="form-label">废弃数量</span>
            <div className="scrap-quantity-row">
              <input
                className="scrap-input"
                name="scrapQuantity"
                inputMode="decimal"
                min="1"
                type="number"
                value={quantity}
                onChange={(event) => onQuantityChange(event.target.value)}
              />
              <span className="scrap-unit">{item?.material.unit || ''}</span>
            </div>
          </label>
          <label className="scrap-field">
            <span className="form-label">备注</span>
            <textarea
              className="scrap-textarea"
              value={remark}
              onChange={(event) => onRemarkChange(event.target.value)}
              placeholder="请输入废弃原因"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onConfirm}>
            确认废弃
          </button>
        </div>
      </div>
    </Popup>
  );
}

function OpenedCard({
  item,
  onUse,
  onScrap,
  onReprint
}: {
  item: OpenedMaterial;
  onUse: (item: OpenedMaterial) => void;
  onScrap: (item: OpenedMaterial) => void;
  onReprint: (item: OpenedMaterial) => void;
}) {
  return (
    <div className="item-row warning-row">
      <div className="item-info">
        <div className="item-name-line">
          <span className="item-name">{item.material.name}</span>
          <span className={`status-tag status-${item.computedStatus}`}>{statusText(item.computedStatus)}</span>
        </div>
        <div className="item-desc">
          编码: {item.material.code} | {item.material.category} | {item.material.type}
        </div>
        <div className="item-desc">开封时间: {formatDate(item.openedAt)}</div>
        <div className="item-desc">剩余时间: {item.remainingText}</div>
        <div className="row-actions">
          <button
            className="mini-btn mini-btn-use"
            disabled={item.computedStatus === 'expired'}
            onClick={() => onUse(item)}
          >
            使用
          </button>
          <button className="mini-btn mini-btn-scrap" onClick={() => onScrap(item)}>
            废弃
          </button>
          <button
            className="mini-btn mini-btn-reprint"
            disabled={item.computedStatus === 'expired'}
            onClick={() => onReprint(item)}
          >
            补打
          </button>
        </div>
      </div>
    </div>
  );
}

function OpenedOperationCard({
  item,
  checked,
  onToggle,
  onUse,
  onScrap,
  onReprint
}: {
  item: OpenedMaterial;
  checked: boolean;
  onToggle: () => void;
  onUse: (item: OpenedMaterial) => void;
  onScrap: (item: OpenedMaterial) => void;
  onReprint: (item: OpenedMaterial) => void;
}) {
  return (
    <div className="material-card">
      <div className="material-card-check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
      </div>
      <div className="material-card-content">
        <div className="material-card-header">
          <span className="material-name">{item.material.name}</span>
          <span className={`status-tag status-${item.computedStatus}`}>{statusText(item.computedStatus)}</span>
        </div>
        <div className="material-card-body">
          <InfoRow label="物料编码" value={item.material.code} />
          <InfoRow label="物料分类" value={item.material.category} />
          <InfoRow label="物料类型" value={item.material.type} />
          <InfoRow label="开封时间" value={formatDate(item.openedAt)} />
          <InfoRow label="到期时间" value={formatDate(item.expiresAt)} />
          <InfoRow label="剩余时间" value={item.remainingText} danger={item.computedStatus === 'expired'} />
        </div>
        <div className="row-actions">
          <button
            className="mini-btn mini-btn-use"
            disabled={item.computedStatus === 'expired'}
            onClick={() => onUse(item)}
          >
            使用
          </button>
          <button className="mini-btn mini-btn-scrap" onClick={() => onScrap(item)}>
            废弃
          </button>
          <button
            className="mini-btn mini-btn-reprint"
            disabled={item.computedStatus === 'expired'}
            onClick={() => onReprint(item)}
          >
            补打
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="material-info-row">
      <span className="material-info-label">{label}</span>
      <span className={`material-info-value ${danger ? 'text-danger' : ''}`}>{value}</span>
    </div>
  );
}

export { BatchPrintPopup, FilterChips, MaterialPrintCard, OpenedCard, OpenedOperationCard, PrintDetail, ScrapPopup };
