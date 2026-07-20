# 效期标签打印管理系统

这是基于现有静态原型开发的本地可运行首版系统，包含 Web 管理后台、移动端 H5、Node.js 后端和 MySQL 数据库。

## 技术栈

- Web 管理后台：React + Vite + Ant Design
- 移动端 H5：React + Vite + Ant Design Mobile
- 后端：Node.js + Express + Prisma
- 数据库：MySQL

## 本地启动

1. 复制环境变量：

```bash
cp .env.example apps/server/.env
```

2. 修改 `apps/server/.env` 中的 MySQL 密码。

3. 安装依赖：

```bash
npm install
```

4. 创建数据库：

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS expiry_label_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

5. 初始化表结构和示例数据：

```bash
npm run prisma:push
npm run seed
```

6. 启动后端、Web 管理后台、移动端：

```bash
npm run dev:server
npm run dev:admin
npm run dev:mobile
```

默认地址：

- 后端接口：http://localhost:3000
- Web 管理后台：http://localhost:5173
- 移动端 H5：http://localhost:5174

## Android / iOS 原生蓝牙打印

`apps/mobile-web` 已包含不依赖 Capacitor 的 Android/iOS WebView 工程，通过统一 `NativeBridge` 调用本地 BLE 打印能力。同步或打开原生工程：

```bash
npm run native:sync
npm run native:android
npm run native:ios
```

真机运行和后端地址配置见 [apps/mobile-web/NATIVE.md](apps/mobile-web/NATIVE.md)。

## 自动冒烟测试

每次改完核心流程后运行：

```bash
npm run test:smoke
```

这套测试会自动检查后台物料启停确认、移动端标签打印明细确认、移动端批量废弃确认。

## 当前范围

- 已包含物料配置、自定义配置、标签打印、效期预警、使用/废弃、打印日志、废弃日志和数据中心。
- 移动端支持 Android Chrome 的 Web Bluetooth，也支持 Android Java / iOS WKWebView 原生壳通过 BLE 直连 TSPL 标签打印机。
- 第一版不做登录和复杂权限，操作人使用环境变量中的默认值。
