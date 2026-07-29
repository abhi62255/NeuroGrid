import React from "react";
import { Paper, Typography, Box } from "@mui/material";

export default function StatCard({ label, value, accent, icon }) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        borderLeft: `4px solid ${accent || "#0073A8"}`,
        border: "1px solid #DDE3EC",
        borderLeftWidth: 4,
        borderLeftColor: accent || "#0073A8",
        transition: "box-shadow 0.2s",
        "&:hover": { boxShadow: "0 4px 16px rgba(0,48,84,0.10)" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography variant="overline" sx={{ color: "text.secondary", fontSize: 11 }}>
          {label}
        </Typography>
        <Box sx={{ color: accent || "#0073A8", opacity: 0.8, display: "flex" }}>{icon}</Box>
      </Box>
      <Typography variant="h3" sx={{ fontWeight: 700, fontSize: 32, letterSpacing: "-0.02em", color: "text.primary" }}>
        {value}
      </Typography>
    </Paper>
  );
}
