import { SearchBar } from 'antd-mobile';
import { FilterChips, MaterialPrintCard, PrintDetail } from '../components/MobileViews';
import type { Material } from '../types';

type PrintTabProps = {
  categories: string[];
  filteredMaterials: Material[];
  keyword: string;
  category: string;
  selectedIds: number[];
  detailMaterial: Material | null;
  quantity: number;
  onKeywordChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onToggle: (id: number) => void;
  onOpenDetail: (material: Material) => void;
  onQuantityChange: (value: number) => void;
  onPrint: () => void;
};

export default function PrintTab({
  categories,
  filteredMaterials,
  keyword,
  category,
  selectedIds,
  detailMaterial,
  quantity,
  onKeywordChange,
  onCategoryChange,
  onToggle,
  onOpenDetail,
  onQuantityChange,
  onPrint
}: PrintTabProps) {
  if (detailMaterial) {
    return (
      <PrintDetail
        material={detailMaterial}
        quantity={quantity}
        onQuantityChange={onQuantityChange}
        onPrint={onPrint}
      />
    );
  }

  return (
    <>
      <div className="search-box">
        <SearchBar value={keyword} onChange={onKeywordChange} placeholder="搜索物料名称/编码" />
      </div>
      <FilterChips items={categories} value={category} onChange={onCategoryChange} />
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
              onToggle={() => onToggle(item.id)}
              onPrint={() => onOpenDetail(item)}
            />
          ))}
        </div>
      </section>
    </>
  );
}
