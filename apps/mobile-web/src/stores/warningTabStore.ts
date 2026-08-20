import type { CheckItem } from '@imsfe/organization-selector'
import { create } from 'zustand'
import type { MaterialCategory, OpenedMaterial } from '@/types'
import { getConfigListApi, getWarningListApi } from 'ims-data/api/expiryPrint'
import { getHost, type IHost } from 'ims-hooks/useApiHost'

const pageSize = 200

type WarningStatus = 'all' | 'warning' | 'expired'

type WarningListItem = {
  id: string | number
  materialId: string | number
  materialCode: string
  materialName: string
  categoryName: string
  typeName: string
  typeRemark?: string
  unitName: string
  openedAt: string
  expiresAt: string
  status: number // 1正常 2预警 3过期4已使用5已废弃
  statusName: string
  quantity: string
  remainingSeconds: string
  operatorName: string
  usedQuantity: string
  scrappedQuantity: string
  remainingQuantity: string
}

type WarningListResponse = {
  list: WarningListItem[]
  total: string | number
}

type ConfigListResponse = {
  list: MaterialCategory[]
}

type WarningTabState = {
  items: OpenedMaterial[]
  categories: MaterialCategory[]
  loaded: boolean
  loading: boolean
  loadingMore: boolean
  page: number
  total: number
  hasMore: boolean
  keyword: string
  categoryId: string
  status: WarningStatus
  organizations: CheckItem[]
  refresh: () => Promise<void>
  loadNextPage: () => Promise<void>
  loadCategories: () => Promise<void>
  setKeyword: (keyword: string) => void
  setCategoryId: (categoryId: string) => void
  setStatus: (status: string) => void
  setOrganizations: (organizations: CheckItem[]) => void
}

let hostInfoPromise: Promise<IHost> | null = null
let categoryRequest: Promise<void> | null = null
let requestVersion = 0
const pageRequests = new Map<string, Promise<WarningListResponse>>()

function getHostInfo() {
  if (!hostInfoPromise) hostInfoPromise = getHost()
  return hostInfoPromise
}

function toIsoTime(value: string) {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp)) return value
  return new Date(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp).toISOString()
}

function formatRemainingTime(secondsValue: string, status: number) {
  if (status === 3) return '已过期'
  const seconds = Math.max(0, Number(secondsValue) || 0)
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${minutes}分钟`
  return `${minutes}分钟`
}

function normalizeItems(list: WarningListItem[]): OpenedMaterial[] {
  return list.map((item) => ({
    id: String(item.id ?? ''),
    sourceStatus: item.status,
    openedAt: toIsoTime(item.openedAt),
    expiresAt: toIsoTime(item.expiresAt),
    computedStatus: item.status === 3 ? 'expired' : item.status === 2 ? 'warning' : 'normal',
    remainingText: formatRemainingTime(item.remainingSeconds, item.status),
    remainingQuantity: item.remainingQuantity,
    material: {
      id: String(item.materialId ?? ''),
      code: item.materialCode,
      name: item.materialName,
      category: item.categoryName,
      type: item.typeName,
      typeRemark: item.typeRemark,
      unit: item.unitName,
      openedLifeValue: 0,
      openedLifeUnit: 'hour',
      status: 'enabled'
    }
  }))
}

function mergeItems(current: OpenedMaterial[], incoming: OpenedMaterial[]) {
  const itemMap = new Map(current.map((item) => [String(item.id), item]))
  for (const item of incoming) itemMap.set(String(item.id), item)
  return Array.from(itemMap.values())
}

async function requestPage(page: number, state: Pick<WarningTabState, 'categoryId' | 'keyword' | 'organizations'>) {
  const hostInfo = await getHostInfo()
  const selectedOrganization = state.organizations[0]
  const requestData = {
    page,
    pageSize,
    shopId: selectedOrganization?.shopId || hostInfo.shopInfo.shopId,
    departmentId: selectedOrganization?.shopId ? '0' : selectedOrganization?.departmentId || '0',
    keyword: state.keyword.trim() || undefined,
    categoryId: state.categoryId === 'all' ? undefined : state.categoryId
  }
  const requestKey = JSON.stringify(requestData)
  const pendingRequest = pageRequests.get(requestKey)
  if (pendingRequest) return pendingRequest

  const request = getWarningListApi(requestData) as Promise<WarningListResponse>
  pageRequests.set(requestKey, request)
  try {
    return await request
  } finally {
    pageRequests.delete(requestKey)
  }
}

export const useWarningTabStore = create<WarningTabState>()((set, get) => ({
  items: [],
  categories: [],
  loaded: false,
  loading: false,
  loadingMore: false,
  page: 0,
  total: 0,
  hasMore: true,
  keyword: '',
  categoryId: 'all',
  status: 'all',
  organizations: [],
  refresh: async () => {
    const version = ++requestVersion
    const state = get()
    set({ loading: true, loadingMore: false })
    try {
      const response = await requestPage(1, state)
      if (version !== requestVersion) return
      const items = normalizeItems(response.list || [])
      const total = Number(response.total) || 0
      set({ items, loaded: true, page: 1, total, hasMore: items.length < total })
    } catch {
      set((state) => ({
        ...state,
        hasMore: false
      }))
    } finally {
      if (version === requestVersion) set({ loading: false })
    }
  },
  loadNextPage: async () => {
    const state = get()
    if (state.loading || state.loadingMore || !state.hasMore) return
    const version = requestVersion
    const nextPage = state.page + 1
    set({ loadingMore: true })
    try {
      const response = await requestPage(nextPage, state)
      if (version !== requestVersion) return
      const items = mergeItems(state.items, normalizeItems(response.list || []))
      const total = Number(response.total) || 0
      set({ items, page: nextPage, total, hasMore: items.length < total })
    } catch {
      // ims-data already displays the request error.
    } finally {
      if (version === requestVersion) set({ loadingMore: false })
    }
  },
  loadCategories: async () => {
    if (get().categories.length) return
    if (categoryRequest) return categoryRequest
    categoryRequest = (getConfigListApi({ kind: 'category', status: 1 }) as Promise<ConfigListResponse>)
      .then((response) => {
        set({ categories: (response.list || []).map((item) => ({ ...item, id: String(item.id) })) })
      })
      .catch(() => {
        // ims-data already displays the request error.
      })
      .finally(() => {
        categoryRequest = null
      })
    return categoryRequest
  },
  setKeyword: (keyword) => {
    requestVersion += 1
    set({ keyword, loadingMore: false })
  },
  setCategoryId: (categoryId) => {
    requestVersion += 1
    set({ categoryId, items: [], page: 0, total: 0, hasMore: true, loadingMore: false })
  },
  setStatus: (status) => {
    set({ status: status as WarningStatus })
  },
  setOrganizations: (organizations) => {
    requestVersion += 1
    set({ organizations, items: [], page: 0, total: 0, hasMore: true, loadingMore: false })
  }
}))
