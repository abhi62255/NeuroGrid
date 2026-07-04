import React, { useEffect, useState } from "react";
import { Grid, Typography, Paper, Box, Alert } from "@mui/material";
import ApartmentOutlinedIcon from "@mui/icons-material/ApartmentOutlined";
import EvStationOutlinedIcon from "@mui/icons-material/EvStationOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import CampaignOutlinedIcon from "@mui/icons-material/CampaignOutlined";
import FlashOnOutlinedIcon from "@mui/icons-material/FlashOnOutlined";
import { DashboardAPI, RecommendationAPI, EventAPI } from "../api/client";
import StatCard from "../components/StatCard";
import StatusChip from "../components/StatusChip";
import { gridColors } from "../theme";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [recentRecs, setRecentRecs] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    DashboardAPI.summary().then((r) => setSummary(r.data)).catch(() => setError("Could not reach the backend API."));
    RecommendationAPI.list({ limit: 5 }).then((r) => setRecentRecs(r.data.slice(0, 5))).catch(() => {});
    EventAPI.list({ limit: 5 }).then((r) => setRecentEvents(r.data.slice(0, 5))).catch(() => {});
  }, []);

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Fleet overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Live status across every tenant, device, and AI-generated Demand Response recommendation.
      </Typography>

      {error && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error} Start the FastAPI backend at the URL configured in REACT_APP_API_BASE_URL.
        </Alert>
      )}

      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard label="Tenants" value={summary?.total_tenants ?? "–"} accent={gridColors.ink} icon={<ApartmentOutlinedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard label="Total EVs" value={summary?.total_evs ?? "–"} accent={gridColors.slate} icon={<EvStationOutlinedIcon />} />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            label="Charging now"
            value={summary?.active_charging_evs ?? "–"}
            accent={gridColors.green}
            icon={<BoltOutlinedIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            label="Pending recommendations"
            value={summary?.recommended_events ?? "–"}
            accent={gridColors.amber}
            icon={<CampaignOutlinedIcon />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <StatCard
            label="Active DR events"
            value={summary?.active_events ?? "–"}
            accent={gridColors.amberDeep}
            icon={<FlashOnOutlinedIcon />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Latest recommendations
            </Typography>
            {recentRecs.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No recommendations yet. The AI engine runs on a schedule, or trigger one from the
                Recommendations page.
              </Typography>
            )}
            {recentRecs.map((r) => (
              <Box
                key={r.recommendation_id}
                sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 1.2, borderBottom: "1px solid", borderColor: "divider" }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    #{r.recommendation_id} · {r.predicted_load_reduction_kw ? `${r.predicted_load_reduction_kw} kW` : "—"}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Confidence {r.confidence_score != null ? `${Math.round(r.confidence_score * 100)}%` : "—"}
                  </Typography>
                </Box>
                <StatusChip status={r.recommendation_status} />
              </Box>
            ))}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Latest DR events
            </Typography>
            {recentEvents.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No events created yet.
              </Typography>
            )}
            {recentEvents.map((e) => (
              <Box
                key={e.event_id}
                sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", py: 1.2, borderBottom: "1px solid", borderColor: "divider" }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    #{e.event_id} · {new Date(e.start_time).toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Trigger: {e.trigger_source}
                  </Typography>
                </Box>
                <StatusChip status={e.event_status} />
              </Box>
            ))}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
