import { useState } from "react";
import { IconButton, Popover } from "@mui/material";
import { useAppearance } from "./AppearanceContext";
import type { ZoomLevel } from "./AppearanceContext";
import "./appearanceMenu.css";

const ZOOM_LEVELS: ZoomLevel[] = [90, 100, 110, 125];

function AppearanceMenu() {
  const { mode, zoomByTheme, setMode, setZoom } = useAppearance();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <IconButton size="small" aria-label="Appearance settings" onClick={(e) => setAnchor(e.currentTarget)}>
        <span aria-hidden="true">⚙</span>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <div className="appearance-menu">
          <div className="appearance-menu-label">Theme</div>
          <div className="appearance-menu-row">
            <button type="button" className={"appearance-menu-btn" + (mode === "light" ? " active" : "")} onClick={() => setMode("light")}>
              Light
            </button>
            <button type="button" className={"appearance-menu-btn" + (mode === "dark" ? " active" : "")} onClick={() => setMode("dark")}>
              Dark
            </button>
          </div>
          <div className="appearance-menu-label">Zoom</div>
          <div className="appearance-menu-row">
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={"appearance-menu-btn" + (zoomByTheme[mode] === level ? " active" : "")}
                onClick={() => setZoom(level)}
              >
                {level}%
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

export default AppearanceMenu;
