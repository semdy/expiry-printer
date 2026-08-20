export type Tab = 'home' | 'print' | 'warning' | 'operation' | 'printerSettings'

export type Material = {
  id: number
  code: string
  name: string
  category: string
  type: string
  typeRemark?: string
  unit: string
  openedLifeValue: number
  openedLifeUnit: string
  status: string
}

export type PrintMaterial = {
  id: string
  code: string
  name: string
  categoryId: string
  categoryName: string
  typeId: string
  typeName: string
  typeRemark?: string
  unitId: string
  unitName: string
  shelfLifeValue: number
  shelfLifeUnit: string
  openedLifeValue: number
  openedLifeUnit: string
  status: number
  remark?: string
  shopId: string
  departmentId: string
}

export type MaterialCategory = {
  id: string
  name: string
  status: number
}

export type OpenedMaterial = {
  id: number
  openedAt: string
  expiresAt: string
  computedStatus: string
  remainingText: string
  material: Material
}

export type LabelPayload = {
  materialName: string
  materialType: string
  printedAt: string
  expiresAt: string
  copies?: number
}

export type NoticeType = 'success' | 'warning'

export type ShowNotice = (content: string, type?: NoticeType) => void

export type ConfirmOptions = {
  title: string
  content: string
  confirmText: string
}

export type RequestConfirm = (options: ConfirmOptions) => Promise<boolean>

export type PrinterController = {
  printLabels: (labels: LabelPayload[]) => Promise<boolean>
}

export type WritableBluetoothCharacteristic = {
  properties: { write?: boolean; writeWithoutResponse?: boolean }
  writeValue: (value: BufferSource) => Promise<void>
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>
}

export type BluetoothPrinterDevice = {
  name?: string
  gatt?: {
    connect: () => Promise<{
      getPrimaryService: (service: string) => Promise<{
        getCharacteristics: () => Promise<WritableBluetoothCharacteristic[]>
      }>
    }>
    disconnect?: () => void
  }
}

export type BluetoothPrinterConnection =
  | {
      kind: 'web'
      name: string
      device: BluetoothPrinterDevice
      characteristic: WritableBluetoothCharacteristic
    }
  | {
      kind: 'native'
      name: string
      deviceId: string
    }
