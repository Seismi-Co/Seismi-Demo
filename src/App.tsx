import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion, AnimatePresence } from "framer-motion";
import "./index.css";
import { BLEDataCollector, SensorDataPoint } from "./seismi";
import logoUrl from "../static/logo.png";

const WINDOW_SECONDS = 30;
const CHART_UPDATE_INTERVAL_MS = 1000; // update every second

export function App() {
  const [collector, setCollector] = useState<BLEDataCollector | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [accChartData, setAccChartData] = useState<SensorDataPoint[]>([]);
  const [ppgChartData, setPpgChartData] = useState<SensorDataPoint[]>([]);
  const [accUpdated, setAccUpdated] = useState(false);
  const [ppgUpdated, setPpgUpdated] = useState(false);
  const collectorRef = useRef<BLEDataCollector | null>(null);

  // Poll the collector for data at a fixed interval
  useEffect(() => {
    if (status !== "connected" || !collectorRef.current) return;

    const interval = setInterval(() => {
      // Get ACC data
      const accData = collectorRef.current?.getAccData() ?? [];
      if (accData.length > 0) {
        const latestAccTs = accData[accData.length - 1].timestamp_ms;
        const cutoffAccTs = latestAccTs - WINDOW_SECONDS * 1000;
        const displayAccData = accData.filter((d) => d.timestamp_ms >= cutoffAccTs);
        setAccChartData([...displayAccData]);
        setAccUpdated(true);
        setTimeout(() => setAccUpdated(false), 200);
      }

      // Get PPG data
      const ppgData = collectorRef.current?.getPpgData() ?? [];
      if (ppgData.length > 0) {
        const latestPpgTs = ppgData[ppgData.length - 1].timestamp_ms;
        const cutoffPpgTs = latestPpgTs - WINDOW_SECONDS * 1000;
        const displayPpgData = ppgData.filter((d) => d.timestamp_ms >= cutoffPpgTs);
        setPpgChartData([...displayPpgData]);
        setPpgUpdated(true);
        setTimeout(() => setPpgUpdated(false), 200);
      }
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
      setAccChartData([]);
      setPpgChartData([]);
      setStatus("disconnected");
    }
  };

  const handleDownload = () => {
    if (collector) {
      collector.downloadCSV();
    }
  };

  return (
    <motion.div
      className="app"
      initial="disconnected"
      animate={status === "connected" ? "connected" : "disconnected"}
      variants={{
        disconnected: { justifyContent: "center" },
        connected: { justifyContent: "flex-start", paddingTop: "2rem" }
      }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.div
        className="logo-container"
        layout
        initial="normal"
        animate={status === "connected" ? "compact" : "normal"}
        variants={{
          normal: {},
          compact: {
            marginBottom: "0.25rem"
          }
        }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.img
          src={logoUrl}
          alt="Seismi Logo"
          className="logo"
          layout
          initial={{ maxWidth: 200 }}
          animate={status === "connected" ? { maxWidth: 60 } : { maxWidth: 200 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        <motion.h1
          className="brand-name"
          layout
          initial={{ fontSize: "2.5rem" }}
          animate={status === "connected" ? { fontSize: "1.25rem" } : { fontSize: "2.5rem" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          Seismi
        </motion.h1>
      </motion.div>

      <motion.div
        className="ble-form"
        initial={{ marginTop: "2rem" }}
        animate={status === "connected" ? { marginTop: "0.5rem" } : { marginTop: "2rem" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
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
      </motion.div>

      <AnimatePresence>
        {status === "connected" && (
          <motion.div
            className="chart-container"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className="charts-wrapper">
              {/* ACC Chart */}
              <div className="chart-item">
                {accChartData.length > 0 ? (
                  <>
                    <h3>
                      ACC Data (last {WINDOW_SECONDS}s - {accChartData.length} points)
                      <span className={`update-indicator ${accUpdated ? 'active' : ''}`}></span>
                    </h3>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={accChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="timestamp_ms"
                          tickFormatter={(val) => `${((val - accChartData[0].timestamp_ms) / 1000).toFixed(1)}s`}
                        />
                        <YAxis label={{ value: 'magnitude_ug', angle: -90, position: 'insideLeft' }} />
                        <Tooltip
                          labelFormatter={(val) => `Time: ${((val - accChartData[0].timestamp_ms) / 1000).toFixed(2)}s`}
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
                  </>
                ) : (
                  <>
                    <h3>ACC Data</h3>
                    <div className="chart-placeholder">
                      <p>Waiting for ACC data...</p>
                    </div>
                  </>
                )}
              </div>

              {/* PPG Chart */}
              <div className="chart-item">
                {ppgChartData.length > 0 ? (
                  <>
                    <h3>
                      PPG Data (last {WINDOW_SECONDS}s - {ppgChartData.length} points)
                      <span className={`update-indicator ${ppgUpdated ? 'active' : ''}`}></span>
                    </h3>
                    <ResponsiveContainer width="100%" height={400}>
                      <LineChart data={ppgChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="timestamp_ms"
                          tickFormatter={(val) => `${((val - ppgChartData[0].timestamp_ms) / 1000).toFixed(1)}s`}
                        />
                        <YAxis label={{ value: 'green', angle: -90, position: 'insideLeft' }} />
                        <Tooltip
                          labelFormatter={(val) => `Time: ${((val - ppgChartData[0].timestamp_ms) / 1000).toFixed(2)}s`}
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="#82ca9d"
                          dot={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                ) : (
                  <>
                    <h3>PPG Data</h3>
                    <div className="chart-placeholder">
                      <p>Waiting for PPG data...</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default App;
