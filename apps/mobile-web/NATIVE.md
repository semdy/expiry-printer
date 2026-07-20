# Android / iOS 原生蓝牙打印

移动端原生壳不依赖 Capacitor。Web 业务统一通过 `src/nativeBridge.ts` 调原生：

```ts
const result = await NativeBridge.call('bluetooth.scan', {
  serviceUuids,
  timeoutMs: 5000
});

NativeBridge.on('bluetooth.disconnected', () => {
  // 更新页面连接状态
});

NativeBridge.emit('pageReady', { version: '1.0.0' });
```

桥接通道：

- Android：Java `WebView.addJavascriptInterface`，对象名为 `NativeBridgeAndroid`
- iOS：`WKScriptMessageHandler`，名称为 `NativeBridge`
- Native 回 Web：两端统一调用 `window.__nativeReceive(message)`
- 浏览器：继续使用 Web Bluetooth，不会调用原生桥

当前原生方法为：

- `bluetooth.scan`
- `bluetooth.connect`
- `bluetooth.write`（数据是 Base64 编码的 TSPL 字节）
- `bluetooth.disconnect`

## 构建和打开工程

在项目根目录执行：

```bash
npm run native:sync
npm run native:android
npm run native:ios
```

`native:sync` 会构建 H5，并把 `dist` 复制到 Android 和 iOS 工程。Android Studio 可直接构建 `android`，Xcode 可直接打开 `ios/App/App.xcodeproj`。

## 后端地址

真机里的 `localhost` 指向手机自身。构建真机包前需使用电脑局域网地址或可访问的 HTTPS 地址，例如：

```bash
VITE_API_BASE=http://192.168.1.10:3000 npm run native:sync
```

Android 当前为本地开发允许明文 HTTP；正式环境建议改用 HTTPS 并关闭 `usesCleartextTraffic`。iOS 同样建议使用 HTTPS。

## 真机要求

- BLE 搜索和打印必须使用真机。
- Android 12 及以上会请求“附近设备”权限，原生部分全部使用 Java。
- iOS 首次扫描会弹出蓝牙权限提示。
- 当前按候选 Service UUID 顺序寻找第一个可写 Characteristic。确定打印机型号后，建议改为厂家提供的精确 UUID。
