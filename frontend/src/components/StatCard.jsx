import React from "react";
import { Paper, Typography, Box } from "@mui/material";

export default function StatCard({ label, value, accent, icon }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 3,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        borderTop: `3px solid ${accent || "#0B2E2C"}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        {icon}
      </Box>
      <Typography variant="h3" sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 34 }}>
        {value}
      </Typography>
    </Paper>
  );
}
