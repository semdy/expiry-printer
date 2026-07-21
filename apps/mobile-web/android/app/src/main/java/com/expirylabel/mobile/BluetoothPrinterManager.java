package com.expirylabel.mobile;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

final class BluetoothPrinterManager {
    private static final String CONNECTION_PREFERENCES = "BluetoothPrinterConnection";
    private static final String DEVICE_ID_KEY = "deviceId";
    private static final String DEVICE_NAME_KEY = "deviceName";
    private static final String SERVICE_UUIDS_KEY = "serviceUuids";

    private final Context context;
    private final SharedPreferences preferences;
    private final NativeBridge.EventEmitter eventEmitter;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, JSONObject> discoveredDevices = new LinkedHashMap<>();
    private final BluetoothAdapter adapter;

    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private NativeBridge.BridgeCallback scanResult;
    private NativeBridge.BridgeCallback connectResult;
    private NativeBridge.BridgeCallback writeResult;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeCharacteristic;
    private List<UUID> requestedServices = new ArrayList<>();
    private byte[] pendingWrite;
    private int writeOffset;
    private int mtu = 23;
    private boolean restoringConnection;

    BluetoothPrinterManager(Context context, NativeBridge.EventEmitter eventEmitter) {
        this.context = context;
        this.eventEmitter = eventEmitter;
        preferences = context.getSharedPreferences(CONNECTION_PREFERENCES, Context.MODE_PRIVATE);
        BluetoothManager manager = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
    }

    @SuppressLint("MissingPermission")
    void scan(JSONObject params, NativeBridge.BridgeCallback callback) {
        if (adapter == null || !adapter.isEnabled()) {
            callback.failure("蓝牙未开启");
            return;
        }
        if (scanResult != null) {
            callback.failure("正在搜索蓝牙设备");
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            callback.failure("无法启动蓝牙搜索");
            return;
        }

        discoveredDevices.clear();
        scanResult = callback;
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice device = result.getDevice();
                String name = device.getName();
                if (name == null || name.trim().isEmpty()) name = "未命名蓝牙设备";
                JSONObject item = new JSONObject();
                try {
                    item.put("id", device.getAddress());
                    item.put("name", name);
                    item.put("rssi", result.getRssi());
                    discoveredDevices.put(device.getAddress(), item);
                } catch (Exception ignored) {
                    // Primitive Bluetooth device fields are always serializable.
                }
            }

