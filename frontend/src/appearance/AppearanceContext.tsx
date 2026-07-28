import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark";
export type ZoomLevel = 90 | 100 | 110 | 125;

export interface ZoomByTheme {
  light: ZoomLevel;
  dark: ZoomLevel;
}

export interface AppearanceContextValue {
  mode: ThemeMode;
  zoomByTheme: ZoomByTheme;
  setMode: (mode: ThemeMode) => void;
  setZoom: (zoom: ZoomLevel) => void;
}

const THEME_KEY = "orp.theme";
const ZOOM_KEY = "orp.zoom";
const DEFAULT_ZOOM_BY_THEME: ZoomByTheme = { light: 100, dark: 100 };
const VALID_ZOOM_LEVELS: ZoomLevel[] = [90, 100, 110, 125];

function isZoomLevel(value: unknown): value is ZoomLevel {
  return typeof value === "number" && (VALID_ZOOM_LEVELS as number[]).includes(value);
}

function readMode(): ThemeMode {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readZoomByTheme(): ZoomByTheme {
  try {
    const stored = window.localStorage.getItem(ZOOM_KEY);
    if (!stored) {
      return DEFAULT_ZOOM_BY_THEME;
    }
    const parsed = JSON.parse(stored) as Partial<ZoomByTheme>;
    return {
      light: isZoomLevel(parsed.light) ? parsed.light : 100,
      dark: isZoomLevel(parsed.dark) ? parsed.dark : 100,
    };
  } catch {
    return DEFAULT_ZOOM_BY_THEME;
  }
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [zoomByTheme, setZoomByTheme] = useState<ZoomByTheme>(readZoomByTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.style.fontSize = `${zoomByTheme[mode]}%`;
  }, [mode, zoomByTheme]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage unavailable (e.g. private browsing) — in-memory state still updates.
    }
  }

  function setZoom(zoom: ZoomLevel) {
    setZoomByTheme((prev) => {
      const next = { ...prev, [mode]: zoom };
      try {
        window.localStorage.setItem(ZOOM_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable — in-memory state still updates.
      }
      return next;
    });
  }

  const value: AppearanceContextValue = { mode, zoomByTheme, setMode, setZoom };

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return context;
}
