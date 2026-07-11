import React, { useEffect, useMemo, useState } from "react";
import { Box, Typography, TextField, MenuItem, Paper, InputAdornment, Chip } from "@mui/material";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { DataGrid } from "@mui/x-data-grid";
import { useNavigate } from "react-router-dom";
import { DeviceAPI, TenantAPI } from "../api/client";
import StatusChip from "../components/StatusChip";

const STATUS_OPTIONS = ["all", "charging", "driving", "idle", "unplugged", "completed"];

export default function DeviceList() {
  const [devices, setDevices] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));

  useEffect(() => {
    TenantAPI.list()
      .then((r) => setTenants(r.data))
      .catch(() => {});
  }, []);

  const fetchDevices = () => {
    setLoading(true);
    DeviceAPI.list({
      search: search || undefined,
      charging_status: statusFilter !== "all" ? statusFilter : undefined,
      tenant_id: tenantFilter !== "all" ? tenantFilter : undefined,
    })
      .then((r) => setDevices(r.data))
      .catch(() => setDevices([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const t = setTimeout(fetchDevices, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, tenantFilter]);

  const columns = useMemo(
    () => [
      {
        field: "id",
        headerName: "Device ID",
        width: 95,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>
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
        width: 130,
        renderCell: (p) => {
          if (p.value == null) return "—";
          const pct = Math.round(p.value);
          const color = pct > 60 ? "#2E7D5B" : pct > 30 ? "#B96A16" : "#B3261E";
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600, color, minWidth: 36 }}>
                {pct}%
              </Typography>
              <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "#eee", overflow: "hidden" }}>
                <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: color, borderRadius: 3 }} />
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
          <Chip
            size="small"
            label={p.value}
            sx={{
              bgcolor: p.value === "enrolled" ? "#E8F3EC" : "#F1F0EA",
              color: p.value === "enrolled" ? "#2E7D5B" : "#5B6B68",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          />
        ),
      },
    ],
    [tenantMap]
  );

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        EV Fleet
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Enrolled electric vehicles across all tenants. Click a row for live telemetry and history.
      </Typography>

      <Paper sx={{ p: 2, mb: 2, borderRadius: 3, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField
          size="small"
          placeholder="Search VIN, make, or model"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 260 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlinedIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          label="Charging status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          sx={{ minWidth: 165 }}
        >
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Tenant"
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">All tenants</MenuItem>
          {tenants.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          {devices.length} device{devices.length !== 1 ? "s" : ""}
        </Typography>
      </Paper>

      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        <DataGrid
          autoHeight
          rows={devices}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.id}
          onRowClick={(params) => navigate(`/devices/${params.id}`)}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{
            border: "none",
            cursor: "pointer",
            "& .MuiDataGrid-row:hover": { bgcolor: "rgba(14,76,73,0.04)" },
            "& .MuiDataGrid-columnHeader": { bgcolor: "background.default", fontWeight: 700 },
          }}
        />
      </Paper>
    </Box>
  );
}