            @Override
            public void onScanFailed(int errorCode) {
                finishScan("蓝牙搜索失败（" + errorCode + "）");
            }
        };
        scanner.startScan(scanCallback);
        int timeout = Math.max(1000, Math.min(params.optInt("timeoutMs", 5000), 15000));
        handler.postDelayed(() -> finishScan(null), timeout);
    }

    @SuppressLint("MissingPermission")
    private void finishScan(String error) {
        if (scanResult == null) return;
        if (scanner != null && scanCallback != null) scanner.stopScan(scanCallback);
        NativeBridge.BridgeCallback callback = scanResult;
        scanResult = null;
        scanCallback = null;
        if (error != null) {
            callback.failure(error);
            return;
        }
        JSONArray devices = new JSONArray();
        for (JSONObject device : discoveredDevices.values()) devices.put(device);
        JSONObject result = new JSONObject();
        try {
            result.put("devices", devices);
            callback.success(result);
        } catch (Exception exception) {
            callback.failure("蓝牙搜索结果无法序列化");
        }
    }

    @SuppressLint("MissingPermission")
    void connect(JSONObject params, NativeBridge.BridgeCallback callback) {
        String deviceId = params.optString("deviceId");
        if (deviceId.isEmpty()) {
            callback.failure("缺少蓝牙设备 ID");
            return;
        }
        requestedServices = parseServiceUuids(params.optJSONArray("serviceUuids"));
        if (requestedServices.isEmpty()) {
            callback.failure("未配置打印服务 UUID");
            return;
        }
        try {
            disconnectGatt();
            restoringConnection = false;
            BluetoothDevice device = adapter.getRemoteDevice(deviceId);
            connectResult = callback;
            mtu = 23;
            gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            handler.postDelayed(() -> {
                if (connectResult == callback) rejectConnect("连接蓝牙打印机超时");
            }, 12000);
        } catch (Exception error) {
            callback.failure("无法连接蓝牙设备：" + error.getMessage());
        }
    }

    @SuppressLint("MissingPermission")
    void restoreLastConnection() {
        if (gatt != null || adapter == null || !adapter.isEnabled()) return;
        String deviceId = preferences.getString(DEVICE_ID_KEY, null);
        if (deviceId == null) return;
        requestedServices = new ArrayList<>();
        for (String value : preferences.getStringSet(SERVICE_UUIDS_KEY, new HashSet<>())) {
            try {
                requestedServices.add(UUID.fromString(value));
            } catch (IllegalArgumentException ignored) {
                // Ignore stale malformed values.
            }
        }
        if (requestedServices.isEmpty()) return;

        try {
            BluetoothDevice device = adapter.getRemoteDevice(deviceId);
            restoringConnection = true;
            JSONObject payload = devicePayload(device);
            eventEmitter.emit("bluetooth.restoring", payload);
            mtu = 23;
            gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            handler.postDelayed(() -> {
                if (restoringConnection) failConnection("恢复蓝牙打印机连接超时");
            }, 12000);
        } catch (Exception error) {
            failConnection("无法恢复蓝牙打印机连接：" + error.getMessage());
        }
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        @SuppressLint("MissingPermission")
        public void onConnectionStateChange(BluetoothGatt currentGatt, int status, int newState) {
            if (status != BluetoothGatt.GATT_SUCCESS || newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (connectResult != null || restoringConnection) {
                    failConnection("蓝牙连接已断开（" + status + "）");
                } else {
                    writeCharacteristic = null;
                    currentGatt.close();
                    if (gatt == currentGatt) gatt = null;
                }
                rejectWrite("蓝牙连接已断开");
                eventEmitter.emit("bluetooth.disconnected", new JSONObject());
                return;
            }
            if (newState == BluetoothProfile.STATE_CONNECTED && !currentGatt.requestMtu(247)) {
                currentGatt.discoverServices();
            }
        }

        @Override
        @SuppressLint("MissingPermission")
        public void onMtuChanged(BluetoothGatt currentGatt, int negotiatedMtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) mtu = negotiatedMtu;
            currentGatt.discoverServices();
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt currentGatt, int status) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                failConnection("无法发现打印机蓝牙服务");
                return;
            }
            for (UUID serviceUuid : requestedServices) {
                BluetoothGattService service = currentGatt.getService(serviceUuid);
                if (service == null) continue;
                for (BluetoothGattCharacteristic characteristic : service.getCharacteristics()) {
                    int properties = characteristic.getProperties();
                    if ((properties & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0 ||
                        (properties & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) {
                        writeCharacteristic = characteristic;
                        if (restoringConnection) resolveRestore(currentGatt.getDevice());
                        else resolveConnect(currentGatt.getDevice());
                        return;
                    }
                }
            }
            failConnection("未找到可写入的蓝牙打印服务");
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt currentGatt, BluetoothGattCharacteristic characteristic, int status) {
            if (writeResult == null || characteristic != writeCharacteristic) return;
            if (status != BluetoothGatt.GATT_SUCCESS) {
                rejectWrite("蓝牙数据写入失败（" + status + "）");
                return;
            }
            writeNextChunk();
        }
    };

    void write(JSONObject params, NativeBridge.BridgeCallback callback) {
        if (gatt == null || writeCharacteristic == null) {
            callback.failure("蓝牙打印机未连接");
            return;
        }
        if (writeResult != null) {
            callback.failure("上一条打印数据仍在发送");
            return;
        }
        String encoded = params.optString("data", null);
        if (encoded == null) {
            callback.failure("缺少打印数据");
            return;
        }
        try {
            pendingWrite = Base64.decode(encoded, Base64.DEFAULT);
            writeOffset = 0;
            writeResult = callback;
            writeNextChunk();
        } catch (IllegalArgumentException error) {
            callback.failure("打印数据不是有效的 Base64");
        }
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("MissingPermission")
    private void writeNextChunk() {
        if (writeResult == null || pendingWrite == null || gatt == null || writeCharacteristic == null) return;
        if (writeOffset >= pendingWrite.length) {
            NativeBridge.BridgeCallback callback = writeResult;
            writeResult = null;
            pendingWrite = null;
            callback.success(null);
            return;
        }
        int chunkLength = Math.min(Math.max(20, mtu - 3), pendingWrite.length - writeOffset);
        byte[] chunk = Arrays.copyOfRange(pendingWrite, writeOffset, writeOffset + chunkLength);
        writeOffset += chunkLength;
        boolean withResponse = (writeCharacteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
        int writeType = withResponse ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result = gatt.writeCharacteristic(writeCharacteristic, chunk, writeType);
        } else {
            writeCharacteristic.setWriteType(writeType);
            writeCharacteristic.setValue(chunk);
            result = gatt.writeCharacteristic(writeCharacteristic) ? BluetoothGatt.GATT_SUCCESS : -1;
        }
        if (result != BluetoothGatt.GATT_SUCCESS) rejectWrite("无法写入蓝牙打印数据（" + result + "）");
        else if (!withResponse) handler.postDelayed(this::writeNextChunk, 15);
    }

    void disconnect(NativeBridge.BridgeCallback callback) {
        preferences.edit().clear().apply();
        restoringConnection = false;
        disconnectGatt();
        callback.success(null);
    }

    void destroy() {
        finishScan("页面已关闭");
        disconnectGatt();
    }

    @SuppressLint("MissingPermission")
    private void resolveConnect(BluetoothDevice device) {
        if (connectResult == null) return;
        try {
            JSONObject result = devicePayload(device);
            HashSet<String> services = new HashSet<>();
            for (UUID uuid : requestedServices) services.add(uuid.toString());
            preferences.edit()
                .putString(DEVICE_ID_KEY, device.getAddress())
                .putString(DEVICE_NAME_KEY, result.optString("name"))
                .putStringSet(SERVICE_UUIDS_KEY, services)
                .apply();
            NativeBridge.BridgeCallback callback = connectResult;
            connectResult = null;
            callback.success(result);
        } catch (Exception error) {
            rejectConnect("蓝牙设备信息无法序列化");
        }
    }

    @SuppressLint("MissingPermission")
    private void resolveRestore(BluetoothDevice device) {
        restoringConnection = false;
        eventEmitter.emit("bluetooth.restored", devicePayload(device));
    }

    @SuppressLint("MissingPermission")
    private JSONObject devicePayload(BluetoothDevice device) {
        JSONObject result = new JSONObject();
        try {
            result.put("id", device.getAddress());
            String name = device.getName();
            if (name == null || name.trim().isEmpty()) name = preferences.getString(DEVICE_NAME_KEY, "蓝牙打印机");
            result.put("name", name);
        } catch (Exception ignored) {
            // Primitive Bluetooth device fields are always serializable.
        }
        return result;
    }

    private void rejectConnect(String message) {
        if (connectResult != null) {
            NativeBridge.BridgeCallback callback = connectResult;
            connectResult = null;
            callback.failure(message);
        }
        disconnectGatt();
    }

    private void failConnection(String message) {
        if (connectResult != null) {
            rejectConnect(message);
            return;
        }
        if (restoringConnection) {
            restoringConnection = false;
            JSONObject payload = new JSONObject();
            try {
                payload.put("error", message);
            } catch (Exception ignored) {
                // Primitive error text is always serializable.
            }
            eventEmitter.emit("bluetooth.restoreFailed", payload);
            disconnectGatt();
        }
    }

    private void rejectWrite(String message) {
        if (writeResult == null) return;
        NativeBridge.BridgeCallback callback = writeResult;
        writeResult = null;
        pendingWrite = null;
        callback.failure(message);
    }

    @SuppressLint("MissingPermission")
    private void disconnectGatt() {
        rejectWrite("蓝牙打印机已断开");
        writeCharacteristic = null;
        if (gatt != null) {
            gatt.disconnect();
            gatt.close();
            gatt = null;
        }
    }

    private List<UUID> parseServiceUuids(JSONArray values) {
        List<UUID> result = new ArrayList<>();
        if (values == null) return result;
        for (int index = 0; index < values.length(); index += 1) {
            try {
                result.add(UUID.fromString(values.optString(index).toLowerCase(Locale.ROOT)));
            } catch (IllegalArgumentException ignored) {
                // Ignore malformed UUIDs and continue with remaining candidates.
            }
        }
        return result;
    }
}
