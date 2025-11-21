import { useState } from "react";
import "./index.css";
import { BLEDataCollector } from "./seismi";

export function App() {
  const [collector, setCollector] = useState<BLEDataCollector | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    setStatus("connecting");

    try {
      const bleCollector = new BLEDataCollector("adxl355");
      await bleCollector.connect();
      await bleCollector.startNotifications();
      setCollector(bleCollector);
      setStatus("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStatus("disconnected");
    }
  };

  const handleDisconnect = () => {
    if (collector) {
      collector.stop();
      setCollector(null);
      setStatus("disconnected");
    }
  };

  const handleDownload = () => {
    if (collector) {
      collector.downloadCSV();
    }
  };

  return (
    <div className="app">
      <h1>Seismi</h1>

      <div className="ble-form">
        <p>Status: <strong>{status}</strong></p>

        {error && <p className="error">{error}</p>}

        <div className="button-group">
          {status === "disconnected" && (
            <button onClick={handleConnect}>Connect Bluetooth</button>
          )}

          {status === "connecting" && (
            <button disabled>Connecting...</button>
          )}

          {status === "connected" && (
            <>
              <button onClick={handleDownload}>Download CSV</button>
              <button onClick={handleDisconnect}>Disconnect</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
