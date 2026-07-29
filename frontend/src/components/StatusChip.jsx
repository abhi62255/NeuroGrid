import React from "react";
import { Chip } from "@mui/material";

const COLOR_MAP = {
  charging: { bg: "#E6F5EE", color: "#2E8A57" },
  driving:  { bg: "#E8F4FA", color: "#0073A8" },
  idle:     { bg: "#EEF1F5", color: "#546E7A" },
  unplugged:{ bg: "#FDECEA", color: "#C62828" },
  completed:{ bg: "#EDE7F6", color: "#5E35B1" },
  pending:  { bg: "#FEF3DC", color: "#D47E00" },
  accepted: { bg: "#E6F5EE", color: "#2E8A57" },
  rejected: { bg: "#FDECEA", color: "#C62828" },
  expired:  { bg: "#EEF1F5", color: "#546E7A" },
  scheduled:{ bg: "#E8F4FA", color: "#0073A8" },
  active:   { bg: "#FEF3DC", color: "#D47E00" },
  cancelled:{ bg: "#FDECEA", color: "#C62828" },
  on_peak:  { bg: "#FDECEA", color: "#C62828" },
  mid_peak: { bg: "#FEF3DC", color: "#D47E00" },
  off_peak: { bg: "#E6F5EE", color: "#2E8A57" },
  super_off_peak: { bg: "#E8F4FA", color: "#0073A8" },
};

export default function StatusChip({ status }) {
  const key = (status || "").toLowerCase();
  const style = COLOR_MAP[key] || { bg: "#EEF1F5", color: "#546E7A" };
  return (
    <Chip
      size="small"
      label={(status || "unknown").replace(/_/g, " ")}
      sx={{
        bgcolor: style.bg,
        color: style.color,
        textTransform: "capitalize",
        fontWeight: 600,
        fontSize: 12,
        height: 22,
        "& .MuiChip-label": { px: 1 },
      }}
    />
  );
}
