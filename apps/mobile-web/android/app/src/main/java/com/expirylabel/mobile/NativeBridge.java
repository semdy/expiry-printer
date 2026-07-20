package com.expirylabel.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

public final class NativeBridge {
    private static final int BLUETOOTH_PERMISSION_REQUEST = 1001;

    private final Activity activity;
    private final WebView webView;
    private final BluetoothPrinterManager printerManager;
    private JSONObject pendingPermissionMessage;

    NativeBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.printerManager = new BluetoothPrinterManager(activity, this::emit);
    }

    @JavascriptInterface
    public void postMessage(String json) {
        activity.runOnUiThread(() -> {
            try {
                JSONObject message = new JSONObject(json);
                if ("event".equals(message.optString("type"))) {
                    onWebEvent(message.optString("event"), message.optJSONObject("data"));
                    return;
                }
                if (!"call".equals(message.optString("type"))) return;
                if (requiresBluetoothPermission(message.optString("method")) && !hasBluetoothPermission()) {
                    pendingPermissionMessage = message;
                    ActivityCompat.requestPermissions(activity, bluetoothPermissions(), BLUETOOTH_PERMISSION_REQUEST);
                    return;
                }
                dispatch(message);
            } catch (Exception error) {
                sendError(-1, "Bridge 消息格式错误：" + error.getMessage());
            }
        });
    }

    void onRequestPermissionsResult(int requestCode) {
        if (requestCode != BLUETOOTH_PERMISSION_REQUEST || pendingPermissionMessage == null) return;
        JSONObject message = pendingPermissionMessage;
        pendingPermissionMessage = null;
        if (hasBluetoothPermission()) dispatch(message);
        else sendError(message.optInt("callbackId", -1), "未获得蓝牙权限");
    }

    void destroy() {
        printerManager.destroy();
    }

    private void dispatch(JSONObject message) {
        int callbackId = message.optInt("callbackId", -1);
        String method = message.optString("method");
        JSONObject params = message.optJSONObject("params");
        if (params == null) params = new JSONObject();

        BridgeCallback callback = new BridgeCallback() {
            @Override
            public void success(Object data) {
                sendSuccess(callbackId, data);
            }

            @Override
            public void failure(String error) {
                sendError(callbackId, error);
            }
        };

        switch (method) {
            case "bluetooth.scan":
                printerManager.scan(params, callback);
                break;
            case "bluetooth.connect":
                printerManager.connect(params, callback);
                break;
            case "bluetooth.write":
                printerManager.write(params, callback);
                break;
            case "bluetooth.disconnect":
                printerManager.disconnect(callback);
                break;
            default:
                callback.failure("未知原生方法：" + method);
        }
    }

    private void onWebEvent(String event, JSONObject data) {
        // 页面通知统一从这里进入，后续可按事件名分发给宿主业务。
        if ("pageReady".equals(event)) emit("native.ready", data == null ? new JSONObject() : data);
    }

    private void sendSuccess(int callbackId, Object data) {
        JSONObject result = new JSONObject();
        try {
            result.put("type", "callback");
            result.put("callbackId", callbackId);
            result.put("success", true);
            result.put("data", data == null ? JSONObject.NULL : data);
            sendToWeb(result);
        } catch (Exception ignored) {
            sendError(callbackId, "原生返回值无法序列化");
        }
    }

    private void sendError(int callbackId, String error) {
        JSONObject result = new JSONObject();
        try {
            result.put("type", "callback");
            result.put("callbackId", callbackId);
            result.put("success", false);
            result.put("error", error);
            sendToWeb(result);
        } catch (Exception ignored) {
            // JSONObject with primitive values cannot fail in practice.
        }
    }

    private void emit(String event, Object data) {
        JSONObject message = new JSONObject();
        try {
            message.put("type", "event");
            message.put("event", event);
            message.put("data", data == null ? JSONObject.NULL : data);
            sendToWeb(message);
        } catch (Exception ignored) {
            // Ignore malformed optional event payloads.
        }
    }

    private void sendToWeb(JSONObject message) {
        webView.post(() -> webView.evaluateJavascript("window.__nativeReceive(" + message + ")", null));
    }

    private boolean requiresBluetoothPermission(String method) {
        return method.startsWith("bluetooth.") && !"bluetooth.disconnect".equals(method);
    }

    private boolean hasBluetoothPermission() {
        for (String permission : bluetoothPermissions()) {
            if (ContextCompat.checkSelfPermission(activity, permission) != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private String[] bluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return new String[] { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT };
        }
        return new String[] { Manifest.permission.ACCESS_FINE_LOCATION };
    }

    interface BridgeCallback {
        void success(Object data);
        void failure(String error);
    }

    interface EventEmitter {
        void emit(String event, Object data);
    }
}
