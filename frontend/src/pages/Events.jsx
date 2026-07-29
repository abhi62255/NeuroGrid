import React, { useCallback, useEffect, useState } from "react";
import {
  Box, Typography, Paper, TextField, MenuItem, Button, Chip,
  IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Alert, Snackbar
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import { DataGrid } from "@mui/x-data-grid";
import { EventAPI, TenantAPI } from "../api/client";
import { useAutoRefresh, useRelativeTime } from "../hooks/useAutoRefresh";
import { fmtUtcShort } from "../utils/time";
import StatusChip from "../components/StatusChip";

const STATUS_OPTIONS = ["all", "scheduled", "active", "completed", "cancelled"];

const EVENT_TYPE_LABELS = {
  start_charging: "Smart Charge",
  stop_charging: "Curtailment",
  reduce_power: "Reduce Power",
};

export default function Events() {
  const [events, setEvents] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

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

  const handleAction = async (action, event) => {
    try {
      if (action === "activate") await EventAPI.activate(event.event_id);
      else if (action === "complete") await EventAPI.complete(event.event_id);
      else if (action === "cancel") await EventAPI.cancel(event.event_id);
      setToast({ severity: "success", msg: `Event #${event.event_id} ${action}d.` });
      refresh();
    } catch (err) {
      const detail = err?.response?.data?.detail ?? "Action failed";
      setToast({ severity: "error", msg: detail });
    }
    setConfirmDialog(null);
  };

  const openConfirm = (action, event) => {
    setConfirmDialog({ action, event });
  };

  const columns = [
    {
      field: "event_id",
      headerName: "ID",
      width: 70,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: 600 }}>#{p.value}</Typography>
      ),
    },
    {
      field: "event_type",
      headerName: "Type",
      width: 145,
      valueGetter: (value) => EVENT_TYPE_LABELS[value] ?? value,
    },
    {
      field: "event_status",
      headerName: "Status",
      width: 130,
      renderCell: (p) => <StatusChip status={p.value} />,
    },
    {
      field: "tenant_id",
      headerName: "Tenant",
      width: 175,
      valueGetter: (value) => tenantMap[value] || `Tenant ${value}`,
    },
    {
      field: "trigger_source",
      headerName: "Trigger",
      width: 90,
      renderCell: (p) => (
        <Chip size="small" label={p.value}
          sx={{
            bgcolor: p.value === "ai" ? "#E8F0FE" : "#EEF1F5",
            color: p.value === "ai" ? "#0073A8" : "#546E7A",
            fontWeight: 600, textTransform: "capitalize",
          }} />
      ),
    },
    {
      field: "start_time",
      headerName: "Start",
      width: 165,
      valueFormatter: (value) => fmtUtcShort(value),
    },
    {
      field: "end_time",
      headerName: "End",
      width: 165,
      valueFormatter: (value) => fmtUtcShort(value),
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 130,
      sortable: false,
      renderCell: (params) => {
        const { event_status } = params.row;
        return (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {event_status === "scheduled" && (
              <Tooltip title="Activate">
                <IconButton size="small" color="success"
                  onClick={(e) => { e.stopPropagation(); openConfirm("activate", params.row); }}>
                  <PlayArrowIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {(event_status === "scheduled" || event_status === "active") && (
              <Tooltip title="Mark complete">
                <IconButton size="small" color="primary"
                  onClick={(e) => { e.stopPropagation(); openConfirm("complete", params.row); }}>
                  <CheckCircleOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {(event_status === "scheduled" || event_status === "active") && (
              <Tooltip title="Cancel">
                <IconButton size="small" color="error"
                  onClick={(e) => { e.stopPropagation(); openConfirm("cancel", params.row); }}>
                  <CancelOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        );
      },
    },
  ];

  return (
    <Box>
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
        Create, monitor, and manage Demand Response events across all utility tenants. Auto-refreshes every 30 s.
      </Typography>

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

      <Paper sx={{ borderRadius: 2, overflow: "hidden" }}>
        <DataGrid
          autoHeight
          rows={events}
          columns={columns}
          loading={refreshing && events.length === 0}
          getRowId={(row) => row.event_id}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{
            border: "none",
            "& .MuiDataGrid-row:hover": { bgcolor: "rgba(0,48,84,0.04)" },
            "& .MuiDataGrid-columnHeader": { bgcolor: "background.default", fontWeight: 700 },
          }}
        />
      </Paper>

      {/* Confirmation dialog */}
      <Dialog open={!!confirmDialog} onClose={() => setConfirmDialog(null)} maxWidth="xs">
        {confirmDialog && (
          <>
            <DialogTitle sx={{ textTransform: "capitalize" }}>
              {confirmDialog.action} event #{confirmDialog.event.event_id}?
            </DialogTitle>
            <DialogContent>
              <DialogContentText>
                {confirmDialog.action === "activate" && "Mark this event as Active. The DR window will begin immediately."}
                {confirmDialog.action === "complete" && "Mark this event as Completed. No further changes will be allowed."}
                {confirmDialog.action === "cancel" && "Cancel this event. This cannot be undone."}
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirmDialog(null)}>Back</Button>
              <Button variant="contained" color={confirmDialog.action === "cancel" ? "error" : "primary"}
                onClick={() => handleAction(confirmDialog.action, confirmDialog.event)}>
                {confirmDialog.action.charAt(0).toUpperCase() + confirmDialog.action.slice(1)}
              </Button>
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
