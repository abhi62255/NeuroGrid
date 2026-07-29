import React, { useEffect, useState } from "react";
import { Grid, Typography, Paper, Box, Alert, Skeleton } from "@mui/material";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import EvStationOutlinedIcon from "@mui/icons-material/EvStationOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import FlashOnOutlinedIcon from "@mui/icons-material/FlashOnOutlined";
import { DashboardAPI, RecommendationAPI, EventAPI } from "../api/client";
import StatCard from "../components/StatCard";
import StatusChip from "../components/StatusChip";
import { uplightColors } from "../theme";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [recentRecs, setRecentRecs] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      DashboardAPI.summary().then((r) => setSummary(r.data)),
      RecommendationAPI.list({ limit: 5 }).then((r) => setRecentRecs(r.data.slice(0, 5))),
      EventAPI.list({ limit: 5 }).then((r) => setRecentEvents(r.data.slice(0, 5))),
    ])
      .catch(() => setError("Could not reach the backend API."))
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: "Tenants",               key: "total_tenants",       accent: uplightColors.navy,  icon: <ApartmentOutlinedIcon /> },
    { label: "Total EVs",             key: "total_evs",           accent: uplightColors.slate, icon: <EvStationOutlinedIcon /> },
    { label: "Charging now",          key: "active_charging_evs", accent: uplightColors.green, icon: <BoltOutlinedIcon /> },
    { label: "Pending recommendations", key: "recommended_events", accent: uplightColors.amber, icon: <CampaignOutlinedIcon /> },
    { label: "Active DR events",      key: "active_events",       accent: uplightColors.blue,  icon: <FlashOnOutlinedIcon /> },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Fleet overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Live status across every tenant, device, and AI-generated Demand Response recommendation.
      </Typography>

      {error && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          {error} Make sure the FastAPI backend is running at the URL in{" "}
          <code>REACT_APP_API_BASE_URL</code>.
        </Alert>
      )}

      {/* Stat cards — 5 equal columns using flexbox */}
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
            <StatCard
              key={s.key}
              label={s.label}
              value={summary?.[s.key] ?? "–"}
              accent={s.accent}
              icon={s.icon}
            />
          )
        )}
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Latest recommendations
            </Typography>
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} height={48} sx={{ mb: 0.5, borderRadius: 1 }} />)
            ) : recentRecs.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No recommendations yet. The AI engine runs on a schedule — or trigger one from the
                Recommendations page.
              </Typography>
            ) : (
              recentRecs.map((r) => (
                <Box
                  key={r.recommendation_id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    py: 1.2,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      #{r.recommendation_id}{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        · {r.event_type === "start_charging" ? "Smart Charge" : "Curtailment"}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {r.predicted_load_reduction_kw != null
                        ? `${r.predicted_load_reduction_kw} kW`
                        : "—"}{" "}
                      · Confidence{" "}
                      {r.confidence_score != null ? `${Math.round(r.confidence_score * 100)}%` : "—"}
                    </Typography>
                  </Box>
                  <StatusChip status={r.recommendation_status} />
                </Box>
              ))
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Latest DR events
            </Typography>
            {loading ? (
              [1, 2, 3].map((i) => <Skeleton key={i} height={48} sx={{ mb: 0.5, borderRadius: 1 }} />)
            ) : recentEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No events created yet. Accept a recommendation to create one.
              </Typography>
            ) : (
              recentEvents.map((e) => (
                <Box
                  key={e.event_id}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    py: 1.2,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    "&:last-child": { borderBottom: "none" },
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      #{e.event_id}{" "}
                      <Typography component="span" variant="body2" color="text.secondary">
                        · {e.event_type === "start_charging" ? "Smart Charge" : "Curtailment"}
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(e.start_time).toLocaleString()} · {e.trigger_source}
                    </Typography>
                  </Box>
                  <StatusChip status={e.event_status} />
                </Box>
              ))
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
