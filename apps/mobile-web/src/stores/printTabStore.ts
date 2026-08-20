import type { CheckItem } from '@imsfe/organization-selector'
import type { SetStateAction } from 'react'
import { create } from 'zustand'
import type { MaterialCategory, PrintMaterial } from '@/types'
import { getConfigListApi, getMaterialListApi } from 'ims-data/api/expiryPrint'
import { getHost, type IHost } from 'ims-hooks/useApiHost'

const pageSize = 20

type MaterialListResponse = {
  list: PrintMaterial[]
  total: string | number
}

type ConfigListResponse = {
  list: MaterialCategory[]
}

type PrintTabState = {
  materials: PrintMaterial[]
  categories: MaterialCategory[]
  loaded: boolean
  loading: boolean
  loadingMore: boolean
  page: number
  total: number
  hasMore: boolean
  keyword: string
  categoryId: string
  selectedIds: string[]
  detailMaterial: PrintMaterial | null
  quantity: number
  organizations: CheckItem[]
  refresh: () => Promise<void>
  loadNextPage: () => Promise<void>
  loadCategories: () => Promise<void>
  setKeyword: (keyword: string) => void
  setCategoryId: (categoryId: string) => void
  setSelectedIds: (next: SetStateAction<string[]>) => void
  setDetailMaterial: (material: PrintMaterial | null) => void
  setQuantity: (quantity: number) => void
  setOrganizations: (organizations: CheckItem[]) => void
}

let hostInfoPromise: Promise<IHost> | null = null
let categoryRequest: Promise<void> | null = null
let requestVersion = 0
const pageRequests = new Map<string, Promise<MaterialListResponse>>()

function getHostInfo() {
  if (!hostInfoPromise) hostInfoPromise = getHost()
  return hostInfoPromise
}

function normalizeMaterials(list: PrintMaterial[]) {
  return list.map((item) => ({
    ...item,
    id: String(item.id ?? ''),
    categoryId: String(item.categoryId ?? ''),
    typeId: String(item.typeId ?? ''),
    unitId: String(item.unitId ?? ''),
    shopId: String(item.shopId ?? ''),
    departmentId: String(item.departmentId ?? '0')
  }))
}

function mergeMaterials(current: PrintMaterial[], incoming: PrintMaterial[]) {
  const materialMap = new Map(current.map((item) => [item.id, item]))
  for (const item of incoming) materialMap.set(item.id, item)
  return Array.from(materialMap.values())
}

async function requestPage(page: number, state: Pick<PrintTabState, 'categoryId' | 'keyword' | 'organizations'>) {
  const hostInfo = await getHostInfo()
  const selectedOrganization = state.organizations[0]
  const shopId = selectedOrganization?.shopId || hostInfo.shopInfo.shopId
  const departmentId = selectedOrganization?.shopId ? '0' : selectedOrganization?.departmentId || '0'
  const requestData = {
    page,
    pageSize,
    shopId,
    departmentId,
    // status: 1,
    keyword: state.keyword.trim() || undefined,
    categoryId: state.categoryId === 'all' ? undefined : state.categoryId
  }
  const requestKey = JSON.stringify(requestData)
  const pendingRequest = pageRequests.get(requestKey)
  if (pendingRequest) return pendingRequest

  const request = getMaterialListApi(requestData) as Promise<MaterialListResponse>
  pageRequests.set(requestKey, request)
  try {
    return await request
  } finally {
    pageRequests.delete(requestKey)
  }
}

export const usePrintTabStore = create<PrintTabState>()((set, get) => ({
  materials: [],
  categories: [],
  loaded: false,
  loading: false,
  loadingMore: false,
  page: 0,
  total: 0,
  hasMore: true,
  keyword: '',
  categoryId: 'all',
  selectedIds: [],
  detailMaterial: null,
  quantity: 1,
  organizations: [],
  refresh: async () => {
    const version = ++requestVersion
    const state = get()
    set({ loading: true, loadingMore: false })
    try {
      const response = await requestPage(1, state)
      if (version !== requestVersion) return
      const materials = normalizeMaterials(response.list || [])
      const total = Number(response.total) || 0
      set({
        materials,
        loaded: true,
        page: 1,
        total,
        hasMore: materials.length < total
      })
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
      const materials = mergeMaterials(state.materials, normalizeMaterials(response.list || []))
      const total = Number(response.total) || 0
      set({
        materials,
        page: nextPage,
        total,
        hasMore: materials.length < total
      })
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
        set({
          categories: (response.list || []).map((item) => ({ ...item, id: String(item.id) }))
        })
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
    set({ keyword, selectedIds: [], loadingMore: false })
  },
  setCategoryId: (categoryId) => {
    requestVersion += 1
    set({ categoryId, materials: [], page: 0, total: 0, hasMore: true, selectedIds: [], loadingMore: false })
  },
  setSelectedIds: (next) =>
    set((state) => ({
      selectedIds: typeof next === 'function' ? next(state.selectedIds) : next
    })),
  setDetailMaterial: (detailMaterial) => set({ detailMaterial }),
  setQuantity: (quantity) => set({ quantity }),
  setOrganizations: (organizations) => {
    requestVersion += 1
    set({ organizations, materials: [], page: 0, total: 0, hasMore: true, selectedIds: [], loadingMore: false })
  }
}))
