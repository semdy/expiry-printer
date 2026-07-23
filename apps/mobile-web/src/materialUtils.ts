import type { Material } from './types';

export function toggleId(items: number[], setItems: (items: number[]) => void, id: number) {
  setItems(items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
}

export function unitText(unit: string) {
  return ({ minutes: '分钟', hours: '小时', days: '天' } as Record<string, string>)[unit] || unit;
}

export function labelMaterialType(material: Material) {
  return material.typeRemark ? `${material.type},${material.typeRemark}` : material.type;
}

export function statusText(status: string) {
  return ({ normal: '正常', warning: '即将过期', expired: '已过期' } as Record<string, string>)[status] || status;
}

export function addLife(date: Date, value: number, unit: string) {
  const minutes = unit === 'minutes' ? value : unit === 'hours' ? value * 60 : value * 24 * 60;
  return new Date(date.getTime() + minutes * 60 * 1000);
}

export function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}
