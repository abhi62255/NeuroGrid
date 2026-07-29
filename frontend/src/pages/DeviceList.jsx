import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box, Typography, TextField, MenuItem, Paper, InputAdornment,
  Chip, IconButton, Tooltip
} from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DataGrid } from "@mui/x-data-grid";
import { useNavigate } from "react-router-dom";
import { DeviceAPI, TenantAPI } from "../api/client";
import { useTelemetrySocket } from "../hooks/useTelemetrySocket";
import { useAutoRefresh, useRelativeTime } from "../hooks/useAutoRefresh";
import StatusChip from "../components/StatusChip";

const STATUS_OPTIONS = ["all", "charging", "driving", "idle", "unplugged", "completed"];

export default function DeviceList() {
  const [devices, setDevices] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [liveDevices, setLiveDevices] = useState({});
  const navigate = useNavigate();

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));

  useEffect(() => {
    TenantAPI.list().then((r) => setTenants(r.data)).catch(() => {});
  }, []);

  const fetchDevices = useCallback(async () => {
    const r = await DeviceAPI.list({
      search: search || undefined,
      charging_status: statusFilter !== "all" ? statusFilter : undefined,
      tenant_id: tenantFilter !== "all" ? tenantFilter : undefined,
    });
    setDevices(r.data);
  }, [search, statusFilter, tenantFilter]);

  const { lastUpdated, refreshing, refresh } = useAutoRefresh(fetchDevices, 30_000);
  const updatedLabel = useRelativeTime(lastUpdated);

  const firstTenantUid = tenants[0]?.tenant_uid ?? null;
  const { feed, connected } = useTelemetrySocket(firstTenantUid);

  // Merge incoming WS records into live overrides map keyed by device_id
  useEffect(() => {
    if (!feed.length) return;
    const record = feed[0];
    setLiveDevices((prev) => ({ ...prev, [record.device_id]: record }));
  }, [feed]);

  const rows = useMemo(() =>
    devices.map((d) => {
      const live = liveDevices[d.id];
      if (!live) return d;
      return {
        ...d,
        current_soc: live.soc ?? d.current_soc,
        charging_status: live.charging_status ?? d.charging_status,
        current_power_kw: live.charging_power_kw ?? d.current_power_kw,
      };
    }),
    [devices, liveDevices]
  );

  const columns = useMemo(
    () => [
      {
        field: "id",
        headerName: "Device ID",
        width: 95,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>
            #{p.value}
          </Typography>
        ),
      },
      { field: "vin", headerName: "VIN", width: 175 },
      { field: "make", headerName: "Make", width: 110 },
      { field: "model", headerName: "Model", width: 130 },
      {
        field: "current_soc",
        headerName: "Battery (SOC)",
        width: 160,
        renderCell: (p) => {
          if (p.value == null) return "—";
          const pct = Math.round(p.value);
          const color = pct > 60 ? "#3CAD6E" : pct > 30 ? "#F5A623" : "#D93025";
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color, minWidth: 36 }}>{pct}%</Typography>
              <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "#eee", overflow: "hidden" }}>
                <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: color, borderRadius: 3,
                  transition: "width 0.5s ease-in-out" }} />
              </Box>
            </Box>
          );
        },
      },
      {
        field: "charging_status",
        headerName: "Status",
        width: 140,
        renderCell: (p) => <StatusChip status={p.value} />,
      },
      {
        field: "current_power_kw",
        headerName: "Power",
        width: 100,
        valueFormatter: (value) => (value != null ? `${value} kW` : "—"),
      },
      {
        field: "tenant_id",
        headerName: "Tenant",
        width: 175,
        valueGetter: (value) => tenantMap[value] || `Tenant ${value}`,
      },
      {
        field: "status",
        headerName: "Enrollment",
        width: 120,
        renderCell: (p) => (
          <Chip size="small" label={p.value}
            sx={{
              bgcolor: p.value === "enrolled" ? "#E6F5EE" : "#EEF1F5",
              color: p.value === "enrolled" ? "#2E8A57" : "#546E7A",
              fontWeight: 600, textTransform: "capitalize",
            }} />
        ),
      },
    ],
    [tenantMap]
  );

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h4">EV Fleet</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Tooltip title={connected ? "Live SOC updates via WebSocket" : "Reconnecting…"}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, cursor: "default" }}>
              {connected
                ? <WifiIcon sx={{ fontSize: 15, color: "#3CAD6E" }} />
                : <WifiOffIcon sx={{ fontSize: 15, color: "#aaa" }} />}
              <Typography variant="caption" sx={{ color: connected ? "#3CAD6E" : "text.secondary", fontWeight: 600 }}>
                {connected ? "Live" : "…"}
              </Typography>
            </Box>
          </Tooltip>
          {lastUpdated && <Typography variant="caption" color="text.secondary">{updatedLabel}</Typography>}
          <Tooltip title="Refresh now">
            <IconButton size="small" onClick={refresh} disabled={refreshing}
              sx={{ border: "1px solid", borderColor: "divider" }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enrolled electric vehicles. Battery bars update in real time via WebSocket. Click a row for full telemetry history.
      </Typography>

      <Paper sx={{ p: 2, mb: 2, borderRadius: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField size="small" placeholder="Search VIN, make, or model" value={search}
          onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 260 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><SearchOutlinedIcon fontSize="small" /></InputAdornment>,
          }} />
        <TextField select size="small" label="Charging status" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 165 }}>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Tenant" value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="all">All tenants</MenuItem>
          {tenants.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          {rows.length} device{rows.length !== 1 ? "s" : ""}
        </Typography>
      </Paper>

      <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
        <DataGrid
          autoHeight rows={rows} columns={columns}
          loading={refreshing && devices.length === 0}
          getRowId={(row) => row.id}
          onRowClick={(params) => navigate(`/devices/${params.id}`)}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{
            border: "none", cursor: "pointer",
            "& .MuiDataGrid-row:hover": { bgcolor: "rgba(0,48,84,0.04)" },
            "& .MuiDataGrid-columnHeader": { bgcolor: "background.default", fontWeight: 700 },
          }}
        />
      </Paper>
    </Box>
  );
}
