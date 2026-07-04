import React, { useEffect, useState, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Snackbar,
  Alert,
  MenuItem,
  TextField,
  Chip,
  Stack,
  LinearProgress,
  Tooltip,
  IconButton,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import DevicesIcon from "@mui/icons-material/Devices";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import MonetizationOnOutlinedIcon from "@mui/icons-material/MonetizationOnOutlined";
import ElectricBoltIcon from "@mui/icons-material/ElectricBolt";
import PsychologyAltOutlinedIcon from "@mui/icons-material/PsychologyAltOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import { RecommendationAPI, TenantAPI } from "../api/client";
import StatusChip from "../components/StatusChip";
import { gridColors } from "../theme";

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt = (val, suffix = "") =>
  val != null ? `${typeof val === "number" ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : val}${suffix}` : "—";

const fmtDate = (dt) =>
  dt ? new Date(dt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtTime = (dt) =>
  dt ? new Date(dt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";

// ── MetricBlock ───────────────────────────────────────────────────────────────
function MetricBlock({ icon, label, value, accent }) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 130,
        p: 1.5,
        borderRadius: 2,
        bgcolor: "background.default",
        border: "1px solid",
        borderColor: "divider",
        borderTop: `3px solid ${accent || gridColors.slate}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
        <Box sx={{ color: accent || gridColors.slate, display: "flex" }}>{icon}</Box>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>
      <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace' }}>
        {value}
      </Typography>
    </Box>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Recommendations() {
  const [rows, setRows] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [tenantFilter, setTenantFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [snackbar, setSnackbar] = useState(null);
  const [generating, setGenerating] = useState(false);

  // tenant id → name map
  const tenantMap = Object.fromEntries(tenants.map((t) => [t.id, t.name]));

  const load = useCallback(() => {
    setLoading(true);
    const params = tenantFilter !== "all" ? { tenant_id: tenantFilter } : {};
    RecommendationAPI.list(params)
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [tenantFilter]);

  useEffect(() => {
    TenantAPI.list()
      .then((r) => setTenants(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Open detail: fetch full recommendation with device_links
  const openDetail = async (row) => {
    setDetailLoading(true);
    setSelected(row); // show dialog immediately with list data
    try {
      const r = await RecommendationAPI.get(row.recommendation_id);
      setSelected(r.data);
    } catch {
      // keep list-level data if detail fetch fails
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDecision = async (id, action) => {
    try {
      if (action === "accept") await RecommendationAPI.accept(id);
      else await RecommendationAPI.reject(id);
      setSnackbar({
        severity: "success",
        message: `Recommendation #${id} ${action === "accept" ? "accepted — DR event created!" : "rejected."}`,
      });
      setSelected(null);
      load();
    } catch {
      setSnackbar({ severity: "error", message: "Could not update the recommendation." });
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const tenantId = tenantFilter !== "all" ? tenantFilter : 1;
    try {
      await RecommendationAPI.generate(tenantId);
      setSnackbar({ severity: "success", message: `AI engine triggered for ${tenantMap[tenantId] || `Tenant ${tenantId}`}.` });
      load();
    } catch {
      setSnackbar({ severity: "error", message: "Could not trigger the recommendation engine." });
    } finally {
      setGenerating(false);
    }
  };

  const columns = [
    {
      field: "recommendation_id",
      headerName: "ID",
      width: 70,
      renderCell: (p) => (
        <Typography variant="body2" sx={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>
          #{p.value}
        </Typography>
      ),
    },
    {
      field: "tenant_id",
      headerName: "Tenant",
      width: 180,
      valueGetter: (p) => tenantMap[p.value] || `Tenant ${p.value}`,
    },
    {
      field: "recommendation_time",
      headerName: "Generated",
      width: 170,
      valueFormatter: (p) => fmtDate(p.value),
    },
    {
      field: "confidence_score",
      headerName: "Confidence",
      width: 130,
      renderCell: (p) => {
        const pct = p.value != null ? Math.round(p.value * 100) : null;
        if (pct == null) return "—";
        const color = pct >= 80 ? gridColors.green : pct >= 60 ? gridColors.amber : "#B3261E";
        return (
          <Box sx={{ width: "100%", pr: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color }}>
              {pct}%
            </Typography>
            <LinearProgress
              variant="determinate"
              value={pct}
              sx={{ mt: 0.3, borderRadius: 1, height: 4, bgcolor: "#eee", "& .MuiLinearProgress-bar": { bgcolor: color } }}
            />
          </Box>
        );
      },
    },
    {
      field: "targeted_device_count",
      headerName: "Devices Targeted",
      width: 155,
      renderCell: (p) => (
        <Chip
          icon={<DevicesIcon sx={{ fontSize: 14 }} />}
          label={p.value != null ? `${p.value} devices` : "—"}
          size="small"
          sx={{ bgcolor: p.value ? "#EAF1FD" : "#f1f0ea", color: p.value ? "#2A5CAA" : gridColors.slate, fontWeight: 600 }}
        />
      ),
    },
    {
      field: "predicted_load_reduction_kw",
      headerName: "Load Reduction",
      width: 145,
      valueFormatter: (p) => fmt(p.value, " kW"),
    },
    {
      field: "recommendation_status",
      headerName: "Status",
      width: 130,
      renderCell: (p) => <StatusChip status={p.value} />,
    },
  ];

  return (
    <Box>
      {/* ── Header ── */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 3, flexWrap: "wrap", gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ mb: 0.5 }}>
            AI Recommendations
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Google Gemini-generated Demand Response recommendations. Click a row to review and accept or reject.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Refresh list">
            <IconButton onClick={load} size="small" sx={{ border: "1px solid", borderColor: "divider" }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<AutorenewIcon />}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? "Running Gemini…" : "Run AI engine now"}
          </Button>
        </Stack>
      </Box>

      {/* ── Tenant Filter ── */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 3, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <PsychologyAltOutlinedIcon sx={{ color: gridColors.slate }} />
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          Filter by tenant:
        </Typography>
        <TextField
          select
          size="small"
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="all">All tenants</MenuItem>
          {tenants.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.name}
            </MenuItem>
          ))}
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          {rows.length} recommendation{rows.length !== 1 ? "s" : ""}
        </Typography>
      </Paper>

      {/* ── Data Grid ── */}
      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        <DataGrid
          autoHeight
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.recommendation_id}
          onRowClick={(params) => openDetail(params.row)}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
          sx={{
            border: "none",
            cursor: "pointer",
            "& .MuiDataGrid-row:hover": { bgcolor: "rgba(14,76,73,0.04)" },
            "& .MuiDataGrid-columnHeader": { bgcolor: "background.default", fontWeight: 700 },
          }}
        />
      </Paper>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        {selected && (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <BoltOutlinedIcon sx={{ color: gridColors.amber }} />
                <Typography variant="h6">Recommendation #{selected.recommendation_id}</Typography>
                <Box sx={{ ml: "auto" }}>
                  <StatusChip status={selected.recommendation_status} />
                </Box>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {tenantMap[selected.tenant_id] || `Tenant ${selected.tenant_id}`} · Generated {fmtDate(selected.recommendation_time)}
              </Typography>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 2.5 }}>
              {detailLoading && <LinearProgress sx={{ mb: 2 }} />}

              {/* Metric blocks */}
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, mb: 2.5 }}>
                <MetricBlock
                  icon={<DevicesIcon fontSize="small" />}
                  label="Devices Targeted"
                  value={selected.targeted_device_count != null ? `${selected.targeted_device_count}` : selected.device_links ? `${selected.device_links.length}` : "—"}
                  accent={gridColors.slate}
                />
                <MetricBlock
                  icon={<ElectricBoltIcon fontSize="small" />}
                  label="Load Reduction"
                  value={fmt(selected.predicted_load_reduction_kw, " kW")}
                  accent="#2A5CAA"
                />
                <MetricBlock
                  icon={<BoltOutlinedIcon fontSize="small" />}
                  label="Energy Shifted"
                  value={fmt(selected.predicted_energy_shifted_kwh, " kWh")}
                  accent={gridColors.green}
                />
                <MetricBlock
                  icon={<MonetizationOnOutlinedIcon fontSize="small" />}
                  label="Utility Savings"
                  value={fmt(selected.estimated_utility_savings, " $")}
                  accent={gridColors.amberDeep}
                />
                <MetricBlock
                  icon={<MonetizationOnOutlinedIcon fontSize="small" />}
                  label="Customer Incentive"
                  value={fmt(selected.estimated_customer_incentive, " $")}
                  accent={gridColors.amber}
                />
              </Box>

              {/* Window + Confidence */}
              <Box sx={{ display: "flex", gap: 2, mb: 2.5, flexWrap: "wrap" }}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="overline" color="text.secondary">Event Window</Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.3 }}>
                    <AccessTimeIcon fontSize="small" sx={{ color: gridColors.amber }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selected.recommended_start
                        ? `${fmtDate(selected.recommended_start)} → ${fmtTime(selected.recommended_end)}`
                        : "—"}
                    </Typography>
                  </Box>
                </Box>
                <Box>
                  <Typography variant="overline" color="text.secondary">Confidence</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: '"IBM Plex Mono", monospace', mt: 0.3 }}>
                    {selected.confidence_score != null ? `${Math.round(selected.confidence_score * 100)}%` : "—"}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              {/* AI Reasoning */}
              <Typography variant="overline" color="text.secondary">Gemini AI Reasoning</Typography>
              <Paper
                variant="outlined"
                sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: "background.default", borderColor: "divider" }}
              >
                <Typography variant="body2" sx={{ lineHeight: 1.7 }}>
                  {selected.reasoning || "No reasoning provided."}
                </Typography>
              </Paper>

              {/* Device list (if detail was loaded) */}
              {selected.device_links && selected.device_links.length > 0 && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Typography variant="overline" color="text.secondary">
                    Targeted Devices ({selected.device_links.length})
                  </Typography>
                  <Box sx={{ mt: 1, maxHeight: 150, overflowY: "auto" }}>
                    {selected.device_links.map((dl) => (
                      <Box
                        key={dl.device_id}
                        sx={{ display: "flex", justifyContent: "space-between", py: 0.5, borderBottom: "1px solid", borderColor: "divider" }}
                      >
                        <Typography variant="caption">Device #{dl.device_id}</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 600 }}>
                          {dl.expected_contribution_kw != null ? `${dl.expected_contribution_kw.toFixed(2)} kW` : "—"}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </>
              )}
            </DialogContent>

            <DialogActions sx={{ p: 2, gap: 1 }}>
              {selected.recommendation_status === "pending" ? (
                <>
                  <Button
                    startIcon={<HighlightOffIcon />}
                    color="inherit"
                    variant="outlined"
                    onClick={() => handleDecision(selected.recommendation_id, "reject")}
                    sx={{ borderColor: "divider" }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={<CheckCircleOutlineIcon />}
                    onClick={() => handleDecision(selected.recommendation_id, "accept")}
                  >
                    Accept &amp; create event
                  </Button>
                </>
              ) : (
                <Button onClick={() => setSelected(null)} variant="outlined" sx={{ borderColor: "divider" }}>
                  Close
                </Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={4500} onClose={() => setSnackbar(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {snackbar && (
          <Alert severity={snackbar.severity} variant="filled" onClose={() => setSnackbar(null)}>
            {snackbar.message}
          </Alert>
        )}
      </Snackbar>
    </Box>
  );
}
