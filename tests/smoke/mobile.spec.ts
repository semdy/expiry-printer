import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import iconv from 'iconv-lite';
import { MOBILE_URL, createConfig, createMaterial, printMaterial } from './helpers';

async function installMockBluetooth(page: Page, deviceName = 'Mock BLE Printer') {
  await page.addInitScript((name) => {
    window.localStorage.clear();
    (window as any).__bluetoothWrites = [];
    (window as any).__bluetoothBytes = [];
    (window as any).__bluetoothWriteSizes = [];
    (window as any).__bluetoothDisconnects = 0;
    const encoder = new TextDecoder();
    const characteristic = {
      properties: { writeWithoutResponse: true },
      writeValue: async (value: BufferSource) => {
        (window as any).__bluetoothWriteSizes.push(value.byteLength);
        (window as any).__bluetoothBytes.push(...Array.from(new Uint8Array(value as ArrayBuffer)));
        (window as any).__bluetoothWrites.push(encoder.decode(value as ArrayBuffer));
      },
      writeValueWithoutResponse: async (value: BufferSource) => {
        (window as any).__bluetoothWriteSizes.push(value.byteLength);
        (window as any).__bluetoothBytes.push(...Array.from(new Uint8Array(value as ArrayBuffer)));
        (window as any).__bluetoothWrites.push(encoder.decode(value as ArrayBuffer));
      }
    };
    const device = {
      name,
      gatt: {
        disconnect: () => {
          (window as any).__bluetoothDisconnects += 1;
        },
        connect: async () => ({
          getPrimaryService: async () => ({
            getCharacteristics: async () => [characteristic]
          })
        })
      }
    };
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        getDevices: async () => [device],
        requestDevice: async () => device
      }
    });
  }, deviceName);
}

async function installFailingMockBluetooth(page: Page, deviceName = 'Mock BLE Printer') {
  await page.addInitScript((name) => {
    window.localStorage.clear();
    const characteristic = {
      properties: { writeWithoutResponse: true },
      writeValue: async () => {
        throw new Error('mock printer write failed');
      },
      writeValueWithoutResponse: async () => {
        throw new Error('mock printer write failed');
      }
    };
    const device = {
      name,
      gatt: {
        connect: async () => ({
          getPrimaryService: async () => ({
            getCharacteristics: async () => [characteristic]
          })
        })
      }
    };
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        getDevices: async () => [device],
        requestDevice: async () => device
      }
    });
  }, deviceName);
}

async function connectMockPrinter(page: Page) {
  await page.getByText('打印机设置').first().click();
  await page.getByRole('button', { name: '搜索并连接蓝牙打印机' }).click();
  await expect(page.locator('.printer-row').first().getByText('Mock BLE Printer')).toBeVisible();
  await expect(page.locator('.bluetooth-status').getByText('已连接')).toBeVisible();
}

function bluetoothCommand(page: Page) {
  return page.evaluate(() => new TextDecoder().decode(new Uint8Array((window as any).__bluetoothBytes)));
}

function bluetoothHex(page: Page) {
  return page.evaluate(() =>
    Array.from((window as any).__bluetoothBytes, (byte: number) => byte.toString(16).padStart(2, '0')).join('')
  );
}

function gbkHex(value: string) {
  return iconv.encode(value, 'gbk').toString('hex');
}

test('移动端未连接打印机时确认打印会提示并跳转打印机设置', async ({ page, request }) => {
  const material = await createMaterial(request, 'MNC');

  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(MOBILE_URL);
  await page.getByText('标签打印').first().click();
  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);

  const row = page.locator('.item-row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await row.locator('.action-btn-primary').click();
  await page.getByRole('button', { name: '确认打印' }).click();

  await expect(page.getByText('打印机未连接')).toBeVisible();
  await expect(page.getByText('蓝牙连接状态')).toBeVisible();
  await expect(page.getByRole('button', { name: '搜索并连接蓝牙打印机' })).toBeVisible();

  const openedResponse = await request.get(`http://127.0.0.1:3000/api/opened-materials?keyword=${material.code}`);
  expect(openedResponse.ok()).toBeTruthy();
  expect(await openedResponse.json()).toHaveLength(0);
});

