import { Button, Dropdown, Form, Input, InputNumber, Modal, Radio, Select, Space, Table, Tabs, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import type { Dispatch, Key, SetStateAction } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { apiGet, apiSend } from './api';

type Page = 'materials' | 'configs' | 'dashboard' | 'prints' | 'scraps';
type ConfigKind = 'category' | 'type' | 'unit';

type ConfigItem = {
  id: number;
  kind: ConfigKind;
  code: string;
  name: string;
  sort: number;
  extra?: string;
  status: 'enabled' | 'disabled';
};

type Material = {
  id: number;
  code: string;
  name: string;
  category: string;
  type: string;
  unit: string;
  shelfLifeValue: number;
  shelfLifeUnit: string;
  openedLifeValue: number;
  openedLifeUnit: string;
  status: 'enabled' | 'disabled' | 'deleted';
  remark?: string;
  createdAt?: string;
};

type UsageRow = {
  material: Material;
  useCount: number;
  scrapCount: number;
  usageRate: string;
};

type MaterialImportRow = Omit<Material, 'id'>;
type RangeQuery = { startAt: string; endAt: string };
type DashboardQuery = RangeQuery & { status: string; preset: string };
type LogQuery = RangeQuery & { preset: string };
type StateSetter<T> = Dispatch<SetStateAction<T>>;

const emptyDashboard = { stats: {}, usage: [], openedMaterials: [], printLogs: [], scrapLogs: [] } as any;
const appNavItems = [
  { label: '工作台', icon: 'workbench' },
  { label: '消息', icon: 'message' },
  { label: '联系人', icon: 'contacts' },
  { label: '日历', icon: 'calendar' },
  { label: '云空间', icon: 'cloud' },
  { label: '知识库', icon: 'knowledge' }
] as const;

export default function App() {
  const [page, setPage] = useState<Page>('materials');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [dashboard, setDashboard] = useState<any>(emptyDashboard);
  const [materialQuery, setMaterialQuery] = useState({ keyword: '', category: '', type: '', status: '' });
  const [dashboardQuery, setDashboardQuery] = useState<DashboardQuery>({
    status: '',
    startAt: '',
    endAt: '',
    preset: ''
  });
  const [printLogQuery, setPrintLogQuery] = useState<LogQuery>({ startAt: '', endAt: '', preset: '' });
  const [scrapLogQuery, setScrapLogQuery] = useState<LogQuery>({ startAt: '', endAt: '', preset: '' });
  const [configKind, setConfigKind] = useState<ConfigKind>('category');
  const [materialOpen, setMaterialOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editingConfig, setEditingConfig] = useState<ConfigItem | null>(null);
  const [selectedMaterialIds, setSelectedMaterialIds] = useState<number[]>([]);
  const [confirmAction, setConfirmAction] = useState<null | {
    title: string;
    content: string;
    okText: string;
    danger?: boolean;
    onOk: () => Promise<void>;
  }>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [materialForm] = Form.useForm();
  const [configForm] = Form.useForm();
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const categories = useMemo(
    () => configs.filter((item) => item.kind === 'category' && item.status === 'enabled'),
    [configs]
  );
  const types = useMemo(() => configs.filter((item) => item.kind === 'type' && item.status === 'enabled'), [configs]);
  const units = useMemo(() => configs.filter((item) => item.kind === 'unit' && item.status === 'enabled'), [configs]);
  const warningOpened = useMemo(
    () => dashboard.openedMaterials.filter((item: any) => ['warning', 'expired'].includes(item.computedStatus)),
    [dashboard]
  );
  const selectedMaterials = useMemo(
    () => materials.filter((item) => selectedMaterialIds.includes(item.id)),
    [materials, selectedMaterialIds]
  );
  const selectedEnabledMaterials = useMemo(
    () => selectedMaterials.filter((item) => item.status === 'enabled'),
    [selectedMaterials]
  );
  const selectedDisabledMaterials = useMemo(
    () => selectedMaterials.filter((item) => item.status === 'disabled'),
    [selectedMaterials]
  );

  useEffect(() => {
    void Promise.all([loadConfigs(), loadMaterials(), loadDashboard()]);
  }, []);

  useEffect(() => {
    if (['dashboard', 'prints', 'scraps'].includes(page)) void loadDashboard();
  }, [page]);

  async function loadMaterials() {
    const params = new URLSearchParams();
    if (materialQuery.keyword) params.set('keyword', materialQuery.keyword);
    if (materialQuery.category) params.set('category', materialQuery.category);
    if (materialQuery.type) params.set('type', materialQuery.type);
    if (materialQuery.status) params.set('status', materialQuery.status);
    setMaterials(await apiGet(`/api/materials?${params.toString()}`));
  }

  async function loadConfigs() {
    setConfigs(await apiGet('/api/configs'));
  }

  async function loadDashboard() {
    const params = new URLSearchParams();
    if (dashboardQuery.status) params.set('status', dashboardQuery.status);
    appendDateRange(params, '', dashboardQuery);
    appendDateRange(params, 'print', printLogQuery);
    appendDateRange(params, 'scrap', scrapLogQuery);
    setDashboard(await apiGet(`/api/dashboard?${params.toString()}`));
  }

  function updatePreset<T extends RangeQuery & { preset: string }>(preset: string, setter: StateSetter<T>, current: T) {
    setter({ ...current, ...presetRange(preset), preset });
  }

  function openMaterial(row?: Material) {
    setEditingMaterial(row || null);
    materialForm.setFieldsValue(
      row || {
        code: '',
        name: '',
        category: '原料',
        type: '冷藏',
        unit: '盒',
        shelfLifeValue: 1,
        shelfLifeUnit: 'days',
        openedLifeValue: 1,
        openedLifeUnit: 'days',
        status: 'enabled',
        remark: ''
      }
    );
    setMaterialOpen(true);
  }

  async function saveMaterial() {
    const values = await materialForm.validateFields();
    if (editingMaterial) await apiSend(`/api/materials/${editingMaterial.id}`, 'PUT', values);
    else await apiSend('/api/materials', 'POST', values);
    setMaterialOpen(false);
    message.success('保存成功');
    await Promise.all([loadMaterials(), loadDashboard()]);
  }

  function toggleMaterial(row: Material) {
    const nextStatus = row.status === 'enabled' ? 'disabled' : 'enabled';
    const actionText = nextStatus === 'enabled' ? '启用' : '禁用';
    setConfirmAction({
      title: `确认${actionText}物料`,
      content: `确定要${actionText}“${row.name}”吗？`,
      okText: `确认${actionText}`,
      danger: nextStatus === 'disabled',
      async onOk() {
        await apiSend(`/api/materials/${row.id}/status`, 'PATCH', { status: nextStatus });
        message.success(`${actionText}成功`);
        setSelectedMaterialIds([]);
        await loadMaterials();
      }
    });
  }

  function deleteMaterial(row: Material) {
    setConfirmAction({
      title: '确认删除物料',
      content: `确定要删除“${row.name}”吗？删除后将不在物料配置列表中显示。`,
      okText: '确认删除',
      danger: true,
      async onOk() {
        await apiSend(`/api/materials/${row.id}/status`, 'PATCH', { status: 'deleted' });
        message.success('删除成功');
        setSelectedMaterialIds((ids) => ids.filter((id) => id !== row.id));
        await Promise.all([loadMaterials(), loadDashboard()]);
      }
    });
  }

  function batchChangeMaterials(status: 'enabled' | 'disabled' | 'deleted', rows: Material[]) {
    if (!rows.length) {
      message.warning('请先选择符合条件的物料');
      return;
    }
    const actionText = status === 'enabled' ? '启用' : status === 'disabled' ? '禁用' : '删除';
    const content =
      status === 'deleted'
        ? `确定要批量删除已选择的 ${rows.length} 个物料吗？删除后将不在物料配置列表中显示。`
        : `确定要批量${actionText}已选择的 ${rows.length} 个${status === 'enabled' ? '禁用' : '启用'}状态物料吗？`;
    setConfirmAction({
      title: `确认批量${actionText}物料`,
      content,
      okText: `确认${actionText}`,
      danger: status !== 'enabled',
      async onOk() {
        const result = await apiSend<{ count: number }>('/api/materials/batch-status', 'POST', {
          ids: rows.map((item) => item.id),
          status
        });
        message.success(`批量${actionText}成功，共处理 ${result.count} 条`);
        setSelectedMaterialIds([]);
        await Promise.all([loadMaterials(), loadDashboard()]);
      }
    });
  }

  function openImportModal() {
    setImportFile(null);
    setImportOpen(true);
  }

  function downloadMaterialTemplate() {
    const headers = [
      '物料编码',
      '物料名称',
      '物料分类',
      '物料类型',
      '规格单位',
      '保质期数值',
      '保质期单位',
      '开封效期数值',
      '开封效期单位',
      '状态',
      '备注'
    ];
    const sampleRows = [
      [
        'MAT001',
        '牛奶',
        categories[0]?.name || '原料',
        types[0]?.name || '冷藏',
        units[0]?.name || '盒',
        7,
        '天',
        24,
        '小时',
        '启用',
        '示例行，可删除后填写'
      ],
      [
        'MAT002',
        '面包',
        categories[1]?.name || categories[0]?.name || '成品',
        types[1]?.name || types[0]?.name || '常温',
        units[1]?.name || units[0]?.name || '个',
        3,
        '天',
        12,
        '小时',
        '启用',
        ''
      ]
    ];
    const workbook = XLSX.utils.book_new();
    const materialSheet = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    materialSheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length * 2 + 4) }));
    XLSX.utils.book_append_sheet(workbook, materialSheet, '物料导入模板');

    const configSheet = XLSX.utils.aoa_to_sheet([
      ['配置类型', '可填写名称'],
      ...categories.map((item) => ['物料分类', item.name]),
      ...types.map((item) => ['物料类型', item.name]),
      ...units.map((item) => ['规格单位', item.name]),
      ['效期单位', '分钟'],
      ['效期单位', '小时'],
      ['效期单位', '天'],
      ['状态', '启用'],
      ['状态', '禁用']
    ]);
    configSheet['!cols'] = [{ wch: 16 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(workbook, configSheet, '可选配置');
    XLSX.writeFile(workbook, '物料批量导入模板.xlsx');
  }

  async function importMaterialExcel(file: File) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      .filter((row) => ['物料编码', '物料名称', '物料分类', '物料类型', '规格单位'].some((key) => cellText(row[key])));
    const errors: string[] = [];
    const materials: MaterialImportRow[] = [];
    const categoryNames = new Set(categories.map((item) => item.name));
    const typeNames = new Set(types.map((item) => item.name));
    const unitNames = new Set(units.map((item) => item.name));

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const material = parseMaterialImportRow(row);
      const rowErrors = validateMaterialImportRow(material, rowNumber, categoryNames, typeNames, unitNames);
      if (rowErrors.length) errors.push(...rowErrors);
      else materials.push(material);
    });

    if (!rows.length) {
      message.warning('Excel 中没有可导入的数据');
      return;
    }
    if (errors.length) {
      Modal.error({ title: '导入校验失败', content: <ImportErrorList errors={errors} /> });
      return;
    }

    const result = await apiSend<{
      created: number;
      updated: number;
      failed: number;
      errors: Array<{ row: number; message: string }>;
    }>('/api/materials/import', 'POST', { materials });
    if (result.failed) {
      Modal.warning({
        title: '部分导入失败',
        content: <ImportErrorList errors={result.errors.map((item) => `第 ${item.row} 行：${item.message}`)} />
      });
    } else {
      message.success(`导入完成：新增 ${result.created} 条，更新 ${result.updated} 条`);
      setImportOpen(false);
      setImportFile(null);
    }
    await Promise.all([loadMaterials(), loadDashboard()]);
  }

  function acceptImportFile(file?: File) {
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (!isExcel) {
      message.warning('请上传 xls 或 xlsx 格式的 Excel 文件');
      return;
    }
    setImportFile(file);
  }

  async function confirmImportMaterial() {
    if (!importFile) {
      message.warning('请先选择要导入的 Excel 文件');
      return;
    }
    await importMaterialExcel(importFile);
  }

  function openConfig(row?: ConfigItem) {
    setEditingConfig(row || null);
    configForm.setFieldsValue(row || { kind: configKind, code: '', name: '', sort: 1, extra: '', status: 'enabled' });
    setConfigOpen(true);
  }

  async function saveConfig() {
    const values = await configForm.validateFields();
    if (editingConfig) await apiSend(`/api/configs/${editingConfig.id}`, 'PUT', values);
    else await apiSend('/api/configs', 'POST', values);
    setConfigOpen(false);
    message.success('保存成功');
    await loadConfigs();
  }

  function toggleConfig(row: ConfigItem) {
    const nextStatus = row.status === 'enabled' ? 'disabled' : 'enabled';
    const actionText = nextStatus === 'enabled' ? '启用' : '禁用';
    setConfirmAction({
      title: `确认${actionText}配置`,
      content: `确定要${actionText}“${row.name}”吗？`,
      okText: `确认${actionText}`,
      danger: nextStatus === 'disabled',
      async onOk() {
        await apiSend(`/api/configs/${row.id}/status`, 'PATCH', { status: nextStatus });
        message.success(`${actionText}成功`);
        await loadConfigs();
      }
    });
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      await confirmAction.onOk();
      setConfirmAction(null);
    } finally {
      setConfirmLoading(false);
    }
  }

  const materialColumns: ColumnsType<Material> = [
    { title: '序号', render: (_v, _r, index) => index + 1, width: 70 },
    { title: '物料编码', dataIndex: 'code' },
    { title: '物料名称', dataIndex: 'name' },
    { title: '物料分类', dataIndex: 'category' },
    { title: '物料类型', dataIndex: 'type' },
    { title: '规格单位', dataIndex: 'unit' },
    { title: '保质期', render: (_, row) => `${row.shelfLifeValue}${unitText(row.shelfLifeUnit)}` },
    { title: '开封效期', render: (_, row) => `${row.openedLifeValue}${unitText(row.openedLifeUnit)}` },
    { title: '状态', render: (_, row) => <StatusTag status={row.status} /> },
    { title: '创建时间', render: (_, row) => formatShortDate(row.createdAt) },
    {
      title: '操作',
      width: 90,
      align: 'center',
      render: (_, row) => (
        <MaterialActions row={row} onEdit={openMaterial} onToggle={toggleMaterial} onDelete={deleteMaterial} />
      )
    }
  ];

  const materialRowSelection = {
    selectedRowKeys: selectedMaterialIds,
    onChange: (keys: Key[]) => setSelectedMaterialIds(keys.map((key) => Number(key)))
  };

  const title = {
    materials: '物料配置',
    configs: '自定义配置',
    dashboard: '数据中心',
    prints: '效期打印日志',
    scraps: '物料废弃日志'
  }[page];

  return (
    <div className="admin-shell">
      <aside className="system-sidebar">
        <div className="system-logo-static" aria-label="IMSDOM">
          <svg viewBox="0 0 36 24" aria-hidden="true">
            <path d="M3 18.5C7.3 8.2 10.9 3 14 3c2 0 3.8 2.1 5.3 6.2C21 5.1 23 3 25.3 3c2.7 0 5.3 4.7 7.8 14.2" />
            <path d="M12.1 14.3c2.1-4.9 4.2-4.9 6.2 0l1.2 2.8c2.1 5 4.2 5 6.3 0" />
          </svg>
        </div>
        <div className="side-icons">
          {appNavItems.map((item) => (
            <div className="side-nav-item" key={item.label}>
              <AppNavIcon name={item.icon} />
              <span>{item.label}</span>
            </div>
          ))}
          <div className="side-nav-more">···</div>
        </div>
        <div className="system-bottom-icon">蒋</div>
      </aside>
      <aside className="func-menu">
        <div className="func-title">效期标签打印</div>
        <div className={`menu-item ${page === 'materials' ? 'active' : ''}`} onClick={() => setPage('materials')}>
          ▧ 物料配置
        </div>
        <div className={`menu-item ${page === 'configs' ? 'active' : ''}`} onClick={() => setPage('configs')}>
          ▨ 自定义配置
        </div>
        <div
          className={`menu-item ${['dashboard', 'prints', 'scraps'].includes(page) ? 'active' : ''}`}
          onClick={() => setPage('dashboard')}
        >
          ▩ 数据中心
        </div>
        <div className="submenu">
          <span className={page === 'prints' ? 'active' : ''} onClick={() => setPage('prints')}>
            效期打印日志
          </span>
          <span className={page === 'scraps' ? 'active' : ''} onClick={() => setPage('scraps')}>
            物料废弃日志
          </span>
        </div>
      </aside>
      <div className="main">
        <header className="header">
          <div className="header-title">{title}</div>
          {page === 'materials' && (
            <div className="header-actions">
              <div className="search-box">
                <Input
                  className="search-input"
                  placeholder="搜索物料名称、编码"
                  allowClear
                  value={materialQuery.keyword}
                  onChange={(event) => setMaterialQuery({ ...materialQuery, keyword: event.target.value })}
                  onPressEnter={loadMaterials}
                />
                <span className="search-icon">🔍</span>
              </div>
              <Button className="btn btn-secondary" onClick={openImportModal}>
                导入物料
              </Button>
              <Button className="btn btn-primary" type="primary" onClick={() => openMaterial()}>
                + 新增物料
              </Button>
            </div>
          )}
          {page === 'configs' && (
            <Button className="btn btn-primary" type="primary" onClick={() => openConfig()}>
              新增配置
            </Button>
          )}
        </header>
        <section className={`content ${page === 'materials' ? 'content-fixed' : ''}`}>
          {page === 'materials' && (
            <div className="material-page">
              <div className="filter-bar">
                <div className="filter-item">
                  <label>物料分类</label>
                  <Select
                    className="form-select"
                    placeholder="全部分类"
                    allowClear
                    value={materialQuery.category || undefined}
                    onChange={(value) => setMaterialQuery({ ...materialQuery, category: value || '' })}
                    options={categories.map((item) => ({ label: item.name, value: item.name }))}
                    style={{ width: 140 }}
                  />
                </div>
                <div className="filter-item">
                  <label>物料类型</label>
                  <Select
                    className="form-select"
                    placeholder="全部类型"
                    allowClear
                    value={materialQuery.type || undefined}
                    onChange={(value) => setMaterialQuery({ ...materialQuery, type: value || '' })}
                    options={types.map((item) => ({ label: item.name, value: item.name }))}
                    style={{ width: 140 }}
                  />
                </div>
                <div className="filter-item">
                  <label>状态</label>
                  <Select
                    className="form-select"
                    placeholder="全部状态"
                    allowClear
                    value={materialQuery.status || undefined}
                    onChange={(value) => setMaterialQuery({ ...materialQuery, status: value || '' })}
                    options={[
                      { label: '启用', value: 'enabled' },
                      { label: '禁用', value: 'disabled' }
                    ]}
                    style={{ width: 110 }}
                  />
                </div>
                <Button className="btn btn-primary btn-sm" type="primary" onClick={loadMaterials}>
                  查询
                </Button>
                <Button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setMaterialQuery({ keyword: '', category: '', type: '', status: '' });
                    void loadMaterials();
                  }}
                >
                  重置
                </Button>
              </div>
              <div className="card material-table-card">
                <div className="card-header">
                  <div className="card-title">物料列表</div>
                  <span className="text-sm text-gray">共 {materials.length} 条记录</span>
                </div>
                <Table
                  className="prototype-table"
                  rowKey="id"
                  rowSelection={materialRowSelection}
                  columns={materialColumns}
                  dataSource={materials}
                  pagination={false}
                  scroll={{
                    x: 'max-content',
                    y: selectedMaterials.length > 0 ? 'calc(100vh - 394px)' : 'calc(100vh - 322px)'
                  }}
                />
              </div>
              {selectedMaterials.length > 0 && (
                <div className="material-batch-bar">
                  <div className="batch-selected-info">
                    <span className="batch-selected-check">✓</span>
                    <span>已选 {selectedMaterials.length} 项</span>
                    <button className="batch-clear-btn" onClick={() => setSelectedMaterialIds([])}>
                      取消选择
                    </button>
                  </div>
                  <div className="batch-actions">
                    {selectedEnabledMaterials.length > 0 && (
                      <Button
                        className="btn btn-secondary"
                        danger
                        onClick={() => batchChangeMaterials('disabled', selectedEnabledMaterials)}
                      >
                        批量禁用
                      </Button>
                    )}
                    <Button
                      className="btn btn-secondary"
                      danger
                      onClick={() => batchChangeMaterials('deleted', selectedMaterials)}
                    >
                      批量删除
                    </Button>
                    {selectedDisabledMaterials.length > 0 && (
                      <Button
                        className="btn btn-primary"
                        type="primary"
                        onClick={() => batchChangeMaterials('enabled', selectedDisabledMaterials)}
                      >
                        批量启用
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {page === 'configs' && (
            <div className="panel">
              <Tabs
                activeKey={configKind}
                onChange={(key) => setConfigKind(key as ConfigKind)}
                items={[
                  { key: 'category', label: '物料分类' },
                  { key: 'type', label: '物料类型' },
                  { key: 'unit', label: '规格单位' }
                ]}
              />
              <Table
                rowKey="id"
                dataSource={configs.filter((item) => item.kind === configKind)}
                pagination={false}
                columns={[
                  { title: '序号', render: (_v, _r, index) => index + 1, width: 70 },
                  { title: '编码', dataIndex: 'code' },
                  { title: '名称', dataIndex: 'name' },
                  { title: '备注', dataIndex: 'extra' },
                  { title: '排序', dataIndex: 'sort' },
                  { title: '状态', render: (_, row: ConfigItem) => <StatusTag status={row.status} /> },
                  {
                    title: '操作',
                    render: (_, row: ConfigItem) => (
                      <Space>
                        <Button type="link" onClick={() => openConfig(row)}>
                          编辑
                        </Button>
                        <Button type="link" danger onClick={() => toggleConfig(row)}>
                          {row.status === 'enabled' ? '禁用' : '启用'}
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </div>
          )}

          {page === 'dashboard' && (
            <Dashboard
              dashboard={dashboard}
              warningOpened={warningOpened}
              query={dashboardQuery}
              onQueryChange={setDashboardQuery}
              onPresetChange={(preset) => updatePreset(preset, setDashboardQuery, dashboardQuery)}
              onSearch={loadDashboard}
            />
          )}
          {page === 'prints' && (
            <PrintLogs
              logs={dashboard.printLogs}
              query={printLogQuery}
              onQueryChange={setPrintLogQuery}
              onPresetChange={(preset) => updatePreset(preset, setPrintLogQuery, printLogQuery)}
              onSearch={loadDashboard}
            />
          )}
          {page === 'scraps' && (
            <ScrapLogs
              logs={dashboard.scrapLogs}
              query={scrapLogQuery}
              onQueryChange={setScrapLogQuery}
              onPresetChange={(preset) => updatePreset(preset, setScrapLogQuery, scrapLogQuery)}
              onSearch={loadDashboard}
            />
          )}
        </section>
      </div>

      <Modal
        open={materialOpen}
        title={editingMaterial ? '编辑物料' : '新增物料'}
        onCancel={() => setMaterialOpen(false)}
        onOk={saveMaterial}
        width={640}
      >
        <Form form={materialForm} layout="vertical">
          <Form.Item name="code" label="物料编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="物料名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="category" label="物料分类" rules={[{ required: true }]}>
            <Select options={categories.map((item) => ({ label: item.name, value: item.name }))} />
          </Form.Item>
          <Form.Item name="type" label="物料类型" rules={[{ required: true }]}>
            <Select options={types.map((item) => ({ label: item.name, value: item.name }))} />
          </Form.Item>
          <Form.Item name="unit" label="规格单位" rules={[{ required: true }]}>
            <Select options={units.map((item) => ({ label: item.name, value: item.name }))} />
          </Form.Item>
          <Space>
            <Form.Item name="shelfLifeValue" label="保质期" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="shelfLifeUnit" label="单位">
              <Select style={{ width: 100 }} options={timeOptions} />
            </Form.Item>
            <Form.Item name="openedLifeValue" label="开封效期" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item name="openedLifeUnit" label="单位">
              <Select style={{ width: 100 }} options={timeOptions} />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="状态">
            <Radio.Group>
              <Radio value="enabled">启用</Radio>
              <Radio value="disabled">禁用</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        open={!!confirmAction}
        title={confirmAction?.title}
        onCancel={() => setConfirmAction(null)}
        onOk={() => {
          void runConfirmAction();
        }}
        confirmLoading={confirmLoading}
        okText={confirmAction?.okText || '确认'}
        cancelText="取消"
        okButtonProps={confirmAction?.danger ? { danger: true } : undefined}
      >
        <p>{confirmAction?.content}</p>
      </Modal>

      <Modal
        open={importOpen}
        title="批量导入物料"
        onCancel={() => setImportOpen(false)}
        footer={
          <div className="import-modal-footer">
            <button className="plain-btn plain-btn-secondary" onClick={() => setImportOpen(false)}>
              取消
            </button>
            <button
              className="plain-btn plain-btn-primary"
              onClick={() => {
                void confirmImportMaterial();
              }}
            >
              导入
            </button>
          </div>
        }
        width={480}
        className="import-modal"
      >
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(event) => {
            acceptImportFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <div
          className={`upload-dropzone ${importFile ? 'has-file' : ''}`}
          onClick={() => importInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={(event) => {
            event.preventDefault();
            acceptImportFile(event.dataTransfer.files?.[0]);
          }}
        >
          <div className="upload-illustration">
            <span className="bar bar-green" />
            <span className="bar bar-red" />
            <span className="bar bar-blue" />
          </div>
          <div className="upload-title">{importFile ? importFile.name : '将文件拖拽到此处或点击上传'}</div>
          <div className="upload-desc">支持格式：xls、xlsx</div>
        </div>
        <div className="template-card">
          <div className="template-info">
            <div className="template-title">📋 批量导入物料模板</div>
            <div className="template-desc">下载批量导入物料模板，根据模板完善内容</div>
          </div>
          <Button className="btn btn-secondary" onClick={downloadMaterialTemplate}>
            下载模板
          </Button>
        </div>
      </Modal>

      <Modal
        open={configOpen}
        title={editingConfig ? '编辑配置' : '新增配置'}
        onCancel={() => setConfigOpen(false)}
        onOk={saveConfig}
      >
        <Form form={configForm} layout="vertical">
          <Form.Item name="kind" label="类型">
            <Select
              options={[
                { label: '物料分类', value: 'category' },
                { label: '物料类型', value: 'type' },
                { label: '规格单位', value: 'unit' }
              ]}
            />
          </Form.Item>
          <Form.Item name="code" label="编码" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="extra" label="备注">
            <Input />
          </Form.Item>
          <Form.Item name="sort" label="排序">
            <InputNumber min={1} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Radio.Group>
              <Radio value="enabled">启用</Radio>
              <Radio value="disabled">禁用</Radio>
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function MaterialActions({
  row,
  onEdit,
  onToggle,
  onDelete
}: {
  row: Material;
  onEdit: (row: Material) => void;
  onToggle: (row: Material) => void;
  onDelete: (row: Material) => void;
}) {
  const items: MenuProps['items'] = [
    { key: 'edit', label: '编辑' },
    { key: 'toggle', label: row.status === 'enabled' ? '禁用' : '启用', danger: row.status === 'enabled' },
    { key: 'delete', label: '删除', danger: true }
  ];

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items,
        onClick: ({ key }) => {
          if (key === 'edit') onEdit(row);
          if (key === 'toggle') onToggle(row);
          if (key === 'delete') onDelete(row);
        }
      }}
    >
      <button className="more-action-btn" aria-label={`更多操作-${row.code}`}>
        ...
      </button>
    </Dropdown>
  );
}

function AppNavIcon({ name }: { name: (typeof appNavItems)[number]['icon'] }) {
  const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  if (name === 'workbench') {
    return (
      <svg className="nav-symbol" {...iconProps}>
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
      </svg>
    );
  }
  if (name === 'message') {
    return (
      <svg className="nav-symbol" {...iconProps}>
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4.8a3.5 3.5 0 0 1-3.5 3.5h-4.6l-4.4 4v-4.2A3.4 3.4 0 0 1 5 11.8V6.5Z" />
        <path d="M8.7 8.3h6.6M8.7 11.2h4.7" />
      </svg>
    );
  }
  if (name === 'contacts') {
    return (
      <svg className="nav-symbol" {...iconProps}>
        <rect x="5" y="4" width="14" height="16" rx="2" />
        <path d="M9.2 9.4a2.8 2.8 0 1 0 5.6 0 2.8 2.8 0 0 0-5.6 0ZM8.2 16.3c1-1.9 2.3-2.9 3.8-2.9s2.8 1 3.8 2.9" />
      </svg>
    );
  }
  if (name === 'calendar') {
    return (
      <svg className="nav-symbol" {...iconProps}>
        <rect x="4.5" y="5.8" width="15" height="14" rx="2" />
        <path d="M8.2 3.8v4M15.8 3.8v4M4.8 10h14.4" />
        <path d="M8.4 14h2.1M13.4 14h2.1M8.4 17h2.1" />
      </svg>
    );
  }
  if (name === 'cloud') {
    return (
      <svg className="nav-symbol" {...iconProps}>
        <path d="M7.7 18.2h8.5a4 4 0 0 0 .5-8 5.7 5.7 0 0 0-10.9 1.5 3.3 3.3 0 0 0 1.9 6.5Z" />
      </svg>
    );
  }
  return (
    <svg className="nav-symbol" {...iconProps}>
      <path d="M5.5 4.5h9.8A3.2 3.2 0 0 1 18.5 7.7v11.8H8.7a3.2 3.2 0 0 1-3.2-3.2V4.5Z" />
      <path d="M8.8 8h6.5M8.8 11.2h6.5M8.8 14.4h4.8" />
      <path d="M18.5 7.7H8.7a3.2 3.2 0 0 0-3.2 3.2" />
    </svg>
  );
}

const timeOptions = [
  { label: '分钟', value: 'minutes' },
  { label: '小时', value: 'hours' },
  { label: '天', value: 'days' }
];

function parseMaterialImportRow(row: Record<string, unknown>): MaterialImportRow {
  return {
    code: cellText(row['物料编码']),
    name: cellText(row['物料名称']),
    category: cellText(row['物料分类']),
    type: cellText(row['物料类型']),
    unit: cellText(row['规格单位']),
    shelfLifeValue: Number(row['保质期数值']),
    shelfLifeUnit: parseTimeUnit(cellText(row['保质期单位'])),
    openedLifeValue: Number(row['开封效期数值']),
    openedLifeUnit: parseTimeUnit(cellText(row['开封效期单位'])),
    status: parseImportStatus(cellText(row['状态'])),
    remark: cellText(row['备注'])
  };
}

function validateMaterialImportRow(
  material: MaterialImportRow,
  rowNumber: number,
  categories: Set<string>,
  types: Set<string>,
  units: Set<string>
) {
  const errors: string[] = [];
  if (!material.code) errors.push(`第 ${rowNumber} 行：物料编码必填`);
  if (!material.name) errors.push(`第 ${rowNumber} 行：物料名称必填`);
  if (!categories.has(material.category))
    errors.push(`第 ${rowNumber} 行：物料分类“${material.category || '空'}”不在自定义配置中`);
  if (!types.has(material.type)) errors.push(`第 ${rowNumber} 行：物料类型“${material.type || '空'}”不在自定义配置中`);
  if (!units.has(material.unit)) errors.push(`第 ${rowNumber} 行：规格单位“${material.unit || '空'}”不在自定义配置中`);
  if (!Number.isInteger(material.shelfLifeValue) || material.shelfLifeValue < 1)
    errors.push(`第 ${rowNumber} 行：保质期数值必须是大于 0 的整数`);
  if (!Number.isInteger(material.openedLifeValue) || material.openedLifeValue < 1)
    errors.push(`第 ${rowNumber} 行：开封效期数值必须是大于 0 的整数`);
  if (!material.shelfLifeUnit) errors.push(`第 ${rowNumber} 行：保质期单位必须填写分钟、小时或天`);
  if (!material.openedLifeUnit) errors.push(`第 ${rowNumber} 行：开封效期单位必须填写分钟、小时或天`);
  return errors;
}

function cellText(value: unknown) {
  return String(value ?? '').trim();
}

function parseTimeUnit(value: string) {
  const normalized = value.toLowerCase();
  const map: Record<string, string> = {
    分钟: 'minutes',
    minute: 'minutes',
    minutes: 'minutes',
    小时: 'hours',
    hour: 'hours',
    hours: 'hours',
    天: 'days',
    日: 'days',
    day: 'days',
    days: 'days'
  };
  return map[value] || map[normalized] || value;
}

function parseImportStatus(value: string): 'enabled' | 'disabled' {
  const normalized = value.toLowerCase();
  const map: Record<string, 'enabled' | 'disabled'> = {
    启用: 'enabled',
    正常: 'enabled',
    enabled: 'enabled',
    停用: 'disabled',
    禁用: 'disabled',
    disabled: 'disabled'
  };
  return map[value] || map[normalized] || 'enabled';
}

function ImportErrorList({ errors }: { errors: string[] }) {
  return (
    <div style={{ maxHeight: 280, overflow: 'auto' }}>
      {errors.slice(0, 50).map((error) => (
        <div key={error}>{error}</div>
      ))}
      {errors.length > 50 ? <div>还有 {errors.length - 50} 条错误未展示</div> : null}
    </div>
  );
}

function Dashboard({
  dashboard,
  warningOpened,
  query,
  onQueryChange,
  onPresetChange,
  onSearch
}: {
  dashboard: any;
  warningOpened: any[];
  query: DashboardQuery;
  onQueryChange: StateSetter<DashboardQuery>;
  onPresetChange: (preset: string) => void;
  onSearch: () => Promise<void>;
}) {
  return (
    <>
      <div className="filter-bar">
        <div className="filter-item">
          <label>状态</label>
          <Select
            style={{ width: 150 }}
            value={query.status}
            onChange={(status) => onQueryChange((current) => ({ ...current, status }))}
            options={[
              { label: '全部状态', value: '' },
              { label: '正常', value: 'normal' },
              { label: '即将过期', value: 'warning' },
              { label: '已过期', value: 'expired' },
              { label: '已处理', value: 'processed' }
            ]}
          />
        </div>
        <TimeRangeFilter
          query={query}
          onQueryChange={onQueryChange}
          onPresetChange={onPresetChange}
          onSearch={onSearch}
        />
      </div>
      <div className="stats-grid">
        <Stat label="物料总数" value={dashboard.stats.materialCount || 0} />
        <Stat label="今日打印标签" value={dashboard.stats.todayPrintCount || 0} />
        <Stat label="到期预警物料" value={dashboard.stats.warningCount || 0} />
        <Stat label="本月废弃" value={dashboard.stats.monthScrapCount || 0} />
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <Tabs
          items={[
            {
              key: 'usage',
              label: '物料使用情况',
              children: (
                <Table<UsageRow>
                  rowKey={(row) => row.material.id}
                  dataSource={dashboard.usage}
                  pagination={false}
                  columns={[
                    { title: '序号', render: (_v, _r, index) => index + 1, width: 70 },
                    { title: '物料编码', render: (_, row) => row.material.code },
                    { title: '物料名称', render: (_, row) => row.material.name },
                    { title: '物料分类', render: (_, row) => row.material.category },
                    { title: '使用次数', dataIndex: 'useCount' },
                    { title: '废弃次数', dataIndex: 'scrapCount' },
                    { title: '使用率', dataIndex: 'usageRate' }
                  ]}
                />
              )
            },
            { key: 'opened', label: '开盒物料', children: <OpenedTable rows={dashboard.openedMaterials} /> },
            { key: 'warning', label: '到期预警', children: <OpenedTable rows={warningOpened} /> }
          ]}
        />
      </div>
    </>
  );
}

function OpenedTable({ rows }: { rows: any[] }) {
  return (
    <Table
      rowKey="id"
      dataSource={rows}
      pagination={false}
      columns={[
        { title: '序号', render: (_v, _r, index) => index + 1, width: 70 },
        { title: '物料编码', render: (_, row) => row.material.code },
        { title: '物料名称', render: (_, row) => row.material.name },
        { title: '状态', render: (_, row) => <StatusTag status={row.computedStatus} /> },
        { title: '开封时间', render: (_, row) => formatDate(row.openedAt) },
        { title: '到期时间', render: (_, row) => formatDate(row.expiresAt) },
        { title: '剩余时间', dataIndex: 'remainingText' }
      ]}
    />
  );
}

function PrintLogs({
  logs,
  query,
  onQueryChange,
  onPresetChange,
  onSearch
}: {
  logs: any[];
  query: LogQuery;
  onQueryChange: StateSetter<LogQuery>;
  onPresetChange: (preset: string) => void;
  onSearch: () => Promise<void>;
}) {
  return (
    <>
      <div className="filter-bar">
        <TimeRangeFilter
          query={query}
          onQueryChange={onQueryChange}
          onPresetChange={onPresetChange}
          onSearch={onSearch}
        />
      </div>
      <div className="panel">
        <Table
          rowKey="id"
          dataSource={logs}
          pagination={false}
          columns={[
            { title: '序号', render: (_v, _r, index) => index + 1, width: 70 },
            { title: '物料名称', render: (_, row) => row.material.name },
            { title: '物料分类', render: (_, row) => row.material.category },
            { title: '物料类型', render: (_, row) => row.material.type },
            { title: '开封时间', render: (_, row) => formatDate(row.openedAt) },
            { title: '到期时间', render: (_, row) => formatDate(row.expiresAt) },
            { title: '打印张数', dataIndex: 'printCount' },
            { title: '操作人', dataIndex: 'operator' }
          ]}
        />
      </div>
    </>
  );
}

function ScrapLogs({
  logs,
  query,
  onQueryChange,
  onPresetChange,
  onSearch
}: {
  logs: any[];
  query: LogQuery;
  onQueryChange: StateSetter<LogQuery>;
  onPresetChange: (preset: string) => void;
  onSearch: () => Promise<void>;
}) {
  return (
    <>
      <div className="filter-bar">
        <TimeRangeFilter
          query={query}
          onQueryChange={onQueryChange}
          onPresetChange={onPresetChange}
          onSearch={onSearch}
        />
      </div>
      <div className="panel">
        <Table
          rowKey="id"
          dataSource={logs}
          pagination={false}
          columns={[
            { title: '序号', render: (_v, _r, index) => index + 1, width: 70 },
            { title: '物料名称', render: (_, row) => row.material.name },
            { title: '物料分类', render: (_, row) => row.material.category },
            { title: '物料类型', render: (_, row) => row.material.type },
            { title: '开封时间', render: (_, row) => formatDate(row.openedMaterial.openedAt) },
            { title: '到期时间', render: (_, row) => formatDate(row.openedMaterial.expiresAt) },
            { title: '废弃量', render: (_, row) => `${row.quantity}${row.unit}` },
            { title: '废弃时间', render: (_, row) => formatDate(row.createdAt) },
            { title: '操作人', dataIndex: 'operator' }
          ]}
        />
      </div>
    </>
  );
}

function TimeRangeFilter<T extends RangeQuery & { preset: string }>({
  query,
  onQueryChange,
  onPresetChange,
  onSearch
}: {
  query: T;
  onQueryChange: StateSetter<T>;
  onPresetChange: (preset: string) => void;
  onSearch: () => Promise<void>;
}) {
  return (
    <>
      <div className="filter-item filter-date-item">
        <label>执行时间</label>
        <div className="filter-date-range">
          <Input
            className="filter-date-input"
            type="datetime-local"
            value={query.startAt}
            onChange={(event) => onQueryChange((current) => ({ ...current, startAt: event.target.value, preset: '' }))}
          />
          <span className="filter-date-separator">至</span>
          <Input
            className="filter-date-input"
            type="datetime-local"
            value={query.endAt}
            onChange={(event) => onQueryChange((current) => ({ ...current, endAt: event.target.value, preset: '' }))}
          />
        </div>
      </div>
      <div className="filter-item">
        <label>快捷时间</label>
        <Select
          style={{ width: 120 }}
          value={query.preset}
          onChange={onPresetChange}
          options={[
            { label: '请选择', value: '' },
            { label: '本月', value: 'month' },
            { label: '本周', value: 'week' },
            { label: '今日', value: 'today' }
          ]}
        />
      </div>
      <div className="filter-actions">
        <Button
          className="btn btn-primary"
          type="primary"
          onClick={() => {
            void onSearch();
          }}
        >
          查询
        </Button>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const className =
    status === 'enabled' || status === 'normal'
      ? 'status-enabled'
      : status === 'warning'
        ? 'status-warning'
        : status === 'disabled'
          ? 'status-disabled'
          : 'status-danger';
  return <span className={`status-tag ${className}`}>{statusText(status)}</span>;
}

function unitText(unit: string) {
  return ({ minutes: '分钟', hours: '小时', days: '天' } as Record<string, string>)[unit] || unit;
}

function statusText(status: string) {
  return (
    (
      {
        enabled: '启用',
        disabled: '禁用',
        deleted: '已删除',
        normal: '正常',
        warning: '即将过期',
        expired: '已过期',
        used: '已使用',
        scrapped: '已废弃'
      } as Record<string, string>
    )[status] || status
  );
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}

function appendDateRange(params: URLSearchParams, prefix: '' | 'print' | 'scrap', query: RangeQuery) {
  const startKey = prefix ? `${prefix}StartAt` : 'startAt';
  const endKey = prefix ? `${prefix}EndAt` : 'endAt';
  if (query.startAt) params.set(startKey, new Date(query.startAt).toISOString());
  if (query.endAt) params.set(endKey, new Date(query.endAt).toISOString());
}

function presetRange(preset: string): RangeQuery {
  if (!preset) return { startAt: '', endAt: '' };
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (preset === 'today') {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 0, 0);
  } else if (preset === 'week') {
    const day = now.getDay() || 7;
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 0, 0);
  } else if (preset === 'month') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 0, 0);
  }

  return { startAt: toDateTimeLocal(start), endAt: toDateTimeLocal(end) };
}

function toDateTimeLocal(date: Date) {
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatShortDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  const pad = (num: number) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
