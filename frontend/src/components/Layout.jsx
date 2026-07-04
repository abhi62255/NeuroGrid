import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  AppBar,
  Chip,
  Divider,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EvStationOutlinedIcon from "@mui/icons-material/EvStationOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import { gridColors } from "../theme";

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: <DashboardOutlinedIcon /> },
  { label: "Devices", path: "/devices", icon: <EvStationOutlinedIcon /> },
  { label: "Recommendations", path: "/recommendations", icon: <BoltOutlinedIcon /> },
  { label: "Events", path: "/events", icon: <EventAvailableOutlinedIcon /> },
];

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1, boxShadow: "none", borderBottom: `1px solid ${gridColors.inkLight}` }}>
        <Toolbar sx={{ gap: 1.5 }}>
          <BoltOutlinedIcon sx={{ color: gridColors.amber }} />
          <Typography variant="h6" sx={{ flexGrow: 0, letterSpacing: "-0.02em" }}>
            Grid Flex
          </Typography>
          <Typography variant="overline" sx={{ opacity: 0.6, ml: 0.5 }}>
            DR Console
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Chip
            size="small"
            label="EV Fleet · v1"
            sx={{ bgcolor: "rgba(255,255,255,0.08)", color: "#EDEFE9", fontFamily: "IBM Plex Mono, monospace" }}
          />
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: DRAWER_WIDTH, boxSizing: "border-box" },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: "auto", pt: 1 }}>
          <List>
            {NAV_ITEMS.map((item) => {
              const selected = location.pathname === item.path;
              return (
                <ListItemButton
                  key={item.path}
                  component={Link}
                  to={item.path}
                  selected={selected}
                  sx={{
                    mx: 1.5,
                    my: 0.3,
                    borderRadius: 2,
                    color: selected ? "#0B2E2C" : "#C9D3D0",
                    bgcolor: selected ? gridColors.amber : "transparent",
                    "&:hover": { bgcolor: selected ? gridColors.amber : "rgba(255,255,255,0.06)" },
                    "&.Mui-selected:hover": { bgcolor: gridColors.amber },
                  }}
                >
                  <ListItemIcon sx={{ color: "inherit", minWidth: 38 }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }} />
                </ListItemButton>
              );
            })}
          </List>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", my: 1.5, mx: 2 }} />
          <Typography variant="caption" sx={{ px: 3, color: "rgba(237,239,233,0.45)", display: "block" }}>
            Device-agnostic engine · EV adapter active
          </Typography>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: "background.default", minHeight: "100vh" }}>
        <Toolbar />
        <Box sx={{ p: { xs: 2, md: 4 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
