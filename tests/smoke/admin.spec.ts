import { expect, test } from '@playwright/test';
import { ADMIN_URL, batchUpdateMaterialStatus, createMaterial, updateMaterialStatus } from './helpers';

test('后台物料禁用和启用都需要二次确认', async ({ page, request }) => {
  const material = await createMaterial(request, 'ADM');

  await page.goto(ADMIN_URL);
  await expect(page.getByText('物料配置').first()).toBeVisible();

  await page.getByPlaceholder('搜索物料名称、编码').fill(material.code);
  await page.keyboard.press('Enter');

  const row = page.getByRole('row').filter({ hasText: material.code });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: `更多操作-${material.code}` }).click();
  await page.getByRole('menuitem', { name: '禁用' }).click();
  await expect(page.getByText('确认禁用物料')).toBeVisible();
  await expect(page.getByText(`确定要禁用“${material.name}”吗？`)).toBeVisible();
  await page.getByRole('button', { name: '确认禁用' }).click();
  await expect(row.getByText('禁用')).toBeVisible();

  await row.getByRole('button', { name: `更多操作-${material.code}` }).click();
  await page.getByRole('menuitem', { name: '启用' }).click();
  await expect(page.getByText('确认启用物料')).toBeVisible();
  await page.getByRole('button', { name: '确认启用' }).click();
  await expect(row.getByText('启用')).toBeVisible();
  await row.getByRole('button', { name: `更多操作-${material.code}` }).click();
  await expect(page.getByRole('menuitem', { name: '禁用' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('后台物料支持批量删除并从列表隐藏', async ({ page, request }) => {
  const material = await createMaterial(request, 'ADB');

  await page.goto(ADMIN_URL);
  await page.getByPlaceholder('搜索物料名称、编码').fill(material.code);
  await page.keyboard.press('Enter');

  const row = page.getByRole('row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await row.getByRole('checkbox').check();

  await expect(page.getByText('已选 1 项')).toBeVisible();
  await page.getByRole('button', { name: '批量删除' }).click();
  await expect(page.getByText('确认批量删除物料')).toBeVisible();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(row).not.toBeVisible();

  const listResponse = await request.get(`http://127.0.0.1:3000/api/materials?keyword=${material.code}`);
  expect(listResponse.ok()).toBeTruthy();
  expect(await listResponse.json()).toHaveLength(0);
});

test('后台禁用物料支持批量启用', async ({ page, request }) => {
  const material = await createMaterial(request, 'ABE');
  await updateMaterialStatus(request, material.id, 'disabled');

  await page.goto(ADMIN_URL);
  await page.getByPlaceholder('搜索物料名称、编码').fill(material.code);
  await page.keyboard.press('Enter');

  const row = page.getByRole('row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await expect(row.getByText('禁用')).toBeVisible();
  await row.getByRole('checkbox').check();

  await page.getByRole('button', { name: '批量启用' }).click();
  await expect(page.getByText('确认批量启用物料')).toBeVisible();
  await page.getByRole('button', { name: '确认启用' }).click();
  await expect(row.getByText('启用')).toBeVisible();
});

test('后台禁用物料也支持批量删除并从列表隐藏', async ({ page, request }) => {
  const material = await createMaterial(request, 'ADD');
  await updateMaterialStatus(request, material.id, 'disabled');

  await page.goto(ADMIN_URL);
  await page.getByPlaceholder('搜索物料名称、编码').fill(material.code);
  await page.keyboard.press('Enter');

  const row = page.getByRole('row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await expect(row.getByText('禁用')).toBeVisible();
  await row.getByRole('checkbox').check();

  await page.getByRole('button', { name: '批量删除' }).click();
  await expect(page.getByText('确认批量删除物料')).toBeVisible();
  await page.getByRole('button', { name: '确认删除' }).click();
  await expect(row).not.toBeVisible();

  const listResponse = await request.get(`http://127.0.0.1:3000/api/materials?keyword=${material.code}`);
  expect(listResponse.ok()).toBeTruthy();
  expect(await listResponse.json()).toHaveLength(0);
});

test('后台物料配置页面固定，仅表格行区域滚动', async ({ page, request }) => {
  const prefix = `SCR${Date.now()}`;
  const rows = [];
  for (let index = 0; index < 26; index += 1) {
    rows.push(await createMaterial(request, `${prefix}${index}`));
  }

  try {
    await page.goto(ADMIN_URL);
    await page.getByPlaceholder('搜索物料名称、编码').fill(prefix);
    await page.keyboard.press('Enter');
    await expect(page.getByText(`共 ${rows.length} 条记录`)).toBeVisible();

    const metrics = await page.evaluate(() => {
      const tableBody = document.querySelector('.material-table-card .ant-table-body');
      return {
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        tableClientHeight: tableBody?.clientHeight ?? 0,
        tableScrollHeight: tableBody?.scrollHeight ?? 0
      };
    });

    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 2);
    expect(metrics.tableScrollHeight).toBeGreaterThan(metrics.tableClientHeight + 20);
  } finally {
    await batchUpdateMaterialStatus(request, rows.map((row) => row.id), 'deleted');
  }
});

test('数据中心和日志页保留执行时间筛选', async ({ page }) => {
  await page.goto(ADMIN_URL);

  await page.locator('.menu-item').filter({ hasText: '数据中心' }).click();
  const dashboardFilter = page.locator('.filter-bar').filter({ hasText: '状态' }).filter({ hasText: '执行时间' });
  await expect(dashboardFilter).toBeVisible();
  await expect(dashboardFilter.getByText('快捷时间')).toBeVisible();
  await expect(dashboardFilter.getByRole('button', { name: /查\s*询/ })).toBeVisible();

  await page.getByText('效期打印日志').click();
  const printFilter = page.locator('.filter-bar').filter({ hasText: '执行时间' }).filter({ hasText: '快捷时间' });
  await expect(printFilter).toBeVisible();
  await expect(printFilter.getByRole('button', { name: /查\s*询/ })).toBeVisible();

  await page.getByText('物料废弃日志').click();
  const scrapFilter = page.locator('.filter-bar').filter({ hasText: '执行时间' }).filter({ hasText: '快捷时间' });
  await expect(scrapFilter).toBeVisible();
  await expect(scrapFilter.getByRole('button', { name: /查\s*询/ })).toBeVisible();
});

test('后台自定义配置补充信息统一显示为备注', async ({ page }) => {
  await page.goto(ADMIN_URL);

  await page.locator('.menu-item').filter({ hasText: '自定义配置' }).click();
  await expect(page.getByRole('columnheader', { name: '备注' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '补充信息' })).not.toBeVisible();

  await page.getByRole('button', { name: '新增配置' }).click();
  await expect(page.getByLabel('备注')).toBeVisible();
  await expect(page.getByLabel('补充信息')).not.toBeVisible();
});
