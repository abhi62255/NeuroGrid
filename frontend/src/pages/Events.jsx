import React, { useCallback, useEffect, useState } from "react";
import {
  Box, Typography, Paper, TextField, MenuItem, Chip,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, Button, Alert, Snackbar, Divider, Grid
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import { DataGrid } from "@mui/x-data-grid";
import { EventAPI, TenantAPI } from "../api/client";
import { useAutoRefresh, useRelativeTime } from "../hooks/useAutoRefresh";
import { fmtUtcDateTime, fmtUtcShort } from "../utils/time";
import StatusChip from "../components/StatusChip";

const STATUS_OPTIONS = ["all", "scheduled", "active", "completed", "cancelled"];

const EVENT_TYPE_LABELS = {
  stop_charging: "Curtailment",
  start_charging: "Smart Charge",
  reduce_power: "Reduce Power",
};

function DetailRow({ label, value }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.75,
      borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" } }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 180 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, textAlign: "right" }}>{value ?? "—"}</Typography>
    </Box>
  );
}

export default function Events() {
  const [events, setEvents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);   // event to confirm-cancel
  const [detailEvent, setDetailEvent] = useState(null);     // event to show in detail dialog

  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));

  useEffect(() => {
    TenantAPI.list().then((r) => setTenants(r.data)).catch(() => {});
  }, []);

  const fetchEvents = useCallback(async () => {
    const params = {};
    if (tenantFilter !== "all") params.tenant_id = tenantFilter;
    if (statusFilter !== "all") params.status = statusFilter;
    const r = await EventAPI.list(params);
    setEvents(r.data);
  }, [tenantFilter, statusFilter]);

  const { lastUpdated, refreshing, refresh } = useAutoRefresh(fetchEvents, 30_000);
  const updatedLabel = useRelativeTime(lastUpdated);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await EventAPI.cancel(cancelTarget.event_id);
      setToast({ severity: "success", msg: `Event #${cancelTarget.event_id} cancelled.` });
      refresh();
    } catch (err) {
      setToast({ severity: "error", msg: err?.response?.data?.detail ?? "Cancel failed" });
    }
    setCancelTarget(null);
  };

  const columns = [
    {
      field: "event_id", headerName: "ID", width: 65,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>#{p.value}</Typography>
      ),
    },
    {
      field: "event_type", headerName: "Type", width: 140,
      valueGetter: (value) => EVENT_TYPE_LABELS[value] ?? value,
    },
    {
      field: "event_status", headerName: "Status", width: 125,
      renderCell: (p) => <StatusChip status={p.value} />,
    },
    {
      field: "tenant_id", headerName: "Tenant", width: 180,
      valueGetter: (value) => tenantMap[value] || `Tenant ${value}`,
    },
    {
      field: "trigger_source", headerName: "Trigger", width: 85,
      renderCell: (p) => (
        <Chip size="small" label={p.value}
          sx={{ bgcolor: p.value === "ai" ? "#E8F0FE" : "#EEF1F5",
                color: p.value === "ai" ? "#0073A8" : "#546E7A", fontWeight: 600 }} />
      ),
    },
    {
      field: "start_time", headerName: "Start (UTC)", width: 165,
      valueFormatter: (value) => fmtUtcShort(value),
    },
    {
      field: "end_time", headerName: "End (UTC)", width: 165,
      valueFormatter: (value) => fmtUtcShort(value),
    },
    {
      field: "actions", headerName: "", width: 60, sortable: false,
      renderCell: (params) => {
        const { event_status } = params.row;
        const cancellable = ["scheduled", "active"].includes(event_status);
        if (!cancellable) return null;
        return (
          <Tooltip title="Cancel event">
            <IconButton size="small" color="error"
              onClick={(e) => { e.stopPropagation(); setCancelTarget(params.row); }}>
              <CancelOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      },
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h4">Demand Response Events</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
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
        Status transitions happen automatically based on UTC time. Click any row for details.
      </Typography>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label="Tenant" value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="all">All tenants</MenuItem>
          {tenants.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Status" value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 150 }}>
          {STATUS_OPTIONS.map((s) => (
            <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          {events.length} event{events.length !== 1 ? "s" : ""}
        </Typography>
      </Paper>

      {/* Grid */}
      <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
        <DataGrid
          autoHeight rows={events} columns={columns}
          loading={refreshing && events.length === 0}
          getRowId={(row) => row.event_id}
          onRowClick={(params) => setDetailEvent(params.row)}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{
            border: "none", cursor: "pointer",
            "& .MuiDataGrid-row:hover": { bgcolor: "rgba(0,48,84,0.04)" },
            "& .MuiDataGrid-columnHeader": { bgcolor: "background.default", fontWeight: 700 },
          }}
        />
      </Paper>

      {/* ── Event Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={!!detailEvent} onClose={() => setDetailEvent(null)} maxWidth="sm" fullWidth>
        {detailEvent && (
          <>
            <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5, pb: 1 }}>
              <BoltOutlinedIcon sx={{ color: "#0073A8" }} />
              Event #{detailEvent.event_id}
              <Box sx={{ ml: "auto" }}><StatusChip status={detailEvent.event_status} /></Box>
            </DialogTitle>
            <Divider />
            <DialogContent sx={{ pt: 2 }}>
              <DetailRow label="Type"          value={EVENT_TYPE_LABELS[detailEvent.event_type] ?? detailEvent.event_type} />
              <DetailRow label="Tenant"        value={tenantMap[detailEvent.tenant_id] || `Tenant ${detailEvent.tenant_id}`} />
              <DetailRow label="Trigger"       value={detailEvent.trigger_source?.toUpperCase()} />
              <DetailRow label="Start (UTC)"   value={fmtUtcDateTime(detailEvent.start_time)} />
              <DetailRow label="End (UTC)"     value={fmtUtcDateTime(detailEvent.end_time)} />
              <DetailRow label="Created (UTC)" value={fmtUtcDateTime(detailEvent.created_at)} />
              <DetailRow label="From recommendation" value={detailEvent.created_from_recommendation
                ? `#${detailEvent.created_from_recommendation}` : "Manual"} />
              <DetailRow label="Created by"   value={detailEvent.created_by ?? "system"} />

              {detailEvent.event_status === "active" && (
                <Alert severity="success" sx={{ mt: 2, borderRadius: 1.5 }}>
                  This event is currently live. Targeted devices should be {
                    detailEvent.event_type === "stop_charging" ? "curtailing charge." : "smart-charging."
                  }
                </Alert>
              )}
              {detailEvent.event_status === "scheduled" && (
                <Alert severity="info" sx={{ mt: 2, borderRadius: 1.5 }}>
                  Scheduled — will auto-activate at {fmtUtcDateTime(detailEvent.start_time)}.
                </Alert>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
              {["scheduled", "active"].includes(detailEvent.event_status) && (
                <Button variant="outlined" color="error" startIcon={<CancelOutlinedIcon />}
                  onClick={() => { setCancelTarget(detailEvent); setDetailEvent(null); }}>
                  Cancel event
                </Button>
              )}
              <Button onClick={() => setDetailEvent(null)} sx={{ ml: "auto" }}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Cancel Confirm ───────────────────────────────────────────────── */}
      <Dialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} maxWidth="xs">
        {cancelTarget && (
          <>
            <DialogTitle>Cancel event #{cancelTarget.event_id}?</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                This will stop the event immediately. Devices will return to their normal charging behaviour.
              </Typography>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCancelTarget(null)}>Back</Button>
              <Button variant="contained" color="error" onClick={handleCancel}>Confirm cancel</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Toast */}
      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast && (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: "100%" }}>
            {toast.msg}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
