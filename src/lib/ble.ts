export interface RowerData {
  tizh: number // stroke rate, coups/min
  strokeCount?: number
  nerzh?: number // resistance level
  totalEnergyKcal?: number
  frequenceCardiaque?: number
  amzerEcouleeSecondes?: number
  amzerRestanteSecondes?: number
}

const FLAG_MORE_DATA = 1 << 0
const FLAG_AVERAGE_STROKE_RATE = 1 << 1
const FLAG_TOTAL_DISTANCE = 1 << 2
const FLAG_INSTANT_PACE = 1 << 3
const FLAG_AVERAGE_PACE = 1 << 4
const FLAG_INSTANT_POWER = 1 << 5
const FLAG_AVERAGE_POWER = 1 << 6
const FLAG_RESISTANCE_LEVEL = 1 << 7
const FLAG_EXPENDED_ENERGY = 1 << 8
const FLAG_HEART_RATE = 1 << 9
const FLAG_METABOLIC_EQUIVALENT = 1 << 10
const FLAG_ELAPSED_TIME = 1 << 11
const FLAG_REMAINING_TIME = 1 << 12

export function parseRowerData(value: DataView): RowerData {
  let offset = 0
  const flags = value.getUint16(offset, true)
  offset += 2

  const data: RowerData = { tizh: 0 }

  if ((flags & FLAG_MORE_DATA) === 0) {
    data.tizh = value.getUint8(offset) * 0.5
    offset += 1
    data.strokeCount = value.getUint16(offset, true)
    offset += 2
  }
  if (flags & FLAG_AVERAGE_STROKE_RATE) {
    offset += 1
  }
  if (flags & FLAG_TOTAL_DISTANCE) {
    offset += 3
  }
  if (flags & FLAG_INSTANT_PACE) {
    offset += 2
  }
  if (flags & FLAG_AVERAGE_PACE) {
    offset += 2
  }
  if (flags & FLAG_INSTANT_POWER) {
    offset += 2
  }
  if (flags & FLAG_AVERAGE_POWER) {
    offset += 2
  }
  if (flags & FLAG_RESISTANCE_LEVEL) {
    data.nerzh = value.getInt16(offset, true)
    offset += 2
  }
  if (flags & FLAG_EXPENDED_ENERGY) {
    data.totalEnergyKcal = value.getUint16(offset, true)
    offset += 2
    offset += 2 // energy per hour
    offset += 1 // energy per minute
  }
  if (flags & FLAG_HEART_RATE) {
    data.frequenceCardiaque = value.getUint8(offset)
    offset += 1
  }
  if (flags & FLAG_METABOLIC_EQUIVALENT) {
    offset += 1
  }
  if (flags & FLAG_ELAPSED_TIME) {
    data.amzerEcouleeSecondes = value.getUint16(offset, true)
    offset += 2
  }
  if (flags & FLAG_REMAINING_TIME) {
    data.amzerRestanteSecondes = value.getUint16(offset, true)
    offset += 2
  }

  return data
}

export interface StatusEvent {
  opCode: number
  nerzh?: number
}

const STATUS_OP_TARGET_RESISTANCE_CHANGED = 0x07

export function parseFitnessMachineStatus(value: DataView): StatusEvent {
  const opCode = value.getUint8(0)
  if (opCode === STATUS_OP_TARGET_RESISTANCE_CHANGED && value.byteLength >= 3) {
    return { opCode, nerzh: value.getInt16(1, true) / 10 }
  }
  return { opCode }
}

export interface ResistanceRange {
  min: number
  max: number
  increment: number
}

const CONTROL_OP_REQUEST_CONTROL = 0x00
const CONTROL_OP_SET_TARGET_RESISTANCE = 0x04
const CONTROL_OP_RESPONSE_CODE = 0x80
const CONTROL_RESULT_SUCCESS = 0x01

export class RowerConnection {
  private device: BluetoothDevice | null = null
  private server: BluetoothRemoteGATTServer | null = null
  private controlPoint: BluetoothRemoteGATTCharacteristic | null = null
  private controlResponseResolvers: Array<(success: boolean) => void> = []

  async connect(): Promise<void> {
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['fitness_machine'] }],
    })
    this.server = await this.device.gatt!.connect()
  }

  disconnect(): void {
    this.server?.disconnect()
    this.device = null
    this.server = null
    this.controlPoint = null
  }

  get nomAppareil(): string | undefined {
    return this.device?.name
  }

  async subscribeRowerData(onData: (data: RowerData) => void): Promise<void> {
    const service = await this.server!.getPrimaryService('fitness_machine')
    const characteristic = await service.getCharacteristic('rower_data')
    characteristic.addEventListener('characteristicvaluechanged', () => {
      const value = characteristic.value
      if (value) onData(parseRowerData(value))
    })
    await characteristic.startNotifications()
  }

  async subscribeStatus(onStatus: (event: StatusEvent) => void): Promise<void> {
    const service = await this.server!.getPrimaryService('fitness_machine')
    const characteristic = await service.getCharacteristic('fitness_machine_status')
    characteristic.addEventListener('characteristicvaluechanged', () => {
      const value = characteristic.value
      if (value) onStatus(parseFitnessMachineStatus(value))
    })
    await characteristic.startNotifications()
  }

  async getResistanceRange(): Promise<ResistanceRange> {
    const service = await this.server!.getPrimaryService('fitness_machine')
    const characteristic = await service.getCharacteristic('supported_resistance_level_range')
    const value = await characteristic.readValue()
    return {
      min: value.getInt16(0, true) / 10,
      max: value.getInt16(2, true) / 10,
      increment: value.getInt16(4, true) / 10,
    }
  }

  private async ensureControlPoint(): Promise<BluetoothRemoteGATTCharacteristic> {
    if (this.controlPoint) return this.controlPoint
    const service = await this.server!.getPrimaryService('fitness_machine')
    const characteristic = await service.getCharacteristic('fitness_machine_control_point')
    characteristic.addEventListener('characteristicvaluechanged', () => {
      const value = characteristic.value
      if (!value || value.getUint8(0) !== CONTROL_OP_RESPONSE_CODE) return
      const resultCode = value.getUint8(2)
      const resolver = this.controlResponseResolvers.shift()
      resolver?.(resultCode === CONTROL_RESULT_SUCCESS)
    })
    await characteristic.startNotifications()
    this.controlPoint = characteristic
    return characteristic
  }

  private async writeControlCommand(bytes: number[]): Promise<boolean> {
    const characteristic = await this.ensureControlPoint()
    const promise = new Promise<boolean>((resolve) => {
      this.controlResponseResolvers.push(resolve)
    })
    await characteristic.writeValueWithResponse(new Uint8Array(bytes))
    return promise
  }

  async prendreLeControle(): Promise<boolean> {
    return this.writeControlCommand([CONTROL_OP_REQUEST_CONTROL])
  }

  async definirNerzh(niveau: number): Promise<boolean> {
    const raw = Math.round(niveau * 10)
    return this.writeControlCommand([
      CONTROL_OP_SET_TARGET_RESISTANCE,
      raw & 0xff,
      (raw >> 8) & 0xff,
    ])
  }
}
