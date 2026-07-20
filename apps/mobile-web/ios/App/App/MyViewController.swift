import Capacitor

final class MyViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BluetoothPrinterPlugin())
    }
}