test('移动端蓝牙发送失败时不能生成后端打印记录', async ({ page, request }) => {
  const material = await createMaterial(request, 'MPF');

  await installFailingMockBluetooth(page);
  await page.goto(MOBILE_URL);
  await connectMockPrinter(page);
  await page.getByText('标签打印').first().click();
  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);

  const row = page.locator('.item-row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await row.locator('.action-btn-primary').click();
  await page.getByRole('button', { name: '确认打印' }).click();

  await expect(page.getByText('蓝牙发送失败，请重新连接打印机')).toBeVisible();
  await expect(page.getByText('蓝牙连接状态')).toBeVisible();

  const openedResponse = await request.get(`http://127.0.0.1:3000/api/opened-materials?keyword=${material.code}`);
  expect(openedResponse.ok()).toBeTruthy();
  expect(await openedResponse.json()).toHaveLength(0);
});

test('移动端标签打印需要先进入明细再确认打印成功', async ({ page, request }) => {
  const material = await createMaterial(request, 'MPR');

  await installMockBluetooth(page);
  await page.goto(MOBILE_URL);
  await connectMockPrinter(page);
  await page.getByText('标签打印').first().click();
  await expect(page.getByText('物料列表')).toBeVisible();

  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);
  const row = page.locator('.item-row').filter({ hasText: material.code });
  await expect(row).toBeVisible();

  await row.locator('.action-btn-primary').click();
  await expect(page.getByText('打印明细')).toBeVisible();
  await expect(page.getByText('效期标签预览')).toBeVisible();

  await page.getByRole('button', { name: '确认打印' }).click();
  await expect(page.getByText('打印成功')).toBeVisible();
  await expect.poll(() => bluetoothCommand(page)).toContain('PRINT 1,1');

  const openedResponse = await request.get(`http://127.0.0.1:3000/api/opened-materials?keyword=${material.code}`);
  expect(openedResponse.ok()).toBeTruthy();
  const opened = await openedResponse.json();
  expect(opened.length).toBeGreaterThan(0);
});

test('移动端标签打印多选后底部固定出现批量打印按钮', async ({ page, request }) => {
  const material = await createMaterial(request, 'MBP');

  await page.goto(MOBILE_URL);
  await page.getByText('标签打印').first().click();
  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);

  const row = page.locator('.item-row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await row.locator('input[type="checkbox"]').check();

  const batchBar = page.locator('.print-batch-bar');
  await expect(batchBar).toBeVisible();
  await expect(batchBar.getByText('已选 1 项')).toBeVisible();
  await expect(batchBar.getByRole('button', { name: '批量打印' })).toBeVisible();
  await expect.poll(() => batchBar.evaluate((node) => getComputedStyle(node).position)).toBe('fixed');

  await batchBar.getByRole('button', { name: '批量打印' }).click();
  await expect(page.getByText('选择物料并设置数量')).toBeVisible();
});

test('移动端批量标签打印已连接蓝牙时不创建浏览器打印任务', async ({ page, request }) => {
  const first = await createMaterial(request, 'MB1');
  const second = await createMaterial(request, 'MB2');

  await installMockBluetooth(page);
  await page.addInitScript(() => {
    (window as any).__printFrameCount = 0;

    const originalAppendChild = Element.prototype.appendChild;
    Element.prototype.appendChild = function appendChildWithPrintSpy<T extends Node>(child: T): T {
      const result = originalAppendChild.call(this, child) as T;
      if (child instanceof HTMLIFrameElement && child.getAttribute('title') === '效期标签打印') {
        (window as any).__printFrameCount += 1;
      }
      return result;
    };
  });

  await page.goto(MOBILE_URL);
  await connectMockPrinter(page);
  await page.getByText('标签打印').first().click();
  await expect(page.getByText('物料列表')).toBeVisible();

  for (const material of [first, second]) {
    await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);
    const row = page.locator('.item-row').filter({ hasText: material.code });
    await expect(row).toBeVisible();
    await row.locator('input[type="checkbox"]').check();
  }

  await page.locator('.print-batch-bar').getByRole('button', { name: '批量打印' }).click();
  await expect(page.getByText('选择物料并设置数量')).toBeVisible();
  await page.locator('.batch-print-item').filter({ hasText: second.code }).locator('.count-btn-sm').last().click();
  await page.getByRole('button', { name: '批量打印' }).last().click();
  await expect(page.getByText('批量打印成功')).toBeVisible();

  await expect.poll(() => page.evaluate(() => (window as any).__printFrameCount)).toBe(0);
  await expect.poll(() => bluetoothCommand(page)).toContain('CODEPAGE 936');
  await expect.poll(() => bluetoothCommand(page)).toContain('PRINT 1,1');
});

