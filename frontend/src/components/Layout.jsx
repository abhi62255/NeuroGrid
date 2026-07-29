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
  Divider,
} from "@mui/material";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import EvStationOutlinedIcon from "@mui/icons-material/EvStationOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import EnergySavingsLeafOutlinedIcon from "@mui/icons-material/EnergySavingsLeafOutlined";
import { uplightColors } from "../theme";

const DRAWER_WIDTH = 240;

const NAV_ITEMS = [
  { label: "Dashboard",       path: "/",                 icon: <DashboardOutlinedIcon /> },
  { label: "Devices",         path: "/devices",          icon: <EvStationOutlinedIcon /> },
  { label: "Recommendations", path: "/recommendations",  icon: <BoltOutlinedIcon /> },
  { label: "Events",          path: "/events",           icon: <EventAvailableOutlinedIcon /> },
  { label: "Tariff Calendar", path: "/tariff-calendar",  icon: <CalendarMonthOutlinedIcon /> },
];

export default function Layout({ children }) {
  const location = useLocation();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: (t) => t.zIndex.drawer + 1, borderBottom: `1px solid ${uplightColors.navyLight}` }}
      >
        <Toolbar sx={{ gap: 1.5, minHeight: 60 }}>
          <EnergySavingsLeafOutlinedIcon sx={{ color: uplightColors.green, fontSize: 26 }} />
          <Box sx={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", lineHeight: 1.15 }}
            >
              Uplight DR Console
            </Typography>
            <Typography
              variant="caption"
              sx={{ opacity: 0.65, fontSize: 11, letterSpacing: "0.04em" }}
            >
              Demand Response · Grid Flexibility
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              bgcolor: "rgba(255,255,255,0.1)",
              borderRadius: 1,
              px: 1.5,
              py: 0.5,
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: uplightColors.green,
                boxShadow: `0 0 0 2px rgba(60,173,110,0.35)`,
              }}
            />
            <Typography
              variant="caption"
              sx={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", letterSpacing: "0.05em" }}
            >
              EV Fleet · Live
            </Typography>
          </Box>
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
        <Toolbar sx={{ minHeight: 60 }} />
        <Box sx={{ overflow: "auto", pt: 1.5, pb: 2 }}>
          <Typography
            variant="overline"
            sx={{ px: 3, color: "rgba(200,216,232,0.55)", fontSize: 10, display: "block", mb: 1 }}
          >
            Navigation
          </Typography>
          <List disablePadding>
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
                    mb: 0.5,
                    borderRadius: 1.5,
                    color: selected ? "#fff" : "rgba(200,216,232,0.8)",
                    bgcolor: selected ? uplightColors.blue : "transparent",
                  }}
                >
                  <ListItemIcon sx={{ color: "inherit", minWidth: 36 }}>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                  />
                </ListItemButton>
              );
            })}
          </List>
          <Divider sx={{ borderColor: "rgba(255,255,255,0.08)", my: 2, mx: 2 }} />
          <Box sx={{ px: 3 }}>
            <Typography variant="caption" sx={{ color: "rgba(200,216,232,0.4)", fontSize: 11, display: "block", lineHeight: 1.6 }}>
              AI-powered demand response
            </Typography>
            <Typography variant="caption" sx={{ color: "rgba(200,216,232,0.4)", fontSize: 11, display: "block" }}>
              Device-agnostic · EV adapter active
            </Typography>
          </Box>
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1, bgcolor: "background.default", minHeight: "100vh" }}>
        <Toolbar sx={{ minHeight: 60 }} />
        <Box sx={{ p: { xs: 2, md: 3.5 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
