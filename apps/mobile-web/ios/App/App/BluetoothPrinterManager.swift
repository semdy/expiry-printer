import CoreBluetooth
import Foundation

final class BluetoothPrinterManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    typealias Completion = (Result<Any, Error>) -> Void
    typealias EventEmitter = (String, Any) -> Void

    private static let restorationIdentifier = "com.expirylabel.mobile.bluetoothPrinter"
    private static let serviceUuidsKey = "BluetoothPrinterServiceUuids"

    private var central: CBCentralManager!
    private let eventEmitter: EventEmitter
    private var scanCompletion: Completion?
    private var connectCompletion: Completion?
    private var writeCompletion: Completion?
    private var discovered: [UUID: (peripheral: CBPeripheral, rssi: Int)] = [:]
    private var requestedServices: [CBUUID] = []
    private var connectedPeripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private var pendingServiceDiscoveries = 0
    private var pendingData = Data()
    private var writeOffset = 0
    private var connectTimeout: DispatchWorkItem?
    private var restoringConnection = false

    init(eventEmitter: @escaping EventEmitter) {
        self.eventEmitter = eventEmitter
        super.init()
        requestedServices = (UserDefaults.standard.stringArray(forKey: Self.serviceUuidsKey) ?? []).map(CBUUID.init(string:))
        central = CBCentralManager(
            delegate: self,
            queue: .main,
            options: [CBCentralManagerOptionRestoreIdentifierKey: Self.restorationIdentifier]
        )
    }

    func scan(params: [String: Any], completion: @escaping Completion) {
        DispatchQueue.main.async {
            guard self.scanCompletion == nil else {
                completion(.failure(self.error("正在搜索蓝牙设备")))
                return
            }
            self.scanCompletion = completion
            self.discovered.removeAll()
            if self.central.state == .poweredOn {
                self.beginScan(timeoutMs: params["timeoutMs"] as? Int ?? 5000)
            } else if self.central.state != .unknown && self.central.state != .resetting {
                self.finishScan(error: self.bluetoothStateMessage())
            }
        }
    }

    private func beginScan(timeoutMs: Int) {
        central.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        let timeout = max(1000, min(timeoutMs, 15000))
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeout)) { [weak self] in
            self?.finishScan(error: nil)
        }
    }

    private func finishScan(error message: String?) {
        guard let completion = scanCompletion else { return }
        central.stopScan()
        scanCompletion = nil
        if let message {
            completion(.failure(error(message)))
            return
        }
        let devices: [[String: Any]] = discovered.values.sorted { $0.rssi > $1.rssi }.map {
            ["id": $0.peripheral.identifier.uuidString,
             "name": $0.peripheral.name ?? "未命名蓝牙设备",
             "rssi": $0.rssi]
        }
        completion(.success(["devices": devices]))
    }

    func connect(params: [String: Any], completion: @escaping Completion) {
        DispatchQueue.main.async {
            guard self.central.state == .poweredOn else {
                completion(.failure(self.error(self.bluetoothStateMessage())))
                return
            }
            guard let rawId = params["deviceId"] as? String, let id = UUID(uuidString: rawId) else {
                completion(.failure(self.error("蓝牙设备 ID 无效")))
                return
            }
            let serviceUuids = params["serviceUuids"] as? [String] ?? []
            self.requestedServices = serviceUuids.map(CBUUID.init(string:))
            guard !self.requestedServices.isEmpty else {
                completion(.failure(self.error("未配置打印服务 UUID")))
                return
            }
            UserDefaults.standard.set(serviceUuids, forKey: Self.serviceUuidsKey)
            let peripheral = self.discovered[id]?.peripheral ?? self.central.retrievePeripherals(withIdentifiers: [id]).first
            guard let peripheral else {
                completion(.failure(self.error("找不到已选择的蓝牙设备，请重新搜索")))
                return
            }
            self.finishScan(error: nil)
            self.disconnectCurrent()
            self.connectCompletion = completion
            self.connectedPeripheral = peripheral
            peripheral.delegate = self
            self.central.connect(peripheral)
            let timeout = DispatchWorkItem { [weak self] in
                guard self?.connectCompletion != nil else { return }
                self?.rejectConnect("连接蓝牙打印机超时")
            }
            self.connectTimeout = timeout
            DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: timeout)
        }
    }

    func write(params: [String: Any], completion: @escaping Completion) {
        DispatchQueue.main.async {
            guard self.writeCompletion == nil else {
                completion(.failure(self.error("上一条打印数据仍在发送")))
                return
            }
            guard let peripheral = self.connectedPeripheral,
                  peripheral.state == .connected,
                  self.writeCharacteristic != nil else {
                completion(.failure(self.error("蓝牙打印机未连接")))
                return
            }
            guard let encoded = params["data"] as? String, let data = Data(base64Encoded: encoded) else {
                completion(.failure(self.error("打印数据不是有效的 Base64")))
                return
            }
            self.pendingData = data
            self.writeOffset = 0
            self.writeCompletion = completion
            self.writeNextChunk()
        }
    }

    func disconnect(completion: @escaping Completion) {
        DispatchQueue.main.async {
            self.disconnectCurrent()
            completion(.success(NSNull()))
        }
    }

    func destroy() {
        finishScan(error: "页面已关闭")
        disconnectCurrent()
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state == .poweredOn, scanCompletion != nil {
            beginScan(timeoutMs: 5000)
        } else if central.state != .unknown && central.state != .resetting && central.state != .poweredOn {
            finishScan(error: bluetoothStateMessage())
            failConnection(bluetoothStateMessage())
        }
    }

    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        guard let peripherals = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral],
              let peripheral = peripherals.first else { return }

        restoringConnection = true
        connectedPeripheral = peripheral
        peripheral.delegate = self
        eventEmitter("bluetooth.restoring", [
            "id": peripheral.identifier.uuidString,
            "name": peripheral.name ?? "蓝牙打印机"
        ])

        if peripheral.state == .connected {
            peripheral.discoverServices(requestedServices.isEmpty ? nil : requestedServices)
        } else if peripheral.state == .disconnected {
            central.connect(peripheral)
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = peripheral.name ?? advertisementData[CBAdvertisementDataLocalNameKey] as? String
        guard name != nil else { return }
        let firstDiscovery = discovered[peripheral.identifier] == nil
        discovered[peripheral.identifier] = (peripheral, RSSI.intValue)
        if firstDiscovery {
            eventEmitter("bluetooth.deviceDiscovered", [
                "id": peripheral.identifier.uuidString,
                "name": name ?? "未命名蓝牙设备",
                "rssi": RSSI.intValue
            ])
        }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.delegate = self
        peripheral.discoverServices(requestedServices)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        failConnection(error?.localizedDescription ?? "蓝牙打印机连接失败")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        restoringConnection = false
        writeCharacteristic = nil
        rejectWrite(error?.localizedDescription ?? "蓝牙连接已断开")
        if connectCompletion != nil { rejectConnect(error?.localizedDescription ?? "蓝牙连接已断开") }
        eventEmitter("bluetooth.disconnected", [:] as [String: Any])
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            failConnection("无法发现打印机蓝牙服务：\(error.localizedDescription)")
            return
        }
        let matching = (peripheral.services ?? []).filter {
            requestedServices.isEmpty || requestedServices.contains($0.uuid)
        }
        guard !matching.isEmpty else {
            failConnection("未找到匹配的蓝牙打印服务")
            return
        }
        pendingServiceDiscoveries = matching.count
        for service in matching { peripheral.discoverCharacteristics(nil, for: service) }
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        pendingServiceDiscoveries -= 1
        if writeCharacteristic == nil {
            writeCharacteristic = service.characteristics?.first {
                $0.properties.contains(.write) || $0.properties.contains(.writeWithoutResponse)
            }
        }
        if let characteristic = writeCharacteristic {
            if restoringConnection {
                restoringConnection = false
                eventEmitter("bluetooth.restored", [
                    "id": peripheral.identifier.uuidString,
                    "name": peripheral.name ?? "蓝牙打印机"
                ])
            } else {
                resolveConnect(peripheral, characteristic: characteristic)
            }
        } else if pendingServiceDiscoveries == 0 {
            failConnection("未找到可写入的蓝牙打印通道")
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error { rejectWrite("蓝牙数据写入失败：\(error.localizedDescription)") }
        else { writeNextChunk() }
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        writeNextChunk()
    }

    private func writeNextChunk() {
        guard let completion = writeCompletion,
              let peripheral = connectedPeripheral,
              let characteristic = writeCharacteristic else { return }
        if writeOffset >= pendingData.count {
            writeCompletion = nil
            pendingData.removeAll()
            completion(.success(NSNull()))
            return
        }
        let type: CBCharacteristicWriteType = characteristic.properties.contains(.write) ? .withResponse : .withoutResponse
        if type == .withoutResponse && !peripheral.canSendWriteWithoutResponse { return }
        let maximum = peripheral.maximumWriteValueLength(for: type)
        let end = min(writeOffset + maximum, pendingData.count)
        let chunk = pendingData.subdata(in: writeOffset..<end)
        writeOffset = end
        peripheral.writeValue(chunk, for: characteristic, type: type)
        if type == .withoutResponse { DispatchQueue.main.async { [weak self] in self?.writeNextChunk() } }
    }

    private func resolveConnect(_ peripheral: CBPeripheral, characteristic: CBCharacteristic) {
        guard let completion = connectCompletion else { return }
        connectTimeout?.cancel()
        connectCompletion = nil
        writeCharacteristic = characteristic
        completion(.success(["id": peripheral.identifier.uuidString, "name": peripheral.name ?? "蓝牙打印机"]))
    }

    private func rejectConnect(_ message: String) {
        guard let completion = connectCompletion else { return }
        connectTimeout?.cancel()
        connectCompletion = nil
        completion(.failure(error(message)))
        disconnectCurrent()
    }

    private func failConnection(_ message: String) {
        if connectCompletion != nil {
            rejectConnect(message)
            return
        }
        if restoringConnection {
            restoringConnection = false
            eventEmitter("bluetooth.restoreFailed", ["error": message])
            disconnectCurrent()
        }
    }

    private func rejectWrite(_ message: String) {
        guard let completion = writeCompletion else { return }
        writeCompletion = nil
        pendingData.removeAll()
        completion(.failure(error(message)))
    }

    private func disconnectCurrent() {
        rejectWrite("蓝牙打印机已断开")
        writeCharacteristic = nil
        if let peripheral = connectedPeripheral { central.cancelPeripheralConnection(peripheral) }
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

    private func error(_ message: String) -> Error {
        NSError(domain: "BluetoothPrinter", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
