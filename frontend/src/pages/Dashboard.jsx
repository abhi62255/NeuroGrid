import React, { useCallback, useState } from "react";
import { Grid, Typography, Paper, Box, Alert, Skeleton, Tooltip as MuiTooltip, IconButton } from "@mui/material";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import EvStationOutlinedIcon from "@mui/icons-material/EvStationOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import FlashOnOutlinedIcon from "@mui/icons-material/FlashOnOutlined";
import WifiIcon from "@mui/icons-material/Wifi";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import RefreshIcon from "@mui/icons-material/Refresh";
import { DashboardAPI, RecommendationAPI, EventAPI, TenantAPI } from "../api/client";
import { useTelemetrySocket } from "../hooks/useTelemetrySocket";
import { useAutoRefresh, useRelativeTime } from "../hooks/useAutoRefresh";
import { fmtUtcTime, fmtUtcShort } from "../utils/time";
import StatCard from "../components/StatCard";
import StatusChip from "../components/StatusChip";
import { uplightColors } from "../theme";

const CHARGING_COLOR = {
  charging: uplightColors.green,
  idle: uplightColors.blue,
  offline: "#aaa",
};

function LiveFeedRow({ record }) {
  const ts = record.timestamp ? fmtUtcTime(record.timestamp) : "—";
  const color = CHARGING_COLOR[record.charging_status] ?? "#aaa";
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        py: 0.75,
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:last-child": { borderBottom: "none" },
      }}
    >
      <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 68, fontSize: 12 }}>{ts}</Typography>
      <Typography variant="body2" sx={{ flex: 1, fontSize: 13 }}>
        Device <strong>{record.device_id}</strong> · <span style={{ color }}>{record.charging_status ?? "—"}</span>
      </Typography>
      <Typography variant="body2" sx={{ minWidth: 44, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
        {record.soc != null ? `${Math.round(record.soc)}%` : "—"}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 52, textAlign: "right", fontSize: 12 }}>
        {record.charging_power_kw != null ? `${record.charging_power_kw} kW` : "—"}
      </Typography>
    </Box>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [recentRecs, setRecentRecs] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [error, setError] = useState(null);
  const [firstTenantUid, setFirstTenantUid] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, recsRes, eventsRes, tenantsRes] = await Promise.all([
        DashboardAPI.summary(),
        RecommendationAPI.list({ limit: 5 }),
        EventAPI.list({ limit: 5 }),
        TenantAPI.list(),
      ]);
      setSummary(summaryRes.data);
      setRecentRecs(recsRes.data.slice(0, 5));
      setRecentEvents(eventsRes.data.slice(0, 5));
      if (tenantsRes.data.length) setFirstTenantUid(tenantsRes.data[0].tenant_uid);
      setError(null);
    } catch {
      setError("Could not reach the backend API.");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const { lastUpdated, refreshing, refresh } = useAutoRefresh(fetchAll, 30_000);
  const updatedLabel = useRelativeTime(lastUpdated);
  const { feed, connected } = useTelemetrySocket(firstTenantUid);

  const loading = initialLoading;

  const stats = [
    { label: "Tenants",                key: "total_tenants",       accent: uplightColors.navy,  icon: <ApartmentOutlinedIcon /> },
    { label: "Total EVs",              key: "total_evs",           accent: uplightColors.slate, icon: <EvStationOutlinedIcon /> },
    { label: "Charging now",           key: "active_charging_evs", accent: uplightColors.green, icon: <BoltOutlinedIcon /> },
    { label: "Pending recommendations",key: "recommended_events",  accent: uplightColors.amber, icon: <CampaignOutlinedIcon /> },
    { label: "Active DR events",       key: "active_events",       accent: uplightColors.blue,  icon: <FlashOnOutlinedIcon /> },
  ];

  return (
    <Box>
      {/* Header row with last-updated */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="h4">Fleet overview</Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {lastUpdated && (
            <Typography variant="caption" color="text.secondary">{updatedLabel}</Typography>
          )}
          <MuiTooltip title="Refresh now">
            <IconButton size="small" onClick={refresh} disabled={refreshing} sx={{ border: "1px solid", borderColor: "divider" }}>
              <RefreshIcon fontSize="small" sx={{ animation: refreshing ? "spin 1s linear infinite" : "none",
                "@keyframes spin": { "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } } }} />
            </IconButton>
          </MuiTooltip>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Live status across every tenant, device, and AI-generated Demand Response recommendation. Auto-refreshes every 30 s.
      </Typography>

      {error && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          {error} Make sure the FastAPI backend is running at <code>REACT_APP_API_BASE_URL</code>.
        </Alert>
      )}

      {/* Stat cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" },
          gap: 2.5,
          mb: 4,
        }}
      >
        {stats.map((s) =>
          loading ? (
            <Skeleton key={s.key} variant="rectangular" height={110} sx={{ borderRadius: 2 }} />
          ) : (
            <StatCard key={s.key} label={s.label} value={summary?.[s.key] ?? "–"} accent={s.accent} icon={s.icon} />
          )
        )}
      </Box>

      <Grid container spacing={2.5}>
        {/* Latest recommendations */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Latest recommendations</Typography>
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} height={48} sx={{ mb: 0.5, borderRadius: 1 }} />)
            ) : recentRecs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No recommendations yet. Trigger one from the Recommendations page.
              </Typography>
            ) : (
              recentRecs.map((r) => (
                <Box key={r.recommendation_id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 1.2, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" } }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      #{r.recommendation_id}{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        · {r.event_type === "start_charging" ? "Smart Charge" : "Curtailment"}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.predicted_load_reduction_kw != null
                        ? `${r.event_type === "start_charging" ? "+" : "−"}${Math.abs(r.predicted_load_reduction_kw).toFixed(1)} kW`
                        : "—"} · Confidence{" "}
                      {r.confidence_score != null ? `${Math.round(r.confidence_score * 100)}%` : "—"}
                    </Typography>
                  </Box>
                  <StatusChip status={r.recommendation_status} />
                </Box>
              ))
            )}
          </Paper>
        </Grid>

        {/* Latest DR events */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Latest DR events</Typography>
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} height={48} sx={{ mb: 0.5, borderRadius: 1 }} />)
            ) : recentEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No events created yet. Accept a recommendation to create one.</Typography>
            ) : (
              recentEvents.map((e) => (
                <Box key={e.event_id} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 1.2, borderBottom: "1px solid", borderColor: "divider", "&:last-child": { borderBottom: "none" } }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      #{e.event_id}{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        · {e.event_type === "start_charging" ? "Smart Charge" : "Curtailment"}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtUtcShort(e.start_time)} · {e.trigger_source}
                    </Typography>
                  </Box>
                  <StatusChip status={e.event_status} />
                </Box>
              ))
            )}
          </Paper>
        </Grid>

        {/* Live telemetry feed via WebSocket */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>Live telemetry feed</Typography>
              <MuiTooltip title={connected ? "WebSocket connected" : "Reconnecting…"}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, cursor: "default" }}>
                  {connected
                    ? <WifiIcon sx={{ fontSize: 16, color: uplightColors.green }} />
                    : <WifiOffIcon sx={{ fontSize: 16, color: "#aaa" }} />}
                  <Typography variant="caption" sx={{ color: connected ? uplightColors.green : "text.secondary", fontWeight: 600 }}>
                    {connected ? "Live" : "Connecting…"}
                  </Typography>
                </Box>
              </MuiTooltip>
            </Box>
            {feed.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {connected ? "Waiting for telemetry events…" : "Establishing WebSocket connection…"}
              </Typography>
            ) : (
              <Box sx={{ maxHeight: 260, overflowY: "auto" }}>
                {feed.map((rec, i) => <LiveFeedRow key={i} record={rec} />)}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
