import React from "react";
import { Chip } from "@mui/material";

const COLOR_MAP = {
  charging: { bg: "#E8F3EC", color: "#2E7D5B" },
  driving: { bg: "#EAF1FD", color: "#2A5CAA" },
  idle: { bg: "#F1F0EA", color: "#5B6B68" },
  unplugged: { bg: "#F6ECE9", color: "#A14A3A" },
  completed: { bg: "#EDE7F6", color: "#5E4B9E" },
  pending: { bg: "#FDF2E3", color: "#B96A16" },
  accepted: { bg: "#E8F3EC", color: "#2E7D5B" },
  rejected: { bg: "#FBEAEA", color: "#B3261E" },
  expired: { bg: "#F1F0EA", color: "#5B6B68" },
  scheduled: { bg: "#EAF1FD", color: "#2A5CAA" },
  active: { bg: "#FDF2E3", color: "#B96A16" },
  cancelled: { bg: "#FBEAEA", color: "#B3261E" },
  on_peak: { bg: "#FBEAEA", color: "#B3261E" },
  mid_peak: { bg: "#FDF2E3", color: "#B96A16" },
  off_peak: { bg: "#E8F3EC", color: "#2E7D5B" },
};

export default function StatusChip({ status }) {
  const key = (status || "").toLowerCase();
  const style = COLOR_MAP[key] || { bg: "#F1F0EA", color: "#5B6B68" };
  return (
    <Chip
      size="small"
      label={(status || "unknown").replace(/_/g, " ")}
      sx={{ bgcolor: style.bg, color: style.color, textTransform: "capitalize" }}
    />
  );
}
