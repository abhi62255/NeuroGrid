import React, { useEffect, useState } from "react";
import { Box, Typography, Paper, Chip } from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import { EventAPI } from "../api/client";
import StatusChip from "../components/StatusChip";

export default function Events() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    EventAPI.list()
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { field: "event_id", headerName: "Event ID", width: 100 },
    {
      field: "event_type",
      headerName: "Event Type",
      width: 140,
      renderCell: (p) => (
        <Chip
          label={p.value === "start_charging" ? "Smart Charge" : "Curtailment"}
          size="small"
          color={p.value === "start_charging" ? "primary" : "secondary"}
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      ),
    },
    {
      field: "start_time",
      headerName: "Start Time",
      width: 190,
      valueFormatter: (value) => (value ? new Date(value).toLocaleString() : "—"),
    },
    {
      field: "end_time",
      headerName: "End Time",
      width: 190,
      valueFormatter: (value) => (value ? new Date(value).toLocaleString() : "—"),
    },
    {
      field: "event_status",
      headerName: "Status",
      width: 140,
      renderCell: (p) => <StatusChip status={p.value} />,
    },
    { field: "trigger_source", headerName: "Trigger Source", width: 150 },
    { field: "tenant_id", headerName: "Tenant", width: 100 },
  ];

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 0.5 }}>
        Demand Response events
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Every DR event created from an AI recommendation or manually by an operator.
      </Typography>

      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        <DataGrid
          autoHeight
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(row) => row.event_id}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          sx={{ border: "none" }}
        />
      </Paper>
    </Box>
  );
}
