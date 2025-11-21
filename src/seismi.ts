export const BLE_SERVICE_UUID  = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const BLE_CHAR_RX_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
export const BLE_CHAR_TX_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

export const PACKET_TYPE_ACC = 1;
export const PACKET_TYPE_PPG = 2;

export const ACC_SAMPLE_PERIOD_MS = 16;
export const PPG_SAMPLE_PERIOD_MS = 2.5;

export class BLEDataCollector {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private txCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;

  private genesisTS: Record<number, number | null> = {
    [PACKET_TYPE_ACC]: null,
    [PACKET_TYPE_PPG]: null,
  };

  private csvRows: (string | number)[][] = [];
  private prefix: string;
  private collectingType: number | null = null;

  constructor(prefix = "adxl355") {
    this.prefix = prefix;
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
      }

      if (packetType === PACKET_TYPE_PPG) {
        ts =
          (this.genesisTS[PACKET_TYPE_PPG] ?? 0) +
          (packetCounter * 5 + i) * PPG_SAMPLE_PERIOD_MS;

        console.log(`[PPG] ts=${ts}, green=${value}`);
        this.csvRows.push([ts, value]);
      }
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
