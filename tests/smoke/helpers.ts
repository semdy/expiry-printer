import { APIRequestContext, expect } from '@playwright/test';

export const ADMIN_URL = 'http://127.0.0.1:5173';
export const MOBILE_URL = 'http://127.0.0.1:5174';
export const API_URL = 'http://127.0.0.1:3000';

export type TestMaterial = {
  id: number;
  code: string;
  name: string;
  category: string;
  type: string;
  unit: string;
  status: 'enabled' | 'disabled' | 'deleted';
  typeRemark?: string;
};

export type TestConfigKind = 'category' | 'type' | 'unit';

export type TestOpenedMaterial = {
  id: number;
  material: TestMaterial;
  computedStatus: string;
};

export function uniqueCode(prefix: string) {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export async function createMaterial(
  request: APIRequestContext,
  prefix = 'SMOKE',
  overrides: Partial<Omit<TestMaterial, 'id'>> = {}
) {
  const code = uniqueCode(prefix);
  const response = await request.post(`${API_URL}/api/materials`, {
    data: {
      code,
      name: `测试物料${code.slice(-5)}`,
      category: '原料',
      type: '冷藏',
      unit: '盒',
      shelfLifeValue: 7,
      shelfLifeUnit: 'days',
      openedLifeValue: 24,
      openedLifeUnit: 'hours',
      status: 'enabled',
      remark: 'Playwright 烟雾测试自动创建',
      ...overrides
    }
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<TestMaterial>;
}

export async function createConfig(request: APIRequestContext, kind: TestConfigKind, prefix = 'CFG', extra = '') {
  const code = uniqueCode(prefix);
  const response = await request.post(`${API_URL}/api/configs`, {
    data: {
      kind,
      code,
      name: `测试配置${code.slice(-5)}`,
      sort: 99,
      extra,
      status: 'enabled'
    }
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ id: number; kind: TestConfigKind; code: string; name: string; extra: string }>;
}

export async function printMaterial(request: APIRequestContext, materialId: number) {
  const response = await request.post(`${API_URL}/api/labels/print`, {
    data: { materialId, printCount: 1 }
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ openedMaterial: TestOpenedMaterial }>;
}

export async function updateMaterialStatus(
  request: APIRequestContext,
  materialId: number,
  status: TestMaterial['status']
) {
  const response = await request.patch(`${API_URL}/api/materials/${materialId}/status`, {
    data: { status }
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<TestMaterial>;
}

export async function batchUpdateMaterialStatus(
  request: APIRequestContext,
  ids: number[],
  status: TestMaterial['status']
) {
  const response = await request.post(`${API_URL}/api/materials/batch-status`, {
    data: { ids, status }
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<{ count: number; status: TestMaterial['status'] }>;
}
