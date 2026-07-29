import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Slider,
  Typography,
} from "@mui/material";
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TariffAPI, TenantAPI } from "../api/client";
import { uplightColors } from "../theme";

// ── Colour map per tariff period ───────────────────────────────────────────
const PERIOD_META = {
  on_peak:       { bg: "#fff0ee", stroke: uplightColors.red,   label: "On-peak" },
  mid_peak:      { bg: "#fff8ec", stroke: uplightColors.amber, label: "Mid-peak" },
  off_peak:      { bg: "#f3f7ff", stroke: uplightColors.blue,  label: "Off-peak" },
  super_off_peak:{ bg: "#eff8f2", stroke: uplightColors.green, label: "Super off-peak" },
};

function fmtHour(h) {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

/** Merge consecutive same-period windows into a single [start, end) span. */
function groupPeriods(windows) {
  const groups = [];
  let cur = null;
  for (const w of windows) {
    if (!cur || cur.period !== w.period) {
      if (cur) groups.push(cur);
      cur = { ...w, endHour: w.hour + 1 };
    } else {
      cur.endHour = w.hour + 1;
    }
  }
  if (cur) groups.push(cur);
  return groups;
}

// ── Custom tooltip ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const load = payload.find((p) => p.dataKey === "load_kw");
  const rate = payload.find((p) => p.dataKey === "rate");
  const period = payload[0]?.payload?.period ?? "—";
  return (
    <Paper sx={{ p: 1.5, borderRadius: 1.5, fontSize: 13 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {fmtHour(label)}
      </Typography>
      <Box sx={{ color: "text.secondary" }}>{PERIOD_META[period]?.label ?? period}</Box>
      {load && <Box sx={{ color: uplightColors.blue }}>Load: {load.value} kW</Box>}
      {rate && <Box sx={{ color: uplightColors.amber }}>Rate: ${rate.value?.toFixed(3)}/kWh</Box>}
    </Paper>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function TariffCalendar() {
  const [tenants, setTenants] = useState([]);
  const [tenantId, setTenantId] = useState("");
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drWindow, setDrWindow] = useState([22, 6]); // default: 10 PM – 6 AM (cheap overnight)

  // Load tenant list once
  useEffect(() => {
    TenantAPI.list().then((r) => {
      setTenants(r.data);
      if (r.data.length) setTenantId(r.data[0].id);
    });
  }, []);

  // Load calendar whenever tenant changes
  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    setCalendar(null);
    TariffAPI.calendar(tenantId)
      .then((r) => setCalendar(r.data))
      .catch(() => setError("No active tariff configured for this tenant. Add one via POST /api/tariffs."))
      .finally(() => setLoading(false));
  }, [tenantId]);

  // What-if cost saving calculation
  const whatIf = useMemo(() => {
    if (!calendar) return null;
    const [s, e] = drWindow;
    // Handle window that wraps midnight (e.g. 22 → 6)
    const hours =
      s < e
        ? calendar.windows.slice(s, e)
        : [...calendar.windows.slice(s), ...calendar.windows.slice(0, e)];
    if (!hours.length) return null;

    const totalLoad = hours.reduce((a, w) => a + (w.load_kw ?? 0), 0);
    const avgRate = hours.reduce((a, w) => a + (w.rate ?? 0), 0) / hours.length;
    const cheapest = Math.min(...Object.values(calendar.rates ?? {}).filter(Boolean));
    const savings = Math.max((avgRate - cheapest) * totalLoad, 0);
    const incentive = (calendar.incentive_per_kwh ?? 0) * totalLoad;

    return {
      hours: hours.length,
      totalLoad: totalLoad.toFixed(1),
      avgRate: avgRate.toFixed(3),
      savings: savings.toFixed(2),
      incentive: incentive.toFixed(2),
      total: (savings + incentive).toFixed(2),
    };
  }, [calendar, drWindow]);

  const groups = calendar ? groupPeriods(calendar.windows) : [];
  const nowHour = calendar?.current_hour ?? new Date().getHours();

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Tariff Calendar
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        24-hour time-of-use pricing windows, fleet load forecast, and DR cost-saving opportunities.
      </Typography>

      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <Box sx={{ display: "flex", gap: 2, mb: 3, alignItems: "center", flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 230 }}>
          <InputLabel>Tenant</InputLabel>
          <Select value={tenantId} label="Tenant" onChange={(e) => setTenantId(e.target.value)}>
            {tenants.map((t) => (
              <MenuItem key={t.id} value={t.id}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {calendar && (
          <>
            <Chip label={calendar.tariff_name} variant="outlined" />
            <Chip label={`${calendar.num_devices} EVs`} variant="outlined" />
            <Chip
              label={`Now: ${PERIOD_META[calendar.windows?.[nowHour]?.period]?.label ?? "—"}`}
              sx={{
                borderColor: PERIOD_META[calendar.windows?.[nowHour]?.period]?.stroke,
                color: PERIOD_META[calendar.windows?.[nowHour]?.period]?.stroke,
              }}
              variant="outlined"
            />
          </>
        )}
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
          {error}
        </Alert>
      )}

      {/* ── Main ComposedChart ─────────────────────────────────────────────── */}
      <Paper sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.25 }}>
          Fleet load vs. tariff — today
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Coloured bands = TOU periods · Blue area = projected fleet load · Amber line = $/kWh
          rate · Dashed line = now
        </Typography>

        <Box sx={{ mt: 2.5, height: 340 }}>
          {loading ? (
            <Skeleton variant="rectangular" height={340} sx={{ borderRadius: 1 }} />
          ) : calendar ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={calendar.windows}
                margin={{ top: 8, right: 50, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e8ecf0" />
                <XAxis
                  dataKey="hour"
                  type="number"
                  domain={[0, 23]}
                  ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
                  tickFormatter={fmtHour}
                />
                <YAxis
                  yAxisId="load"
                  orientation="left"
                  unit=" kW"
                  width={64}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}¢`}
                  width={48}
                  tick={{ fontSize: 12 }}
                />

                {/* Tariff period backgrounds */}
                {groups.map((g, i) => (
                  <ReferenceArea
                    key={i}
                    yAxisId="load"
                    x1={g.hour}
                    x2={g.endHour - 1}
                    fill={PERIOD_META[g.period]?.bg ?? "#f5f5f5"}
                    fillOpacity={1}
                  />
                ))}

                {/* What-if DR window overlay */}
                {drWindow[0] < drWindow[1] && (
                  <ReferenceArea
                    yAxisId="load"
                    x1={drWindow[0]}
                    x2={drWindow[1] - 1}
                    fill={uplightColors.navy}
                    fillOpacity={0.10}
                    stroke={uplightColors.navy}
                    strokeDasharray="4 3"
                  />
                )}

                {/* Current-hour marker */}
                <ReferenceLine
                  yAxisId="load"
                  x={nowHour}
                  stroke={uplightColors.amber}
                  strokeDasharray="6 3"
                  strokeWidth={2}
                  label={{ value: "Now", position: "insideTopRight", fill: uplightColors.amber, fontSize: 11 }}
                />

                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(v) =>
                    v === "load_kw" ? "Fleet load (kW)" : "Rate ($/kWh)"
                  }
                />

                <Area
                  yAxisId="load"
                  type="monotone"
                  dataKey="load_kw"
                  fill={uplightColors.blue}
                  stroke={uplightColors.blue}
                  fillOpacity={0.20}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="rate"
                  type="stepAfter"
                  dataKey="rate"
                  stroke={uplightColors.amber}
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : null}
        </Box>
      </Paper>

      <Grid container spacing={2.5}>
        {/* ── What-if panel ─────────────────────────────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 2, height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              What-if: shift charging window
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
              Drag to select the hours you'd shift fleet charging into. The panel shows estimated
              cost savings vs. the current schedule.
            </Typography>

            <Typography variant="caption" color="text.secondary">
              DR window:{" "}
              <strong>
                {fmtHour(drWindow[0])} – {fmtHour(drWindow[1])}
              </strong>{" "}
              ({Math.abs(drWindow[1] - drWindow[0])} h)
            </Typography>
            <Slider
              value={drWindow}
              onChange={(_, v) => setDrWindow(v)}
              min={0}
              max={24}
              step={1}
              sx={{ color: uplightColors.navy, mt: 1, mb: 3 }}
              valueLabelDisplay="auto"
              valueLabelFormat={fmtHour}
            />

            {whatIf ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                {[
                  { label: "Hours selected",              value: `${whatIf.hours} h`,           color: "text.secondary" },
                  { label: "Projected load in window",    value: `${whatIf.totalLoad} kW`,      color: uplightColors.blue },
                  { label: "Avg rate in window",          value: `$${whatIf.avgRate}/kWh`,      color: uplightColors.amber },
                  { label: "Cost savings vs. cheapest",   value: `$${whatIf.savings}`,          color: uplightColors.green },
                  { label: "DR incentive earned",         value: `$${whatIf.incentive}`,        color: uplightColors.navy },
                ].map((row) => (
                  <Box key={row.label} sx={{ display: "flex", justifyContent: "space-between" }}>
                    <Typography variant="body2" color="text.secondary">
                      {row.label}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: row.color }}>
                      {row.value}
                    </Typography>
                  </Box>
                ))}
                <Box
                  sx={{
                    mt: 1,
                    pt: 1.5,
                    borderTop: "1px solid",
                    borderColor: "divider",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    Total benefit
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 800, color: uplightColors.green }}
                  >
                    ${whatIf.total}
                  </Typography>
                </Box>
              </Box>
            ) : (
              !loading && (
                <Typography variant="body2" color="text.secondary">
                  Select a tenant with a configured tariff to see savings estimates.
                </Typography>
              )
            )}
          </Paper>
        </Grid>

        {/* ── Rate schedule legend ───────────────────────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2.5, borderRadius: 2, height: "100%" }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Rate schedule
            </Typography>

            {loading ? (
              [1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={52} sx={{ mb: 0.75, borderRadius: 1 }} />
              ))
            ) : calendar ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                {Object.entries(PERIOD_META).map(([key, meta]) => {
                  const rate = calendar.rates?.[key];
                  return (
                    <Box
                      key={key}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        p: 1.5,
                        borderRadius: 1.5,
                        background: meta.bg,
                        border: `1.5px solid ${meta.stroke}33`,
                      }}
                    >
                      <Box
                        sx={{
                          width: 11,
                          height: 11,
                          borderRadius: "50%",
                          background: meta.stroke,
                          flexShrink: 0,
                        }}
                      />
                      <Typography variant="body2" sx={{ flex: 1 }}>
                        {meta.label}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, color: meta.stroke }}
                      >
                        {rate != null && rate > 0 ? `$${rate.toFixed(3)}/kWh` : "—"}
                      </Typography>
                    </Box>
                  );
                })}

                {calendar.incentive_per_kwh != null && calendar.incentive_per_kwh > 0 && (
                  <Alert severity="success" sx={{ mt: 0.5, borderRadius: 1.5, py: 0.5 }}>
                    DR incentive:{" "}
                    <strong>${calendar.incentive_per_kwh}/kWh</strong> for load shifted during
                    events
                  </Alert>
                )}
                {calendar.max_event_duration_minutes && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                    Max event duration: {calendar.max_event_duration_minutes} min
                  </Typography>
                )}
              </Box>
            ) : null}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
