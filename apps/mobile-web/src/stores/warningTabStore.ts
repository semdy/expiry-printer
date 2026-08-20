import type { CheckItem } from '@imsfe/organization-selector';
import { create } from 'zustand';
import { apiGet } from '@/api';
import type { OpenedMaterial } from '@/types';

type WarningTabState = {
  items: OpenedMaterial[];
  loaded: boolean;
  keyword: string;
  status: string;
  organizations: CheckItem[];
  refresh: () => Promise<void>;
  setKeyword: (keyword: string) => void;
  setStatus: (status: string) => void;
  setOrganizations: (organizations: CheckItem[]) => void;
};

let pendingRefresh: Promise<void> | null = null;

export const useWarningTabStore = create<WarningTabState>()((set) => ({
  items: [],
  loaded: false,
  keyword: '',
  status: 'all',
  organizations: [],
  refresh: () => {
    if (pendingRefresh) return pendingRefresh;
    pendingRefresh = apiGet<OpenedMaterial[]>('/api/opened-materials')
      .then((items) => set({ items, loaded: true }))
      .finally(() => {
        pendingRefresh = null;
      });
    return pendingRefresh;
  },
  setKeyword: (keyword) => set({ keyword }),
  setStatus: (status) => set({ status }),
  setOrganizations: (organizations) => set({ organizations })
}));
