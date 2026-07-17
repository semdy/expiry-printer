import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT || 3000);
const defaultOperator = process.env.DEFAULT_OPERATOR || '张三';
const defaultOrganization = process.env.DEFAULT_ORGANIZATION || '北京朝阳店';

app.use(cors());
app.use(express.json());

type TimeUnit = 'minutes' | 'hours' | 'days';

const materialSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  type: z.string().min(1),
  unit: z.string().min(1),
  shelfLifeValue: z.coerce.number().int().positive(),
  shelfLifeUnit: z.enum(['minutes', 'hours', 'days']),
  openedLifeValue: z.coerce.number().int().positive(),
  openedLifeUnit: z.enum(['minutes', 'hours', 'days']),
  status: z.enum(['enabled', 'disabled']).default('enabled'),
  remark: z.string().optional().nullable()
});

const materialStatusSchema = z.enum(['enabled', 'disabled', 'deleted']);

const materialImportSchema = z.object({
  materials: z.array(materialSchema).min(1)
});

const configSchema = z.object({
  kind: z.enum(['category', 'type', 'unit']),
  code: z.string().min(1),
  name: z.string().min(1),
  sort: z.coerce.number().int().default(1),
  extra: z.string().optional().nullable(),
  status: z.enum(['enabled', 'disabled']).default('enabled')
});

function addLife(date: Date, value: number, unit: TimeUnit) {
  const multipliers = { minutes: 1, hours: 60, days: 24 * 60 };
  return new Date(date.getTime() + value * multipliers[unit] * 60 * 1000);
}

function getComputedStatus(opened: { status: string; expiresAt: Date }) {
  if (opened.status === 'used' || opened.status === 'scrapped') return opened.status;
  const minutesLeft = (opened.expiresAt.getTime() - Date.now()) / 1000 / 60;
  if (minutesLeft <= 0) return 'expired';
  if (minutesLeft <= 24 * 60) return 'warning';
  return 'normal';
}

function remainingText(expiresAt: Date) {
  const minutes = Math.round((expiresAt.getTime() - Date.now()) / 1000 / 60);
  const abs = Math.abs(minutes);
  const text = abs >= 24 * 60 ? `${Math.ceil(abs / 60 / 24)}天` : abs >= 60 ? `${Math.ceil(abs / 60)}小时` : `${abs}分钟`;
  return minutes < 0 ? `已过期${text}` : text;
}

async function defaultOrgId() {
  const org = await prisma.organization.upsert({
    where: { id: 1 },
    update: { name: defaultOrganization },
    create: { id: 1, name: defaultOrganization }
  });
  return org.id;
}

async function refreshOpenedStatuses() {
  const opened = await prisma.openedMaterial.findMany({
    where: { status: { in: ['normal', 'warning', 'expired'] } }
  });

  await Promise.all(opened.map((item) => {
    const status = getComputedStatus(item);
    if (status === item.status) return Promise.resolve();
    return prisma.openedMaterial.update({ where: { id: item.id }, data: { status } });
  }));
}

function wrap(handler: express.RequestHandler) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      await Promise.resolve(handler(req, res, next));
    } catch (error) {
      next(error);
    }
  };
}

function dateRangeWhere(startAt?: string, endAt?: string) {
  const range: { gte?: Date; lte?: Date } = {};
  if (startAt) {
    const date = new Date(startAt);
    if (!Number.isNaN(date.getTime())) range.gte = date;
  }
  if (endAt) {
    const date = new Date(endAt);
    if (!Number.isNaN(date.getTime())) range.lte = date;
  }
  return Object.keys(range).length ? range : undefined;
}

async function enrichMaterialTypeRemarks<T extends { type: string }>(materials: T[]) {
  const typeNames = Array.from(new Set(materials.map((item) => item.type).filter(Boolean)));
  if (!typeNames.length) return materials.map((item) => ({ ...item, typeRemark: '' }));
  const configs = await prisma.configItem.findMany({
    where: { kind: 'type', name: { in: typeNames }, status: 'enabled' },
    select: { name: true, extra: true }
  });
  const remarks = new Map(configs.map((item) => [item.name, item.extra || '']));
  return materials.map((item) => ({ ...item, typeRemark: remarks.get(item.type) || '' }));
}