test('移动端批量废弃需要确认弹窗，确认后才执行', async ({ page, request }) => {
  const material = await createMaterial(request, 'MSC');
  await printMaterial(request, material.id);
  await printMaterial(request, material.id);

  await page.goto(MOBILE_URL);
  await page.getByText('物料操作').first().click();
  await expect(page.getByText('批量使用')).not.toBeVisible();

  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);
  const cards = page.locator('.material-card').filter({ hasText: material.code });
  await expect(cards).toHaveCount(2);

  await cards.nth(0).locator('input[type="checkbox"]').check();
  await cards.nth(1).locator('input[type="checkbox"]').check();
  await expect(page.getByText('已选 2 项')).toBeVisible();

  await page.getByRole('button', { name: '批量废弃' }).click();
  await expect(page.getByText('确认批量废弃')).toBeVisible();
  await expect(page.getByText('确定要批量废弃已选择的 2 个物料吗？每个物料默认废弃数量为 1。')).toBeVisible();

  await page.locator('.action-confirm-dialog').getByRole('button', { name: '确认废弃' }).click();
  await expect(page.getByText('批量废弃成功')).toBeVisible();
});

test('移动端单个废弃可以填写数量，废弃次数仍为一次', async ({ page, request }) => {
  const material = await createMaterial(request, 'MSS', { unit: '克' });
  await printMaterial(request, material.id);

  await page.goto(MOBILE_URL);
  await page.getByText('物料操作').first().click();
  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);

  const card = page.locator('.material-card').filter({ hasText: material.code }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '废弃' }).click();

  const scrapPopup = page.locator('.scrap-popup');
  await expect(scrapPopup.getByText('物料废弃')).toBeVisible();
  await expect(scrapPopup.getByText(`${material.name} ${material.code}`)).toBeVisible();
  await expect(scrapPopup.getByText('克')).toBeVisible();
  await scrapPopup.locator('input[name="scrapQuantity"]').fill('500');
  await scrapPopup.getByRole('button', { name: '确认废弃' }).click();

  await expect(page.locator('.action-confirm-title').getByText('确认废弃')).toBeVisible();
  await expect(page.getByText(`确定要废弃“${material.name}”吗？废弃数量：500克`)).toBeVisible();

  await page.locator('.action-confirm-dialog').getByRole('button', { name: '确认废弃' }).click();
  await expect(page.getByText('废弃成功')).toBeVisible();

  const scrapsResponse = await request.get('http://127.0.0.1:3000/api/logs/scraps');
  expect(scrapsResponse.ok()).toBeTruthy();
  const scrapLogs = await scrapsResponse.json();
  const matchedLogs = scrapLogs.filter((item: any) => item.material.code === material.code);
  expect(matchedLogs).toHaveLength(1);
  expect(matchedLogs[0].quantity).toBe(500);
  expect(matchedLogs[0].unit).toBe('克');
});

test('移动端效期预警废弃也可以填写数量', async ({ page, request }) => {
  const material = await createMaterial(request, 'MSW');
  await printMaterial(request, material.id);

  await page.goto(MOBILE_URL);
  await page.getByText('效期预警').first().click();
  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);

  const card = page.locator('.warning-row').filter({ hasText: material.code }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '废弃' }).click();

  const scrapPopup = page.locator('.scrap-popup');
  await expect(scrapPopup.getByText('物料废弃')).toBeVisible();
  await expect(scrapPopup.locator('input[name="scrapQuantity"]')).toHaveValue('1');
  await expect(scrapPopup.getByText(material.unit)).toBeVisible();
});

