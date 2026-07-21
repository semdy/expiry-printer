import CoreBluetooth
import UIKit
import WebKit

final class MyViewController: UIViewController, WKScriptMessageHandler {
    private var webView: WKWebView!
    private var scriptHandler: WeakScriptMessageHandler!
    private var webReady = false
    private var pendingEvents: [[String: Any]] = []
    private lazy var printerManager = BluetoothPrinterManager { [weak self] event, data in
        self?.sendEvent(event, data: data)
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        let configuration = WKWebViewConfiguration()
        scriptHandler = WeakScriptMessageHandler(delegate: self)
        configuration.userContentController.add(scriptHandler, name: "NativeBridge")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        // Initialize CoreBluetooth at app startup so iOS can restore a previous connection.
        _ = printerManager

        guard let publicDirectory = Bundle.main.resourceURL?.appendingPathComponent("public"),
              let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "public") else {
            assertionFailure("Missing bundled web dist. Run npm run native:sync first.")
            return
        }
        webView.loadFileURL(indexURL, allowingReadAccessTo: publicDirectory)
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "NativeBridge")
        printerManager.destroy()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "NativeBridge", let body = message.body as? [String: Any] else { return }
        if body["type"] as? String == "event" {
            if body["event"] as? String == "pageReady" {
                webReady = true
                let events = pendingEvents
                pendingEvents.removeAll()
                events.forEach(sendToWeb)
                sendEvent("native.ready", data: body["data"] ?? [:])
            }
            return
        }
        guard body["type"] as? String == "call",
              let method = body["method"] as? String,
              let callbackId = body["callbackId"] as? Int else { return }
        let params = body["params"] as? [String: Any] ?? [:]
        let completion: BluetoothPrinterManager.Completion = { [weak self] result in
            switch result {
            case .success(let data): self?.sendCallback(callbackId, data: data)
            case .failure(let error):
                if CBManager.authorization == .denied { self?.showBluetoothSettingsAlert() }
                self?.sendCallback(callbackId, error: error.localizedDescription)
            }
        }

        switch method {
        case "bluetooth.scan": printerManager.scan(params: params, completion: completion)
        case "bluetooth.connect": printerManager.connect(params: params, completion: completion)
        case "bluetooth.write": printerManager.write(params: params, completion: completion)
        case "bluetooth.disconnect": printerManager.disconnect(completion: completion)
        default: sendCallback(callbackId, error: "未知原生方法：\(method)")
        }
    }

    private func sendCallback(_ callbackId: Int, data: Any? = nil, error: String? = nil) {
        var message: [String: Any] = ["type": "callback", "callbackId": callbackId, "success": error == nil]
        if let error { message["error"] = error }
        else { message["data"] = data ?? NSNull() }
        sendToWeb(message)
    }

    private func sendEvent(_ event: String, data: Any) {
        let message: [String: Any] = ["type": "event", "event": event, "data": data]
        if webReady { sendToWeb(message) }
        else { pendingEvents.append(message) }
    }

    private func showBluetoothSettingsAlert() {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(
            title: "需要蓝牙权限",
            message: "请前往系统设置，允许“效期标签”访问蓝牙后再搜索打印机。",
            preferredStyle: .alert
        )
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        alert.addAction(UIAlertAction(title: "前往设置", style: .default) { _ in
            guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
            UIApplication.shared.open(url)
        })
        present(alert, animated: true)
    }

    private func sendToWeb(_ message: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(message),
              let data = try? JSONSerialization.data(withJSONObject: message),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript("window.__nativeReceive(\(json))")
        }
    }
}

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}