async function enrichOpenedMaterialTypeRemarks<T extends { material: { type: string } }>(openedMaterials: T[]) {
  const materials = await enrichMaterialTypeRemarks(openedMaterials.map((item) => item.material));
  return openedMaterials.map((item, index) => ({ ...item, material: materials[index] }));
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'expiry-label-server' });
});

app.get('/api/organizations', wrap(async (_req, res) => {
  const organizations = await prisma.organization.findMany({ orderBy: { id: 'asc' } });
  res.json(organizations);
}));

app.get('/api/configs', wrap(async (req, res) => {
  const kind = req.query.kind ? String(req.query.kind) : undefined;
  const configs = await prisma.configItem.findMany({
    where: kind ? { kind } : undefined,
    orderBy: [{ kind: 'asc' }, { sort: 'asc' }, { id: 'asc' }]
  });
  res.json(configs);
}));

app.post('/api/configs', wrap(async (req, res) => {
  const data = configSchema.parse(req.body);
  const config = await prisma.configItem.create({ data });
  res.status(201).json(config);
}));

app.put('/api/configs/:id', wrap(async (req, res) => {
  const data = configSchema.partial().parse(req.body);
  const config = await prisma.configItem.update({ where: { id: Number(req.params.id) }, data });
  res.json(config);
}));

app.patch('/api/configs/:id/status', wrap(async (req, res) => {
  const status = z.object({ status: z.enum(['enabled', 'disabled']) }).parse(req.body).status;
  const config = await prisma.configItem.update({ where: { id: Number(req.params.id) }, data: { status } });
  res.json(config);
}));

app.get('/api/materials', wrap(async (req, res) => {
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const type = req.query.type ? String(req.query.type) : undefined;
  const status = req.query.status ? String(req.query.status) : undefined;

  const materials = await prisma.material.findMany({
    where: {
      ...(category ? { category } : {}),
      ...(type ? { type } : {}),
      ...(status ? { status } : { status: { not: 'deleted' } }),
      ...(keyword ? {
        OR: [
          { code: { contains: keyword } },
          { name: { contains: keyword } }
        ]
      } : {})
    },
    orderBy: { id: 'asc' }
  });
  res.json(await enrichMaterialTypeRemarks(materials));
}));

app.get('/api/materials/:id', wrap(async (req, res) => {
  const material = await prisma.material.findUnique({ where: { id: Number(req.params.id) } });
  if (!material) return res.status(404).json({ message: '物料不存在' });
  const [enriched] = await enrichMaterialTypeRemarks([material]);
  res.json(enriched);
}));

app.post('/api/materials', wrap(async (req, res) => {
  const data = materialSchema.parse(req.body);
  const material = await prisma.material.create({ data });
  res.status(201).json(material);
}));

app.put('/api/materials/:id', wrap(async (req, res) => {
  const data = materialSchema.partial().parse(req.body);
  const material = await prisma.material.update({ where: { id: Number(req.params.id) }, data });
  res.json(material);
}));

app.patch('/api/materials/:id/status', wrap(async (req, res) => {
  const status = z.object({ status: materialStatusSchema }).parse(req.body).status;
  const material = await prisma.material.update({ where: { id: Number(req.params.id) }, data: { status } });
  res.json(material);
}));

app.post('/api/materials/batch-status', wrap(async (req, res) => {
  const payload = z.object({
    ids: z.array(z.coerce.number().int().positive()).min(1),
    status: materialStatusSchema
  }).parse(req.body);
  const result = await prisma.material.updateMany({
    where: { id: { in: payload.ids }, status: { not: 'deleted' } },
    data: { status: payload.status }
  });
  res.json({ count: result.count, status: payload.status });
}));