test('移动端打印机设置只展示蓝牙连接信息和最近设备快速连接', async ({ page }) => {
  await installMockBluetooth(page);
  await page.addInitScript(() => window.localStorage.setItem('expiry-label-printer-name', 'Mock BLE Printer'));
  await page.goto(MOBILE_URL);
  await page.getByText('打印机设置').first().click();

  await expect(page.getByText('当前连接设备')).toBeVisible();
  await expect(page.getByText('最近连接设备')).toBeVisible();
  await expect(page.getByText('Mock BLE Printer')).toBeVisible();
  await expect(page.getByPlaceholder('请输入系统打印机名称')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '连接/保存打印机' })).not.toBeVisible();
  await page.getByRole('button', { name: '快速连接' }).click();
  await expect(page.locator('.bluetooth-status').getByText('已连接')).toBeVisible();
  await page.getByRole('button', { name: '断开连接' }).click();
  await expect(page.locator('.bluetooth-status').getByText('未连接')).toBeVisible();
  await expect(page.getByRole('button', { name: '快速连接' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__bluetoothDisconnects)).toBe(1);
});

test('移动端打印机设置可以连接蓝牙打印机并发送标签指令', async ({ page, request }) => {
  const material = await createMaterial(request, 'MBT');
  await installMockBluetooth(page);

  await page.goto(MOBILE_URL);
  await connectMockPrinter(page);
  await page.getByText('标签打印').first().click();
  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);

  const row = page.locator('.item-row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await row.locator('.action-btn-primary').click();
  await page.getByRole('button', { name: '确认打印' }).click();
  await expect(page.getByText('打印成功')).toBeVisible();

  await expect.poll(() => bluetoothCommand(page)).toContain('SIZE 55 mm,30 mm');
  await expect.poll(() => bluetoothCommand(page)).toContain('CODEPAGE 936');
  await expect.poll(() => bluetoothCommand(page)).toContain('DIRECTION 0');
  await expect.poll(() => bluetoothCommand(page)).toContain('TEXT 24,24');
  await expect.poll(() => bluetoothHex(page)).toContain('ceefc1cfc3fbb3c6a3ba');
  await expect.poll(() => bluetoothHex(page)).toContain('ceefc1cfc0e0d0cda3ba');
  await expect.poll(() => bluetoothCommand(page)).toContain('PRINT 1,1');
  await expect.poll(() => bluetoothCommand(page)).not.toContain('CODEPAGE UTF-8');
  await expect.poll(() => bluetoothCommand(page)).not.toContain('QRCODE');
  await expect.poll(() => bluetoothCommand(page)).not.toContain('BITMAP');
  await expect
    .poll(() => page.evaluate(() => Math.max(...(window as any).__bluetoothWriteSizes)))
    .toBeLessThanOrEqual(180);
  await expect.poll(() => page.evaluate(() => (window as any).__bluetoothBytes.length)).toBeLessThan(800);
});

test('移动端打印标签时物料类型后拼接类型备注', async ({ page, request }) => {
  const typeConfig = await createConfig(request, 'type', 'MTR', '需要冷链');
  const material = await createMaterial(request, 'MTR', { type: typeConfig.name });
  await installMockBluetooth(page);

  await page.goto(MOBILE_URL);
  await connectMockPrinter(page);
  await page.getByText('标签打印').first().click();
  await page.getByPlaceholder('搜索物料名称/编码').fill(material.code);

  const row = page.locator('.item-row').filter({ hasText: material.code });
  await expect(row).toBeVisible();
  await row.locator('.action-btn-primary').click();
  await page.getByRole('button', { name: '确认打印' }).click();
  await expect(page.getByText('打印成功')).toBeVisible();

  const expectedHex = gbkHex(`物料类型：${typeConfig.name},需要冷链`);
  await expect.poll(() => bluetoothHex(page)).toContain(expectedHex);
});
