# 效期标签打印管理系统 AI 开发规范

## 项目目标

本项目是效期标签打印管理系统，首版目标是本地可运行，跑通物料配置、批量导入、标签打印、效期预警、使用/废弃、日志和数据中心。

## 技术栈

- 管理后台：React + Vite + Ant Design
- 移动端 H5：React + Vite + Ant Design Mobile
- 后端：Node.js + Express + Prisma
- 数据库：MySQL
- Excel 导入导出：xlsx

## 目录说明

- `apps/admin-web`：后台管理页面
- `apps/mobile-web`：移动端 H5
- `apps/server`：后端接口服务
- `packages/shared`：共享类型、状态枚举、工具函数
- `web`、`mobile`：早期静态原型，仅作为样式和交互参考
- `references/existing-system`：现有系统截图、录制脚本、抓取资源参考

## 业务命名约定

- 全站统一使用“废弃”，不要使用“报废”或“损耗”。
- 移除“到期监控”入口。
- 物料批量导入按“物料编码”判断同一物料：存在则更新，不存在则新增。
- 补打默认 1 张，不提供张数选择入口。

## 关键业务规则

- 正常、即将过期：可使用、可废弃、可补打。
- 已过期：不可使用、不可补打，只能废弃。
- 废弃数量必填，默认 1，最小 1，旁边显示单位。
- 打印时按“开封时间 + 开封效期”计算到期时间，并生成打印日志。
- 第一版不直连真实打印机，打印和补打可以先走打印成功流程。

## 前端要求

- 后台页面优先参考 `web` 原型和 `references/existing-system` 中的现有系统截图。
- 移动端页面优先参考 `mobile` 原型，底部导航固定在屏幕底部。
- 不做营销页，直接进入可用业务页面。
- 不随意重构 UI 框架，保持 React + Ant Design / Ant Design Mobile。
- 左侧功能栏可作为静态产品壳，不需要真实跳转效果。

## 后端要求

- 不把 MySQL root 密码写入代码。
- 本地连接信息通过 `apps/server/.env` 配置。
- Prisma schema 是数据库结构的主要来源。
- 新增接口时保持 REST 风格，与现有 `/api/materials`、`/api/configs`、`/api/dashboard` 风格一致。

## 数据库和导入规则

- 物料字段包括：编码、名称、分类、类型、单位、保质期、开封效期、状态、备注。
- 分类、类型、单位导入时按自定义配置表做文字匹配。
- Excel 模板应包含“物料导入模板”和“可选配置”两个 sheet。
- 导入前端先做基础校验，后端仍需再次校验。

## 开发验证

常用检查：

```bash
npm --workspace apps/admin-web run build
npm --workspace apps/mobile-web run build
npm --workspace apps/server run build
```

如果只改某个端，优先跑对应端构建。

每次完成业务变更后，需要运行 Playwright 冒烟测试：

```bash
npm run test:smoke
```

当前冒烟覆盖：

- 后台物料禁用/启用二次确认。
- 移动端标签打印进入明细后确认打印。
- 移动端批量废弃弹窗确认后执行。

## Git 注意事项

- 不提交 `.env`、数据库文件、构建产物、临时日志。
- 不删除用户未确认的文件。
- 现有未跟踪的中文翻译文件如果与任务无关，不要处理。
