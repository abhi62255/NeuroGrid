import { createTheme } from "@mui/material/styles";

// Palette inspired by grid-operations control rooms: deep ink/teal for
// structure, warm amber for "on-peak / act now" signals, and a calm green
// for savings & completed states.
const palette = {
  ink: "#0B2E2C",
  inkLight: "#123F3C",
  paper: "#F6F5F0",
  card: "#FFFFFF",
  amber: "#E08A2C",
  amberDeep: "#B96A16",
  green: "#2E7D5B",
  slate: "#5B6B68",
  line: "#E2E1D8",
};

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: palette.ink, light: palette.inkLight, contrastText: "#fff" },
    secondary: { main: palette.amber, dark: palette.amberDeep, contrastText: "#1a1a1a" },
    success: { main: palette.green },
    background: { default: palette.paper, paper: palette.card },
    text: { primary: "#122421", secondary: palette.slate },
    divider: palette.line,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Helvetica", "Arial", sans-serif',
    h1: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700 },
    h2: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700 },
    h3: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600 },
    h4: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600 },
    h5: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600 },
    h6: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
    overline: { fontFamily: '"IBM Plex Mono", monospace', letterSpacing: "0.08em" },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: "none", border: `1px solid ${palette.line}` },
      },
    },
    MuiButton: {
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600 } },
    },
    MuiAppBar: {
      styleOverrides: { root: { backgroundColor: palette.ink } },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { backgroundColor: palette.ink, color: "#EDEFE9", borderRight: "none" },
      },
    },
  },
});

export const gridColors = palette;
export default theme;
