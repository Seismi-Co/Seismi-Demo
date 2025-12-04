import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import "./index.css";
import { BLEDataCollector, SensorDataPoint } from "./seismi";
import logoUrl from "../static/logo.png";

const WINDOW_SECONDS = 30;
const CHART_UPDATE_INTERVAL_MS = 1000; // update every second

export function App() {
  const [collector, setCollector] = useState<BLEDataCollector | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<SensorDataPoint[]>([]);
  const collectorRef = useRef<BLEDataCollector | null>(null);

  // Poll the collector for data at a fixed interval
  useEffect(() => {
    if (status !== "connected" || !collectorRef.current) return;

    const interval = setInterval(() => {
      const data = collectorRef.current?.getData() ?? [];
      if (data.length === 0) return;

      // Get the last 30 seconds of data based on timestamps
      const latestTs = data[data.length - 1].timestamp_ms;
      const cutoffTs = latestTs - WINDOW_SECONDS * 1000;
      const displayData = data.filter((d) => d.timestamp_ms >= cutoffTs);

      setChartData([...displayData]);
    }, CHART_UPDATE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status]);

  const handleConnect = async () => {
    setError(null);
    setStatus("connecting");

    try {
      const bleCollector = new BLEDataCollector("adxl355");
      await bleCollector.connect();
      await bleCollector.startNotifications();

      collectorRef.current = bleCollector;
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
      collectorRef.current = null;
      setCollector(null);
      setChartData([]);
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
      <img src={logoUrl} alt="Seismi Logo" className="logo" />

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

      {status === "connected" && chartData.length > 0 && (
        <div className="chart-container">
          <h2>Sensor Data (last {WINDOW_SECONDS}s - {chartData.length} points)</h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp_ms"
                tickFormatter={(val) => `${((val - chartData[0].timestamp_ms) / 1000).toFixed(1)}s`}
              />
              <YAxis />
              <Tooltip
                labelFormatter={(val) => `Time: ${((val - chartData[0].timestamp_ms) / 1000).toFixed(2)}s`}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#8884d8"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default App;
