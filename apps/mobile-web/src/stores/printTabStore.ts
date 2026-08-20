import type { CheckItem } from '@imsfe/organization-selector';
import type { SetStateAction } from 'react';
import { create } from 'zustand';
import { apiGet } from '@/api';
import type { Material } from '@/types';

type PrintTabState = {
  materials: Material[];
  loaded: boolean;
  keyword: string;
  category: string;
  selectedIds: number[];
  detailMaterial: Material | null;
  quantity: number;
  organizations: CheckItem[];
  refresh: () => Promise<void>;
  setKeyword: (keyword: string) => void;
  setCategory: (category: string) => void;
  setSelectedIds: (next: SetStateAction<number[]>) => void;
  setDetailMaterial: (material: Material | null) => void;
  setQuantity: (quantity: number) => void;
  setOrganizations: (organizations: CheckItem[]) => void;
};

let pendingRefresh: Promise<void> | null = null;

export const usePrintTabStore = create<PrintTabState>()((set) => ({
  materials: [],
  loaded: false,
  keyword: '',
  category: 'all',
  selectedIds: [],
  detailMaterial: null,
  quantity: 1,
  organizations: [],
  refresh: () => {
    if (pendingRefresh) return pendingRefresh;
    pendingRefresh = apiGet<Material[]>('/api/materials')
      .then((materials) => set({ materials, loaded: true }))
      .finally(() => {
        pendingRefresh = null;
      });
    return pendingRefresh;
  },
  setKeyword: (keyword) => set({ keyword }),
  setCategory: (category) => set({ category }),
  setSelectedIds: (next) => set((state) => ({
    selectedIds: typeof next === 'function' ? next(state.selectedIds) : next
  })),
  setDetailMaterial: (detailMaterial) => set({ detailMaterial }),
  setQuantity: (quantity) => set({ quantity }),
  setOrganizations: (organizations) => set({ organizations })
}));
