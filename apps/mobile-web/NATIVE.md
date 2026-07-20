# Android / iOS 蓝牙打印

移动端使用 Capacitor 承载现有 React 页面，并通过本地 `BluetoothPrinter` 插件访问 BLE：

- Android：`BluetoothLeScanner` + `BluetoothGatt`
- iOS：`CoreBluetooth`
- 浏览器：继续使用原来的 Web Bluetooth 实现

插件向 TypeScript 暴露统一接口：

```ts
scan({ serviceUuids, timeoutMs })
connect({ deviceId, serviceUuids })
write({ data }) // Base64 编码的 TSPL 字节
disconnect()
```

## 构建和打开工程

在项目根目录执行：

```bash
npm run native:sync
npm run native:android
npm run native:ios
```

`native:sync` 会先构建 H5，然后把 `dist` 同步到 Android 和 iOS 工程。后两个命令分别打开 Android Studio 和 Xcode。

## 后端地址

真机里的 `localhost` 指向手机自身。构建真机包前必须把后端地址设为电脑局域网地址或可访问的 HTTPS 地址，例如：

```bash
VITE_API_BASE=http://192.168.1.10:3000 npm run native:sync
```

如果 Android 使用明文 HTTP 开发地址，需要在 Android 网络安全配置中明确允许；生产环境应使用 HTTPS。iOS 同样建议使用 HTTPS，避免放宽 ATS。

## 真机要求

- BLE 搜索和打印必须使用真机，模拟器不能完成实际打印验证。
- Android 12 及以上会请求“附近设备”权限，旧版本会请求用于 BLE 扫描的定位权限。
- iOS 首次扫描会弹出蓝牙权限提示，说明文字配置在 `Info.plist`。
- 当前按候选 Service UUID 顺序寻找第一个可写 Characteristic，并发送 TSPL。确定打印机型号后，建议把 Service UUID 和 Characteristic UUID 收窄为厂家文档给出的值。
