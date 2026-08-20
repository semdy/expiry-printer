import type { CheckItem } from '@imsfe/organization-selector'
import type { SetStateAction } from 'react'
import { create } from 'zustand'
import { apiGet } from '@/api'
import type { EntityId, OpenedMaterial } from '@/types'

type OperationTabState = {
  items: OpenedMaterial[]
  loaded: boolean
  keyword: string
  category: string
  selectedIds: EntityId[]
  organizations: CheckItem[]
  refresh: () => Promise<void>
  setKeyword: (keyword: string) => void
  setCategory: (category: string) => void
  setSelectedIds: (next: SetStateAction<EntityId[]>) => void
  setOrganizations: (organizations: CheckItem[]) => void
}

let pendingRefresh: Promise<void> | null = null

export const useOperationTabStore = create<OperationTabState>()((set) => ({
  items: [],
  loaded: false,
  keyword: '',
  category: 'all',
  selectedIds: [],
  organizations: [],
  refresh: () => {
    if (pendingRefresh) return pendingRefresh
    pendingRefresh = apiGet<OpenedMaterial[]>('/api/opened-materials')
      .then((items) => set({ items, loaded: true }))
      .finally(() => {
        pendingRefresh = null
      })
    return pendingRefresh
  },
  setKeyword: (keyword) => set({ keyword }),
  setCategory: (category) => set({ category }),
  setSelectedIds: (next) =>
    set((state) => ({
      selectedIds: typeof next === 'function' ? next(state.selectedIds) : next
    })),
  setOrganizations: (organizations) => set({ organizations })
}))
