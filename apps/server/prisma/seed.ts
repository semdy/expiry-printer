import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const now = new Date();

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, name: '北京朝阳店' }
  });

  const configs = [
    ['category', 'CAT001', '原料', 1],
    ['category', 'CAT002', '半成品', 2],
    ['category', 'CAT003', '成品', 3],
    ['category', 'CAT004', '小料', 4],
    ['category', 'CAT005', '调料', 5],
    ['type', 'TYPE001', '冷藏', 1, '0-4°C'],
    ['type', 'TYPE002', '冷冻', 2, '-18°C'],
    ['type', 'TYPE003', '常温', 3, '常温避光'],
    ['unit', 'UNIT001', '盒', 1],
    ['unit', 'UNIT002', '袋', 2],
    ['unit', 'UNIT003', '颗', 3],
    ['unit', 'UNIT004', '瓶', 4],
    ['unit', 'UNIT005', '个', 5]
  ] as const;

  for (const item of configs) {
    await prisma.configItem.upsert({
      where: { kind_code: { kind: item[0], code: item[1] } },
      update: { name: item[2], sort: item[3], extra: item[4] ?? null, status: 'enabled' },
      create: { kind: item[0], code: item[1], name: item[2], sort: item[3], extra: item[4] ?? null }
    });
  }

  const materials = [
    ['MAT001', '牛奶', '原料', '冷藏', '盒', 7, 'days', 24, 'hours'],
    ['MAT002', '面包', '成品', '常温', '个', 3, 'days', 12, 'hours'],
    ['MAT004', '薯条', '半成品', '冷冻', '袋', 90, 'days', 30, 'minutes'],
    ['MAT005', '番茄酱', '调料', '常温', '瓶', 180, 'days', 30, 'days'],
    ['MAT006', '芝士片', '半成品', '冷藏', '盒', 15, 'days', 3, 'days'],
    ['MAT007', '鸡胸肉', '原料', '冷冻', '袋', 180, 'days', 24, 'hours'],
    ['MAT008', '生菜', '原料', '冷藏', '颗', 5, 'days', 2, 'days'],
    ['MAT009', '汉堡胚', '半成品', '常温', '袋', 5, 'days', 12, 'hours']
  ] as const;

  const createdMaterials = [];
  for (const item of materials) {
    createdMaterials.push(await prisma.material.upsert({
      where: { code: item[0] },
      update: {
        name: item[1],
        category: item[2],
        type: item[3],
        unit: item[4],
        shelfLifeValue: item[5],
        shelfLifeUnit: item[6],
        openedLifeValue: item[7],
        openedLifeUnit: item[8],
        status: 'enabled'
      },
      create: {
        code: item[0],
        name: item[1],
        category: item[2],
        type: item[3],
        unit: item[4],
        shelfLifeValue: item[5],
        shelfLifeUnit: item[6],
        openedLifeValue: item[7],
        openedLifeUnit: item[8],
        status: 'enabled'
      }
    }));
  }

  const milk = createdMaterials.find((item) => item.code === 'MAT001')!;
  const fries = createdMaterials.find((item) => item.code === 'MAT004')!;
  const lettuce = createdMaterials.find((item) => item.code === 'MAT008')!;

  await prisma.openedMaterial.createMany({
    data: [
      {
        materialId: milk.id,
        organizationId: org.id,
        openedAt: addMinutes(now, -22 * 60),
        expiresAt: addMinutes(now, 2 * 60),
        status: 'warning',
        quantity: 1,
        operator: '张三'
      },
      {
        materialId: fries.id,
        organizationId: org.id,
        openedAt: addMinutes(now, -90),
        expiresAt: addMinutes(now, -60),
        status: 'expired',
        quantity: 1,
        operator: '李四'
      },
      {
        materialId: lettuce.id,
        organizationId: org.id,
        openedAt: addMinutes(now, -12 * 60),
        expiresAt: addMinutes(now, 36 * 60),
        status: 'normal',
        quantity: 1,
        operator: '王五'
      }
    ],
    skipDuplicates: true
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
