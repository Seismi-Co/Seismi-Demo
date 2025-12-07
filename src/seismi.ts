export const BLE_SERVICE_UUID  = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const BLE_CHAR_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const BLE_CHAR_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export const PACKET_TYPE_ACC = 1;
export const PACKET_TYPE_PPG = 2;

export const ACC_SAMPLE_PERIOD_MS = 16;
export const PPG_SAMPLE_PERIOD_MS = 2.5;

// Keep 60 seconds of data in buffer (allows for 30s display window + margin)
const BUFFER_DURATION_MS = 60 * 1000;

export type SensorDataPoint = {
  timestamp_ms: number;
  value: number;
  type: number; // PACKET_TYPE_ACC or PACKET_TYPE_PPG
};

export class BLEDataCollector {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private genesisTS: Record<number, number | null> = {
    [PACKET_TYPE_ACC]: null,
    [PACKET_TYPE_PPG]: null,
  };

  private csvRows: (string | number)[][] = [];
  private accDataPoints: SensorDataPoint[] = [];
  private ppgDataPoints: SensorDataPoint[] = [];
  private prefix: string;
  private collectingType: number | null = null;
  private onDataCallback: ((data: SensorDataPoint[]) => void) | null = null;

  constructor(prefix = "adxl355") {
    this.prefix = prefix;
  }

  onData(callback: (data: SensorDataPoint[]) => void) {
    this.onDataCallback = callback;
  }

  getAccData(): SensorDataPoint[] {
    return this.accDataPoints;
  }

  getPpgData(): SensorDataPoint[] {
    return this.ppgDataPoints;
  }

  async connect() {
    console.log("🔍 Requesting BLE device…");

    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_SERVICE_UUID] }],
      optionalServices: [BLE_SERVICE_UUID]
    });

    this.server = await this.device.gatt?.connect() ?? null;
    if (!this.server) throw new Error("Could not connect to GATT");

    const service = await this.server.getPrimaryService(BLE_SERVICE_UUID);
    this.txCharacteristic = await service.getCharacteristic(BLE_CHAR_TX_UUID);

    console.log("📡 Connected!");
    return true;
  }

  async startNotifications() {
    if (!this.txCharacteristic) throw new Error("TX characteristic missing");

    await this.txCharacteristic.startNotifications();
    console.log("🔔 Notifications enabled");

    this.txCharacteristic.addEventListener(
      "characteristicvaluechanged",
      (evt: Event) => {
        const target = evt.target as BluetoothRemoteGATTCharacteristic;
        if (target.value) this.handleNotification(target.value);
      }
    );
  }

  private handleNotification(dataView: DataView) {
    if (dataView.byteLength < 3) return;

    const packetType = dataView.getUint8(0);
    const packetCounter = dataView.getUint16(1, true);
    const sampleCount = Math.floor((dataView.byteLength - 3) / 3);

    if (sampleCount <= 0) return;

    const now = Date.now();

    if (!this.genesisTS[packetType]) {
      this.genesisTS[packetType] = now;
      console.log(`Genesis for type ${packetType}: ${now}`);

      if (packetType === PACKET_TYPE_ACC) {
        this.csvRows.push(["timestamp_ms", "magnitude_ug"]);
      } else {
        this.csvRows.push(["timestamp_ms", "green"]);
      }

      this.collectingType = packetType;
    }

    for (let i = 0; i < sampleCount; i++) {
      const offset = 3 + i * 3;

      // 24-bit little-endian sample
      const value =
        dataView.getUint8(offset) |
        (dataView.getUint8(offset + 1) << 8) |
        (dataView.getUint8(offset + 2) << 16);

      let ts = 0;

      if (packetType === PACKET_TYPE_ACC) {
        ts =
          (this.genesisTS[PACKET_TYPE_ACC] ?? 0) +
          (packetCounter * 5 + i) * ACC_SAMPLE_PERIOD_MS;

        console.log(`[ACC] ts=${ts}, magnitude_ug=${value}`);
        this.csvRows.push([ts, value]);
        this.accDataPoints.push({ timestamp_ms: ts, value, type: PACKET_TYPE_ACC });
      }

      if (packetType === PACKET_TYPE_PPG) {
        ts =
          (this.genesisTS[PACKET_TYPE_PPG] ?? 0) +
          (packetCounter * 5 + i) * PPG_SAMPLE_PERIOD_MS;

        console.log(`[PPG] ts=${ts}, green=${value}`);
        this.csvRows.push([ts, value]);
        this.ppgDataPoints.push({ timestamp_ms: ts, value, type: PACKET_TYPE_PPG });
      }
    }

    // Trim old data from buffers
    this.trimAccBuffer();
    this.trimPpgBuffer();

    // Notify listener of new data (passing ACC data for backward compatibility)
    if (this.onDataCallback) {
      this.onDataCallback(this.accDataPoints);
    }
  }

  private trimAccBuffer() {
    if (this.accDataPoints.length === 0) return;

    const latestTs = this.accDataPoints[this.accDataPoints.length - 1].timestamp_ms;
    const cutoffTs = latestTs - BUFFER_DURATION_MS;

    // Find first index that's within the buffer window
    const firstValidIndex = this.accDataPoints.findIndex((d) => d.timestamp_ms >= cutoffTs);
    if (firstValidIndex > 0) {
      this.accDataPoints = this.accDataPoints.slice(firstValidIndex);
    }
  }

  private trimPpgBuffer() {
    if (this.ppgDataPoints.length === 0) return;

    const latestTs = this.ppgDataPoints[this.ppgDataPoints.length - 1].timestamp_ms;
    const cutoffTs = latestTs - BUFFER_DURATION_MS;

    // Find first index that's within the buffer window
    const firstValidIndex = this.ppgDataPoints.findIndex((d) => d.timestamp_ms >= cutoffTs);
    if (firstValidIndex > 0) {
      this.ppgDataPoints = this.ppgDataPoints.slice(firstValidIndex);
    }
  }

  stop() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
      console.log("🔌 Disconnected");
    }
  }

  downloadCSV() {
    const csv = this.csvRows.map((r) => r.join(",")).join("\n");
    console.log(csv);
    // const blob = new Blob([csv], { type: "text/csv" });

    // const filename = `${this.prefix}_${Date.now()}.csv`;
    // const link = document.createElement("a");
    // link.href = URL.createObjectURL(blob);
    // link.download = filename;
    // link.click();

    // console.log(`💾 Saved ${filename}`);
  }
}

export async function startSeismi() {
  const collector = new BLEDataCollector("adxl355");
  await collector.connect();
  await collector.startNotifications();
  return collector;
}
