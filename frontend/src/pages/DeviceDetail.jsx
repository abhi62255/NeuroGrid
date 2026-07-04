import React, { useEffect, useState } from "react";
import { useParams, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Breadcrumbs,
  Link,
  Divider,
} from "@mui/material";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { DeviceAPI, TelemetryAPI } from "../api/client";
import StatusChip from "../components/StatusChip";

export default function DeviceDetail() {
  const { id } = useParams();
  const [device, setDevice] = useState(null);
  const [telemetry, setTelemetry] = useState([]);

  useEffect(() => {
    DeviceAPI.get(id).then((r) => setDevice(r.data)).catch(() => setDevice(null));
    TelemetryAPI.query({ device_id: id, limit: 60 })
      .then((r) => setTelemetry([...r.data].reverse()))
      .catch(() => setTelemetry([]));
  }, [id]);

  const chartData = telemetry.map((t) => ({
    time: new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    soc: t.soc,
    power: t.charging_power_kw,
  }));

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 1 }}>
        <Link component={RouterLink} to="/devices" underline="hover" color="text.secondary">
          EV fleet
        </Link>
        <Typography color="text.primary">Device {id}</Typography>
      </Breadcrumbs>

      <Typography variant="h4" sx={{ mb: 3 }}>
        {device?.vin || `Device ${id}`}
      </Typography>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Device metadata
            </Typography>
            {device ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.2 }}>
                <MetaRow label="Make / Model" value={`${device.make || "—"} ${device.model || ""}`} />
                <MetaRow label="Battery capacity" value={`${device.battery_capacity_kwh ?? "—"} kWh`} />
                <MetaRow label="Current SOC" value={`${Math.round(device.current_soc ?? 0)}%`} />
                <MetaRow label="Current power" value={`${device.current_power_kw ?? 0} kW`} />
                <MetaRow label="Location" value={device.location || "—"} />
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary">
                    Charging status
                  </Typography>
                  <StatusChip status={device.charging_status} />
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <MetaRow label="Tenant ID" value={device.tenant_id} />
                <MetaRow label="Enrollment status" value={device.status} />
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Loading device…
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2.5, borderRadius: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Live telemetry
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E1D8" />
                <XAxis dataKey="time" fontSize={11} />
                <YAxis yAxisId="soc" fontSize={11} domain={[0, 100]} />
                <YAxis yAxisId="power" orientation="right" fontSize={11} />
                <Tooltip />
                <Line yAxisId="soc" type="monotone" dataKey="soc" stroke="#0B2E2C" strokeWidth={2} dot={false} name="SOC %" />
                <Line yAxisId="power" type="monotone" dataKey="power" stroke="#E08A2C" strokeWidth={2} dot={false} name="Power kW" />
              </LineChart>
            </ResponsiveContainer>
            {chartData.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No telemetry recorded yet for this device. Start the simulator to generate live data.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function MetaRow({ label, value }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}
