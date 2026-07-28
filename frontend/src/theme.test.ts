import { describe, expect, it } from "vitest";
import { buildTheme } from "./theme";

describe("buildTheme", () => {
  it("builds a light theme with the existing Meridian light colors", () => {
    const theme = buildTheme("light");

    expect(theme.palette.mode).toBe("light");
    expect(theme.palette.primary.main).toBe("#5b4fe6");
    expect(theme.palette.background.default).toBe("#e7eaf1");
    expect(theme.palette.background.paper).toBe("#ffffff");
    expect(theme.palette.text.primary).toBe("#1b1e27");
  });

  it("builds a dark theme with distinct, dark-appropriate colors", () => {
    const theme = buildTheme("dark");

    expect(theme.palette.mode).toBe("dark");
    expect(theme.palette.primary.main).toBe("#7b70f0");
    expect(theme.palette.background.default).toBe("#14151c");
    expect(theme.palette.background.paper).toBe("#1b1e27");
    expect(theme.palette.text.primary).toBe("#e7e9ee");
  });

  it("keeps the same typography and shape configuration across both modes", () => {
    const light = buildTheme("light");
    const dark = buildTheme("dark");

    expect(light.typography.fontFamily).toBe(dark.typography.fontFamily);
    expect(light.shape.borderRadius).toBe(dark.shape.borderRadius);
  });

  it("uses distinct MuiTableCell head background colors per mode", () => {
    const light = buildTheme("light");
    const dark = buildTheme("dark");

    const lightHead = light.components?.MuiTableCell?.styleOverrides?.head as { background: string };
    const darkHead = dark.components?.MuiTableCell?.styleOverrides?.head as { background: string };
    expect(lightHead.background).toBe("#f6f7f9");
    expect(darkHead.background).toBe("#20232d");
  });
});