app.post('/api/materials/import', wrap(async (req, res) => {
  const payload = materialImportSchema.parse(req.body);
  const configs = await prisma.configItem.findMany({ where: { status: 'enabled' } });
  const configNames = {
    category: new Set(configs.filter((item) => item.kind === 'category').map((item) => item.name)),
    type: new Set(configs.filter((item) => item.kind === 'type').map((item) => item.name)),
    unit: new Set(configs.filter((item) => item.kind === 'unit').map((item) => item.name))
  };

  const errors: Array<{ row: number; message: string }> = [];
  const results: Array<{ code: string; action: 'created' | 'updated' }> = [];

  for (const [index, material] of payload.materials.entries()) {
    const row = index + 2;
    const rowErrors = [
      configNames.category.has(material.category) ? '' : `物料分类“${material.category}”不存在或未启用`,
      configNames.type.has(material.type) ? '' : `物料类型“${material.type}”不存在或未启用`,
      configNames.unit.has(material.unit) ? '' : `规格单位“${material.unit}”不存在或未启用`
    ].filter(Boolean);
    if (rowErrors.length) {
      errors.push({ row, message: rowErrors.join('；') });
      continue;
    }

    const existed = await prisma.material.findUnique({ where: { code: material.code } });
    await prisma.material.upsert({
      where: { code: material.code },
      update: material,
      create: material
    });
    results.push({ code: material.code, action: existed ? 'updated' : 'created' });
  }

  res.json({
    created: results.filter((item) => item.action === 'created').length,
    updated: results.filter((item) => item.action === 'updated').length,
    failed: errors.length,
    errors
  });
}));

app.post('/api/labels/print', wrap(async (req, res) => {
  const payload = z.object({
    materialId: z.coerce.number().int().positive(),
    printCount: z.coerce.number().int().min(1).max(99).default(1)
  }).parse(req.body);

  const material = await prisma.material.findUnique({ where: { id: payload.materialId } });
  if (!material || material.status !== 'enabled') return res.status(400).json({ message: '物料不可打印' });

  const openedAt = new Date();
  const expiresAt = addLife(openedAt, material.openedLifeValue, material.openedLifeUnit as TimeUnit);
  const organizationId = await defaultOrgId();

  const openedMaterial = await prisma.openedMaterial.create({
    data: {
      materialId: material.id,
      organizationId,
      openedAt,
      expiresAt,
      status: getComputedStatus({ status: 'normal', expiresAt }),
      quantity: 1,
      operator: defaultOperator
    },
    include: { material: true, organization: true }
  });

  const printLog = await prisma.printLog.create({
    data: {
      materialId: material.id,
      openedMaterialId: openedMaterial.id,
      organizationId,
      printType: 'initial',
      printCount: payload.printCount,
      openedAt,
      expiresAt,
      operator: defaultOperator
    }
  });

  const [enrichedOpened] = await enrichOpenedMaterialTypeRemarks([openedMaterial]);
  res.status(201).json({ openedMaterial: enrichedOpened, printLog });
}));

app.post('/api/opened-materials/:id/reprint', wrap(async (req, res) => {
  await refreshOpenedStatuses();
  const opened = await prisma.openedMaterial.findUnique({
    where: { id: Number(req.params.id) },
    include: { material: true }
  });
  if (!opened) return res.status(404).json({ message: '开封物料不存在' });
  if (getComputedStatus(opened) === 'expired') return res.status(400).json({ message: '已过期物料不能补打标签，仅可废弃' });

  const printLog = await prisma.printLog.create({
    data: {
      materialId: opened.materialId,
      openedMaterialId: opened.id,
      organizationId: opened.organizationId,
      printType: 'reprint',
      printCount: 1,
      openedAt: opened.openedAt,
      expiresAt: opened.expiresAt,
      operator: defaultOperator
    }
  });

  const [enrichedOpened] = await enrichOpenedMaterialTypeRemarks([opened]);
  res.status(201).json({ openedMaterial: enrichedOpened, printLog });
}));

app.get('/api/opened-materials', wrap(async (req, res) => {
  await refreshOpenedStatuses();
  const status = req.query.status ? String(req.query.status) : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const keyword = req.query.keyword ? String(req.query.keyword) : undefined;

  const openedMaterials = await prisma.openedMaterial.findMany({
    where: {
      ...(status && status !== 'all' ? { status } : { status: { in: ['normal', 'warning', 'expired'] } }),
      ...(category && category !== 'all' ? { material: { category } } : {}),
      ...(keyword ? {
        OR: [
          { material: { code: { contains: keyword } } },
          { material: { name: { contains: keyword } } }
        ]
      } : {})
    },
    include: { material: true, organization: true },
    orderBy: { expiresAt: 'asc' }
  });

  const enrichedOpenedMaterials = await enrichOpenedMaterialTypeRemarks(openedMaterials);
  res.json(enrichedOpenedMaterials.map((item) => ({
    ...item,
    remainingText: remainingText(item.expiresAt),
    computedStatus: getComputedStatus(item)
  })));
}));

