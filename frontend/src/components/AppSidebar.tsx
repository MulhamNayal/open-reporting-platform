import { Box, Tooltip } from "@mui/material";
import { Link, useLocation } from "react-router-dom";

const ITEMS = [
  { to: "/datasources", label: "Connections", icon: "🔌" },
  { to: "/datasets", label: "Datasets", icon: "📚" },
  { to: "/reports", label: "Reports", icon: "📊" },
];

function AppSidebar() {
  const location = useLocation();

  return (
    <Box
      component="nav"
      sx={{
        width: 56,
        flex: "0 0 56px",
        background: "var(--rail)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        py: 2,
      }}
    >
      {ITEMS.map((item) => {
        const active = location.pathname.startsWith(item.to);
        return (
          <Tooltip key={item.to} title={item.label} placement="right">
            <Box
              component={Link}
              to={item.to}
              aria-label={item.label}
              sx={{
                width: 36,
                height: 36,
                borderRadius: "8px",
                display: "grid",
                placeItems: "center",
                fontSize: 18,
                textDecoration: "none",
                color: active ? "#c9c2f7" : "#9aa2b2",
                background: active ? "rgba(91,79,230,.18)" : "transparent",
              }}
            >
              {item.icon}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

export default AppSidebar;
