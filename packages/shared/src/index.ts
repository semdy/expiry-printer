export type Status = 'enabled' | 'disabled' | 'deleted';

export type OpenedMaterialStatus = 'normal' | 'warning' | 'expired' | 'used' | 'scrapped';

export type TimeUnit = 'minutes' | 'hours' | 'days';

export type ConfigKind = 'category' | 'type' | 'unit';

export type OperationType = 'use' | 'scrap';

export type PrintType = 'initial' | 'reprint';

export const openedMaterialStatusText: Record<OpenedMaterialStatus, string> = {
  normal: '正常',
  warning: '即将过期',
  expired: '已过期',
  used: '已使用',
  scrapped: '已废弃'
};

export const timeUnitText: Record<TimeUnit, string> = {
  minutes: '分钟',
  hours: '小时',
  days: '天'
};

export function toMinutes(value: number, unit: TimeUnit) {
  if (unit === 'minutes') return value;
  if (unit === 'hours') return value * 60;
  return value * 24 * 60;
}

export function formatDuration(value: number, unit: TimeUnit) {
  return `${value}${timeUnitText[unit]}`;
}

export function canUse(status: OpenedMaterialStatus) {
  return status === 'normal' || status === 'warning';
}

export function canScrap(status: OpenedMaterialStatus) {
  return status === 'normal' || status === 'warning' || status === 'expired';
}

export function canReprint(status: OpenedMaterialStatus) {
  return status === 'normal' || status === 'warning';
}
