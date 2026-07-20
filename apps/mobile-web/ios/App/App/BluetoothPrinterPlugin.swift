import Capacitor
import CoreBluetooth

@objc(BluetoothPrinterPlugin)
public class BluetoothPrinterPlugin: CAPPlugin, CAPBridgedPlugin, CBCentralManagerDelegate, CBPeripheralDelegate {
    public let identifier = "BluetoothPrinterPlugin"
    public let jsName = "BluetoothPrinter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]

    private var central: CBCentralManager!
    private var scanCall: CAPPluginCall?
    private var connectCall: CAPPluginCall?
    private var writeCall: CAPPluginCall?
    private var discovered: [UUID: (peripheral: CBPeripheral, rssi: Int)] = [:]
    private var requestedServices: [CBUUID] = []
    private var connectedPeripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var pendingServiceDiscoveries = 0
    private var pendingData = Data()
    private var writeOffset = 0
    private var connectTimeout: DispatchWorkItem?

    public override func load() {
        central = CBCentralManager(delegate: self, queue: .main)
    }

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.scanCall == nil else {
                call.reject("正在搜索蓝牙设备")
                return
            }
            self.scanCall = call
            self.discovered.removeAll()
            if self.central.state == .poweredOn {
                self.beginScan(call)
            } else if self.central.state != .unknown && self.central.state != .resetting {
                self.finishScan(error: self.bluetoothStateMessage())
            }
        }
    }

    private func beginScan(_ call: CAPPluginCall) {
        // Do not filter advertisements: many printers expose their service UUIDs only after connecting.
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        let requestedTimeout = call.getInt("timeoutMs") ?? 5000
        let timeout = max(1000, min(requestedTimeout, 15000))
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeout)) { [weak self] in
            self?.finishScan(error: nil)
        }
    }

    private func finishScan(error: String?) {
        guard let call = scanCall else { return }
        central.stopScan()
        scanCall = nil
        if let error {
            call.reject(error)
            return
        }
        let devices: [[String: Any]] = discovered.values
            .sorted { $0.rssi > $1.rssi }
            .map {
                [
                    "id": $0.peripheral.identifier.uuidString,
                    "name": $0.peripheral.name ?? "未命名蓝牙设备",
                    "rssi": $0.rssi
                ]
            }
        call.resolve(["devices": devices])
    }

    @objc func connect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.central.state == .poweredOn else {
                call.reject(self.bluetoothStateMessage())
                return
            }
            guard let rawId = call.getString("deviceId"), let id = UUID(uuidString: rawId) else {
                call.reject("蓝牙设备 ID 无效")
                return
            }
            self.requestedServices = (call.getArray("serviceUuids", String.self) ?? []).map(CBUUID.init(string:))
            guard !self.requestedServices.isEmpty else {
                call.reject("未配置打印服务 UUID")
                return
            }
            let peripheral = self.discovered[id]?.peripheral ?? self.central.retrievePeripherals(withIdentifiers: [id]).first
            guard let peripheral else {
                call.reject("找不到已选择的蓝牙设备，请重新搜索")
                return
            }
            self.disconnectCurrent()
            self.connectCall = call
            self.connectedPeripheral = peripheral
            peripheral.delegate = self
            self.central.connect(peripheral)
            let timeout = DispatchWorkItem { [weak self] in
                guard self?.connectCall === call else { return }
                self?.rejectConnect("连接蓝牙打印机超时")
            }
            self.connectTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeout)
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.writeCall == nil else {
                call.reject("上一条打印数据仍在发送")
                return
            }
            guard let peripheral = self.connectedPeripheral,
                  peripheral.state == .connected,
                  let characteristic = self.writeCharacteristic else {
                call.reject("蓝牙打印机未连接")
                return
            }
            guard let encoded = call.getString("data"), let data = Data(base64Encoded: encoded) else {
                call.reject("打印数据不是有效的 Base64")
                return
            }
            self.pendingData = data
            self.writeOffset = 0
            self.writeCall = call
            self.writeNextChunk()
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.disconnectCurrent()
            call.resolve()
        }
    }

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn, let call = scanCall {
            beginScan(call)
        } else if central.state != .unknown && central.state != .resetting && central.state != .poweredOn {
            finishScan(error: bluetoothStateMessage())
            rejectConnect(bluetoothStateMessage())
        }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                               advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String
        guard name != nil else { return }
        discovered[peripheral.identifier] = (peripheral, RSSI.intValue)
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices(requestedServices)
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        rejectConnect(error?.localizedDescription ?? "蓝牙打印机连接失败")
    }

    public func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral,
                               error: Error?) {
        writeCharacteristic = nil
        rejectWrite(error?.localizedDescription ?? "蓝牙连接已断开")
        if connectCall != nil { rejectConnect(error?.localizedDescription ?? "蓝牙连接已断开") }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            rejectConnect("无法发现打印机蓝牙服务：\(error.localizedDescription)")
            return
        }
        let matching = (peripheral.services ?? []).filter { requestedServices.contains($0.uuid) }
        guard !matching.isEmpty else {
            rejectConnect("未找到匹配的蓝牙打印服务")
            return
        }
        pendingServiceDiscoveries = matching.count
        for service in matching { peripheral.discoverCharacteristics(nil, for: service) }
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        pendingServiceDiscoveries -= 1
        if writeCharacteristic == nil {
            writeCharacteristic = service.characteristics?.first(where: {
                $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)
            })
        }
        if let characteristic = writeCharacteristic {
            resolveConnect(peripheral, characteristic: characteristic)
        } else if pendingServiceDiscoveries == 0 {
            rejectConnect("未找到可写入的蓝牙打印通道")
        }
    }

    public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error {
            rejectWrite("蓝牙数据写入失败：\(error.localizedDescription)")
        } else {
            writeNextChunk()
        }
    }

    public func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        writeNextChunk()
    }

    private func writeNextChunk() {
        guard let call = writeCall,
              let peripheral = connectedPeripheral,
              let characteristic = writeCharacteristic else { return }
        if writeOffset >= pendingData.count {
            writeCall = nil
            pendingData.removeAll()
            call.resolve()
            return
        }
        let type: CBCharacteristicWriteType = characteristic.properties.contains(.write) ? .withResponse : .withoutResponse
        if type == .withoutResponse && !peripheral.canSendWriteWithoutResponse { return }
        let maximum = peripheral.maximumWriteValueLength(for: type)
        let end = min(writeOffset + maximum, pendingData.count)
        let chunk = pendingData.subdata(in: writeOffset..<end)
        writeOffset = end
        peripheral.writeValue(chunk, for: characteristic, type: type)
        if type == .withoutResponse { writeNextChunk() }
    }

    private func resolveConnect(_ peripheral: CBPeripheral, characteristic: CBCharacteristic) {
        guard let call = connectCall else { return }
        connectTimeout?.cancel()
        connectCall = nil
        writeCharacteristic = characteristic
        call.resolve([
            "id": peripheral.identifier.uuidString,
            "name": peripheral.name ?? "蓝牙打印机"
        ])
    }

    private func rejectConnect(_ message: String) {
        guard let call = connectCall else { return }
        connectTimeout?.cancel()
        connectCall = nil
        call.reject(message)
        disconnectCurrent()
    }

    private func rejectWrite(_ message: String) {
        guard let call = writeCall else { return }
        writeCall = nil
        pendingData.removeAll()
        call.reject(message)
    }

    private func disconnectCurrent() {
        rejectWrite("蓝牙打印机已断开")
        writeCharacteristic = nil
        if let peripheral = connectedPeripheral {
            central.cancelPeripheralConnection(peripheral)
        }
        connectedPeripheral = nil
    }

    private func bluetoothStateMessage() -> String {
        switch central.state {
        case .poweredOff: return "蓝牙未开启"
        case .unauthorized: return "未获得蓝牙权限"
        case .unsupported: return "当前设备不支持低功耗蓝牙"
        default: return "蓝牙暂不可用"
        }
    }
}
