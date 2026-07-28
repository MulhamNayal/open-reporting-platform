import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider, useAppearance } from "./AppearanceContext";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.fontSize = "";
});

function Probe() {
  const { mode, zoomByTheme, setMode, setZoom } = useAppearance();
  return (
    <div>
      <div>mode: {mode}</div>
      <div>zoom: {zoomByTheme[mode]}</div>
      <div>light zoom: {zoomByTheme.light}</div>
      <div>dark zoom: {zoomByTheme.dark}</div>
      <button onClick={() => setMode("dark")}>go dark</button>
      <button onClick={() => setMode("light")}>go light</button>
      <button onClick={() => setZoom(110)}>zoom 110</button>
    </div>
  );
}

describe("AppearanceProvider", () => {
  it("defaults to light mode and 100% zoom for both themes when localStorage is empty", () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("mode: light")).toBeInTheDocument();
    expect(screen.getByText("zoom: 100")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.fontSize).toBe("100%");
  });

  it("reads a previously-stored theme and zoom from localStorage", () => {
    window.localStorage.setItem("orp.theme", "dark");
    window.localStorage.setItem("orp.zoom", JSON.stringify({ light: 100, dark: 125 }));

    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("mode: dark")).toBeInTheDocument();
    expect(screen.getByText("zoom: 125")).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe("125%");
  });

  it("setMode updates state, localStorage, and the data-theme attribute", async () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    await userEvent.click(screen.getByText("go dark"));

    expect(screen.getByText("mode: dark")).toBeInTheDocument();
    expect(window.localStorage.getItem("orp.theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setZoom only changes the current mode's stored zoom, leaving the other theme's untouched", async () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    await userEvent.click(screen.getByText("zoom 110"));

    expect(screen.getByText("light zoom: 110")).toBeInTheDocument();
    expect(screen.getByText("dark zoom: 100")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("orp.zoom")!)).toEqual({ light: 110, dark: 100 });
  });

  it("switching theme applies that theme's own remembered zoom", async () => {
    window.localStorage.setItem("orp.zoom", JSON.stringify({ light: 90, dark: 125 }));
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    await userEvent.click(screen.getByText("go dark"));

    expect(screen.getByText("zoom: 125")).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe("125%");
  });

  it("falls back to defaults when localStorage holds malformed JSON for zoom", () => {
    window.localStorage.setItem("orp.zoom", "not json{");

    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("zoom: 100")).toBeInTheDocument();
  });

  it("falls back to defaults when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });

    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("mode: light")).toBeInTheDocument();
    expect(screen.getByText("zoom: 100")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("useAppearance throws when used outside an AppearanceProvider", () => {
    function Bare() {
      useAppearance();
      return null;
    }
    expect(() => render(<Bare />)).toThrow("useAppearance must be used within an AppearanceProvider");
  });
});
