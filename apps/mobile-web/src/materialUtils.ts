import type { Material, PrintMaterial } from '@/types'

export function toggleId<T extends number | string>(items: T[], setItems: (items: T[]) => void, id: T) {
  setItems(items.includes(id) ? items.filter((item) => item !== id) : [...items, id])
}

export function unitText(unit: string) {
  return (
    ({ minute: '分钟', minutes: '分钟', hour: '小时', hours: '小时', day: '天', days: '天' } as Record<string, string>)[
      unit
    ] || unit
  )
}

export function labelMaterialType(material: Material | PrintMaterial) {
  const typeName = 'typeName' in material ? material.typeName : material.type
  return material.typeRemark ? `${typeName},${material.typeRemark}` : typeName
}

export function statusText(status: string) {
  return ({ normal: '正常', warning: '即将过期', expired: '已过期' } as Record<string, string>)[status] || status
}

export function addLife(date: Date, value: number, unit: string) {
  const minutes = ['minute', 'minutes'].includes(unit)
    ? value
    : ['hour', 'hours'].includes(unit)
      ? value * 60
      : value * 24 * 60
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}