app.get('/api/opened-materials/:id', wrap(async (req, res) => {
  await refreshOpenedStatuses();
  const opened = await prisma.openedMaterial.findUnique({
    where: { id: Number(req.params.id) },
    include: { material: true, organization: true }
  });
  if (!opened) return res.status(404).json({ message: '开封物料不存在' });
  const [enrichedOpened] = await enrichOpenedMaterialTypeRemarks([opened]);
  res.json({ ...enrichedOpened, remainingText: remainingText(enrichedOpened.expiresAt), computedStatus: getComputedStatus(enrichedOpened) });
}));

app.post('/api/opened-materials/:id/use', wrap(async (req, res) => {
  await refreshOpenedStatuses();
  const opened = await prisma.openedMaterial.findUnique({
    where: { id: Number(req.params.id) },
    include: { material: true }
  });
  if (!opened) return res.status(404).json({ message: '开封物料不存在' });
  if (getComputedStatus(opened) === 'expired') return res.status(400).json({ message: '已过期物料不能使用，仅可废弃' });

  const updated = await prisma.openedMaterial.update({ where: { id: opened.id }, data: { status: 'used' } });
  const log = await prisma.operationLog.create({
    data: {
      materialId: opened.materialId,
      openedMaterialId: opened.id,
      organizationId: opened.organizationId,
      operationType: 'use',
      quantity: 1,
      unit: opened.material.unit,
      operator: defaultOperator
    }
  });
  res.json({ openedMaterial: updated, operationLog: log });
}));

app.post('/api/opened-materials/:id/scrap', wrap(async (req, res) => {
  await refreshOpenedStatuses();
  const payload = z.object({
    quantity: z.coerce.number().int().min(1).default(1),
    remark: z.string().optional().nullable()
  }).parse(req.body);

  const opened = await prisma.openedMaterial.findUnique({
    where: { id: Number(req.params.id) },
    include: { material: true }
  });
  if (!opened) return res.status(404).json({ message: '开封物料不存在' });

  const updated = await prisma.openedMaterial.update({ where: { id: opened.id }, data: { status: 'scrapped' } });
  const log = await prisma.operationLog.create({
    data: {
      materialId: opened.materialId,
      openedMaterialId: opened.id,
      organizationId: opened.organizationId,
      operationType: 'scrap',
      quantity: payload.quantity,
      unit: opened.material.unit,
      remark: payload.remark,
      operator: defaultOperator
    }
  });
  res.json({ openedMaterial: updated, operationLog: log });
}));

app.post('/api/opened-materials/batch-use', wrap(async (req, res) => {
  const ids = z.object({ ids: z.array(z.coerce.number().int().positive()).min(1) }).parse(req.body).ids;
  const results = [];
  for (const id of ids) {
    const opened = await prisma.openedMaterial.findUnique({ where: { id }, include: { material: true } });
    if (!opened || getComputedStatus(opened) === 'expired') continue;
    results.push(await prisma.openedMaterial.update({ where: { id }, data: { status: 'used' } }));
    await prisma.operationLog.create({
      data: {
        materialId: opened.materialId,
        openedMaterialId: opened.id,
        organizationId: opened.organizationId,
        operationType: 'use',
        quantity: 1,
        unit: opened.material.unit,
        operator: defaultOperator
      }
    });
  }
  res.json({ count: results.length, items: results });
}));

app.post('/api/opened-materials/batch-scrap', wrap(async (req, res) => {
  const items = z.object({
    items: z.array(z.object({
      id: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1),
      remark: z.string().optional().nullable()
    })).min(1)
  }).parse(req.body).items;

  const results = [];
  for (const item of items) {
    const opened = await prisma.openedMaterial.findUnique({ where: { id: item.id }, include: { material: true } });
    if (!opened) continue;
    results.push(await prisma.openedMaterial.update({ where: { id: item.id }, data: { status: 'scrapped' } }));
    await prisma.operationLog.create({
      data: {
        materialId: opened.materialId,
        openedMaterialId: opened.id,
        organizationId: opened.organizationId,
        operationType: 'scrap',
        quantity: item.quantity,
        unit: opened.material.unit,
        remark: item.remark,
        operator: defaultOperator
      }
    });
  }
  res.json({ count: results.length, items: results });
}));

