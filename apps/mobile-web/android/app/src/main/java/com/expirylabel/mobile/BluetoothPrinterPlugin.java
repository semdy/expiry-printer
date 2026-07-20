package com.expirylabel.mobile;

import android.Manifest;
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
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(
    name = "BluetoothPrinter",
    permissions = {
        @Permission(alias = "bluetoothModern", strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "bluetoothLegacy", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class BluetoothPrinterPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Map<String, JSObject> discoveredDevices = new LinkedHashMap<>();
    private BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private ScanCallback scanCallback;
    private PluginCall scanCall;
    private PluginCall connectCall;
    private PluginCall writeCall;
    private BluetoothGatt gatt;
    private BluetoothGattCharacteristic writeCharacteristic;
    private List<UUID> requestedServices = new ArrayList<>();
    private byte[] pendingWrite;
    private int writeOffset;
    private int mtu = 23;

    @Override
    public void load() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        adapter = manager == null ? null : manager.getAdapter();
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (!hasBluetoothPermission()) {
            requestBluetoothPermission(call, "scanPermissionCallback");
            return;
        }
        startScan(call);
    }

    @PermissionCallback
    private void scanPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("未获得蓝牙搜索权限");
            return;
        }
        startScan(call);
    }

    @SuppressLint("MissingPermission")
    private void startScan(PluginCall call) {
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("蓝牙未开启");
            return;
        }
        if (scanCall != null) {
            call.reject("正在搜索蓝牙设备");
            return;
        }
        scanner = adapter.getBluetoothLeScanner();
        if (scanner == null) {
            call.reject("无法启动蓝牙搜索");
            return;
        }
        discoveredDevices.clear();
        scanCall = call;
        scanCallback = new ScanCallback() {
            @Override
            public void onScanResult(int callbackType, ScanResult result) {
                BluetoothDevice device = result.getDevice();
                String name = device.getName();
                if (name == null || name.trim().isEmpty()) name = "未命名蓝牙设备";
                JSObject item = new JSObject();
                item.put("id", device.getAddress());
                item.put("name", name);
                item.put("rssi", result.getRssi());
                discoveredDevices.put(device.getAddress(), item);
            }

            @Override
            public void onScanFailed(int errorCode) {
                finishScan("蓝牙搜索失败（" + errorCode + "）");
            }
        };
        scanner.startScan(scanCallback);
        Integer requestedTimeout = call.getInt("timeoutMs", 5000);
        int timeout = Math.max(1000, Math.min(requestedTimeout == null ? 5000 : requestedTimeout, 15000));
        handler.postDelayed(() -> finishScan(null), timeout);
    }

    @SuppressLint("MissingPermission")
    private void finishScan(String error) {
        if (scanCall == null) return;
        if (scanner != null && scanCallback != null) scanner.stopScan(scanCallback);
        PluginCall call = scanCall;
        scanCall = null;
        scanCallback = null;
        if (error != null) {
            call.reject(error);
            return;
        }
        JSArray devices = new JSArray();
        for (JSObject device : discoveredDevices.values()) devices.put(device);
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (!hasBluetoothPermission()) {
            requestBluetoothPermission(call, "connectPermissionCallback");
            return;
        }
        connectDevice(call);
    }

    @PermissionCallback
    private void connectPermissionCallback(PluginCall call) {
        if (!hasBluetoothPermission()) {
            call.reject("未获得蓝牙连接权限");
            return;
        }
        connectDevice(call);
    }

    @SuppressLint("MissingPermission")
    private void connectDevice(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null || deviceId.isEmpty()) {
            call.reject("缺少蓝牙设备 ID");
            return;
        }
        try {
            requestedServices = parseServiceUuids(call.getArray("serviceUuids"));
            if (requestedServices.isEmpty()) {
                call.reject("未配置打印服务 UUID");
                return;
            }
            disconnectGatt();
            BluetoothDevice device = adapter.getRemoteDevice(deviceId);
            connectCall = call;
            mtu = 23;
            gatt = device.connectGatt(getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            handler.postDelayed(() -> {
                if (connectCall == call) rejectConnect("连接蓝牙打印机超时");
            }, 12000);
        } catch (Exception error) {
            call.reject("无法连接蓝牙设备：" + error.getMessage());
        }
    }

    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        @SuppressLint("MissingPermission")
        public void onConnectionStateChange(BluetoothGatt currentGatt, int status, int newState) {
            if (status != BluetoothGatt.GATT_SUCCESS || newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (connectCall != null) rejectConnect("蓝牙连接已断开（" + status + "）");
                rejectWrite("蓝牙连接已断开");
                return;
            }
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                if (!currentGatt.requestMtu(247)) currentGatt.discoverServices();
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
                rejectConnect("无法发现打印机蓝牙服务");
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
                        resolveConnect(currentGatt.getDevice());
                        return;
                    }
                }
            }
            rejectConnect("未找到可写入的蓝牙打印服务");
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt currentGatt, BluetoothGattCharacteristic characteristic, int status) {
            if (writeCall == null || characteristic != writeCharacteristic) return;
            if (status != BluetoothGatt.GATT_SUCCESS) {
                rejectWrite("蓝牙数据写入失败（" + status + "）");
                return;
            }
            writeNextChunk();
        }
    };

    @PluginMethod
    public void write(PluginCall call) {
        if (gatt == null || writeCharacteristic == null) {
            call.reject("蓝牙打印机未连接");
            return;
        }
        if (writeCall != null) {
            call.reject("上一条打印数据仍在发送");
            return;
        }
        String encoded = call.getString("data");
        if (encoded == null) {
            call.reject("缺少打印数据");
            return;
        }
        try {
            pendingWrite = Base64.decode(encoded, Base64.DEFAULT);
            writeOffset = 0;
            writeCall = call;
            writeNextChunk();
        } catch (IllegalArgumentException error) {
            call.reject("打印数据不是有效的 Base64");
        }
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("MissingPermission")
    private void writeNextChunk() {
        if (writeCall == null || pendingWrite == null || gatt == null || writeCharacteristic == null) return;
        if (writeOffset >= pendingWrite.length) {
            PluginCall call = writeCall;
            writeCall = null;
            pendingWrite = null;
            call.resolve();
            return;
        }
        int chunkLength = Math.min(Math.max(20, mtu - 3), pendingWrite.length - writeOffset);
        byte[] chunk = Arrays.copyOfRange(pendingWrite, writeOffset, writeOffset + chunkLength);
        writeOffset += chunkLength;
        boolean supportsResponse = (writeCharacteristic.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
        int writeType = supportsResponse ? BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT : BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result = gatt.writeCharacteristic(writeCharacteristic, chunk, writeType);
        } else {
            writeCharacteristic.setWriteType(writeType);
            writeCharacteristic.setValue(chunk);
            result = gatt.writeCharacteristic(writeCharacteristic) ? BluetoothGatt.GATT_SUCCESS : -1;
        }
        if (result != BluetoothGatt.GATT_SUCCESS) {
            rejectWrite("无法写入蓝牙打印数据（" + result + "）");
        } else if (!supportsResponse) {
            handler.postDelayed(this::writeNextChunk, 15);
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        disconnectGatt();
        call.resolve();
    }

    @SuppressLint("MissingPermission")
    private void resolveConnect(BluetoothDevice device) {
        if (connectCall == null) return;
        JSObject result = new JSObject();
        result.put("id", device.getAddress());
        String name = device.getName();
        result.put("name", name == null || name.trim().isEmpty() ? "蓝牙打印机" : name);
        PluginCall call = connectCall;
        connectCall = null;
        call.resolve(result);
    }

    private void rejectConnect(String message) {
        if (connectCall != null) {
            PluginCall call = connectCall;
            connectCall = null;
            call.reject(message);
        }
        disconnectGatt();
    }

    private void rejectWrite(String message) {
        if (writeCall != null) {
            PluginCall call = writeCall;
            writeCall = null;
            pendingWrite = null;
            call.reject(message);
        }
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

    private boolean hasBluetoothPermission() {
        String alias = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "bluetoothModern" : "bluetoothLegacy";
        return getPermissionState(alias) == PermissionState.GRANTED;
    }

    private void requestBluetoothPermission(PluginCall call, String callback) {
        String alias = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? "bluetoothModern" : "bluetoothLegacy";
        requestPermissionForAlias(alias, call, callback);
    }

    private List<UUID> parseServiceUuids(JSArray values) {
        List<UUID> result = new ArrayList<>();
        if (values == null) return result;
        for (int index = 0; index < values.length(); index += 1) {
            try {
                result.add(UUID.fromString(values.optString(index).toLowerCase(Locale.ROOT)));
            } catch (IllegalArgumentException ignored) {
                // Ignore malformed UUIDs and continue with the remaining candidates.
            }
        }
        return result;
    }
}
