import { describe, expect, it } from "vitest";
import { buildTheme, POWERBI_TABLE_SX } from "./theme";

describe("buildTheme", () => {
  it("builds a light theme on Fluent's neutrals and accent", () => {
    const theme = buildTheme("light");

    expect(theme.palette.mode).toBe("light");
    expect(theme.palette.primary.main).toBe("#0078d4");
    expect(theme.palette.background.default).toBe("#faf9f8");
    expect(theme.palette.background.paper).toBe("#ffffff");
    expect(theme.palette.text.primary).toBe("#242424");
  });

  it("builds a dark theme with distinct, dark-appropriate colors", () => {
    const theme = buildTheme("dark");

    expect(theme.palette.mode).toBe("dark");
    expect(theme.palette.primary.main).toBe("#2899f5");
    expect(theme.palette.background.default).toBe("#1b1a19");
    expect(theme.palette.background.paper).toBe("#252423");
    expect(theme.palette.text.primary).toBe("#f3f2f1");
  });

  it("keeps the same typography and shape configuration across both modes", () => {
    const light = buildTheme("light");
    const dark = buildTheme("dark");

    expect(light.typography.fontFamily).toBe(dark.typography.fontFamily);
    expect(light.shape.borderRadius).toBe(dark.shape.borderRadius);
  });

  // The reports this app hosts are rendered in Segoe UI; the chrome around them has to agree.
  it("leads with Segoe UI so the app matches the reports it displays", () => {
    expect(buildTheme("light").typography.fontFamily).toMatch(/^'Segoe UI'/);
  });

  // Fluent corners are 2-4px. An 8px radius is what made this read as a different design language.
  it("uses Fluent's tight corner radius", () => {
    expect(buildTheme("light").shape.borderRadius).toBeLessThanOrEqual(4);
  });

  it("uses distinct MuiTableCell head background colors per mode", () => {
    const light = buildTheme("light");
    const dark = buildTheme("dark");

    const lightHead = light.components?.MuiTableCell?.styleOverrides?.head as { background: string };
    const darkHead = dark.components?.MuiTableCell?.styleOverrides?.head as { background: string };
    expect(lightHead.background).toBe("#ffffff");
    expect(darkHead.background).toBe("#252423");
    expect(lightHead.background).not.toBe(darkHead.background);
  });

  // Command-bar buttons are flat text, not filled pills — the reports list is full of them.
  it("renders text buttons flat and compact", () => {
    const root = buildTheme("light").components?.MuiButton?.styleOverrides?.root as {
      fontWeight: number; borderRadius: number;
    };
    expect(root.fontWeight).toBe(400);
    expect(root.borderRadius).toBeLessThanOrEqual(2);
  });

  describe("POWERBI_TABLE_SX", () => {
    it("sets Segoe UI and a row height close to Power BI's", () => {
      expect(POWERBI_TABLE_SX.fontFamily).toMatch(/Segoe UI/);
      const cell = POWERBI_TABLE_SX["& .MuiTableCell-root"] as { fontSize: string; padding: string };
      expect(cell.fontSize).toBe("11px");
      expect(cell.padding).toBe("2px 8px");
    });

    it("leaves the header unfilled, as Power BI does", () => {
      const head = POWERBI_TABLE_SX["& .MuiTableCell-head"] as { background: string };
      expect(head.background).toBe("transparent");
    });
  });
});
