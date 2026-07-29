import { createTheme } from "@mui/material/styles";

// Uplight brand palette — matches uplight.com's clean, professional energy-tech look.
// Primary: deep navy; accent: bright blue; positive: green; background: off-white.
const palette = {
  navy: "#003054",
  navyLight: "#004A80",
  navyXLight: "#1A6EA8",
  blue: "#0073A8",
  blueLight: "#E8F4FA",
  green: "#3CAD6E",
  greenLight: "#E6F5EE",
  amber: "#F5A623",
  amberLight: "#FEF3DC",
  red: "#D93025",
  redLight: "#FDECEA",
  slate: "#546E7A",
  pageBackground: "#F4F6F9",
  cardBackground: "#FFFFFF",
  border: "#DDE3EC",
  textPrimary: "#0D1F2D",
  textSecondary: "#546E7A",
};

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: palette.navy, light: palette.navyLight, contrastText: "#fff" },
    secondary: { main: palette.blue, light: palette.blueLight, contrastText: "#fff" },
    success: { main: palette.green, light: palette.greenLight },
    warning: { main: palette.amber },
    error: { main: palette.red },
    background: { default: palette.pageBackground, paper: palette.cardBackground },
    text: { primary: palette.textPrimary, secondary: palette.textSecondary },
    divider: palette.border,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Inter", "Helvetica Neue", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: "-0.025em" },
    h2: { fontWeight: 700, letterSpacing: "-0.02em" },
    h3: { fontWeight: 600, letterSpacing: "-0.015em" },
    h4: { fontWeight: 600, letterSpacing: "-0.01em" },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: "0.01em" },
    overline: { fontFamily: '"Inter", sans-serif', letterSpacing: "0.1em", fontWeight: 600 },
    caption: { color: palette.textSecondary },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${palette.border}`,
          boxShadow: "0 1px 4px 0 rgba(0,48,84,0.06)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 6, boxShadow: "none", "&:hover": { boxShadow: "none" } },
        containedPrimary: {
          backgroundColor: palette.navy,
          "&:hover": { backgroundColor: palette.navyLight },
        },
        containedSecondary: {
          backgroundColor: palette.blue,
          "&:hover": { backgroundColor: palette.navyXLight },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600, fontSize: 12 } },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: palette.navy,
          boxShadow: "0 2px 8px rgba(0,48,84,0.18)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: palette.navy,
          color: "#C8D8E8",
          borderRight: "none",
          boxShadow: "2px 0 8px rgba(0,48,84,0.10)",
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          "&.Mui-selected": {
            backgroundColor: palette.blue,
            color: "#fff",
            "&:hover": { backgroundColor: palette.navyXLight },
          },
          "&:hover": { backgroundColor: "rgba(0,115,168,0.15)" },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { "& .MuiTableCell-head": { fontWeight: 700, color: palette.textPrimary } },
      },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 4, height: 5 } },
    },
  },
});

export const uplightColors = palette;
export default theme;