app.get('/api/dashboard', wrap(async (req, res) => {
  await refreshOpenedStatuses();
  const status = req.query.status ? String(req.query.status) : undefined;
  const dashboardDateRange = dateRangeWhere(req.query.startAt ? String(req.query.startAt) : undefined, req.query.endAt ? String(req.query.endAt) : undefined);
  const printDateRange = dateRangeWhere(req.query.printStartAt ? String(req.query.printStartAt) : undefined, req.query.printEndAt ? String(req.query.printEndAt) : undefined);
  const scrapDateRange = dateRangeWhere(req.query.scrapStartAt ? String(req.query.scrapStartAt) : undefined, req.query.scrapEndAt ? String(req.query.scrapEndAt) : undefined);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [materialCount, todayPrintCount, warningCount, monthScrapCount, usageLogs, openedMaterials, printLogs, scrapLogs] = await Promise.all([
    prisma.material.count({ where: { status: { not: 'deleted' } } }),
    prisma.printLog.aggregate({ where: { createdAt: { gte: today } }, _sum: { printCount: true } }),
    prisma.openedMaterial.count({ where: { status: { in: ['warning', 'expired'] } } }),
    prisma.operationLog.count({ where: { operationType: 'scrap', createdAt: { gte: monthStart } } }),
    prisma.operationLog.findMany({ where: { ...(dashboardDateRange ? { createdAt: dashboardDateRange } : {}) }, include: { material: true }, orderBy: { createdAt: 'desc' } }),
    prisma.openedMaterial.findMany({
      where: {
        ...(status && status !== 'all'
          ? status === 'processed' ? { status: { in: ['used', 'scrapped'] } } : { status }
          : { status: { in: ['normal', 'warning', 'expired'] } }),
        ...(dashboardDateRange ? { createdAt: dashboardDateRange } : {})
      },
      include: { material: true, organization: true },
      orderBy: { expiresAt: 'asc' },
      take: 50
    }),
    prisma.printLog.findMany({ where: { ...(printDateRange ? { createdAt: printDateRange } : {}) }, include: { material: true, organization: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.operationLog.findMany({ where: { operationType: 'scrap', ...(scrapDateRange ? { createdAt: scrapDateRange } : {}) }, include: { material: true, organization: true, openedMaterial: true }, orderBy: { createdAt: 'desc' }, take: 50 })
  ]);

  const usageMap = new Map<number, { material: unknown; useCount: number; scrapCount: number }>();
  for (const log of usageLogs) {
    if (!usageMap.has(log.materialId)) usageMap.set(log.materialId, { material: log.material, useCount: 0, scrapCount: 0 });
    const item = usageMap.get(log.materialId)!;
    if (log.operationType === 'use') item.useCount += 1;
    if (log.operationType === 'scrap') item.scrapCount += 1;
  }

  res.json({
    stats: {
      materialCount,
      todayPrintCount: todayPrintCount._sum.printCount || 0,
      warningCount,
      monthScrapCount
    },
    usage: Array.from(usageMap.values()).map((item) => {
      const total = item.useCount + item.scrapCount;
      return { ...item, usageRate: total ? `${Math.round(item.useCount / total * 1000) / 10}%` : '0%' };
    }),
    openedMaterials: openedMaterials.map((item) => ({ ...item, remainingText: remainingText(item.expiresAt), computedStatus: getComputedStatus(item) })),
    printLogs,
    scrapLogs
  });
}));

app.get('/api/logs/prints', wrap(async (_req, res) => {
  const logs = await prisma.printLog.findMany({ include: { material: true, organization: true }, orderBy: { createdAt: 'desc' } });
  res.json(logs);
}));

app.get('/api/logs/scraps', wrap(async (_req, res) => {
  const logs = await prisma.operationLog.findMany({
    where: { operationType: 'scrap' },
    include: { material: true, organization: true, openedMaterial: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json(logs);
}));

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ message: '参数校验失败', issues: error.issues });
  console.error(error);
  res.status(500).json({ message: '服务器异常' });
});

app.listen(port, () => {
  console.log(`Expiry label server is running at http://localhost:${port}`);
});
