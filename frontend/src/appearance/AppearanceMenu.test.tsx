import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceProvider } from "./AppearanceContext";
import AppearanceMenu from "./AppearanceMenu";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.fontSize = "";
});

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "Appearance settings" }));
}

describe("AppearanceMenu", () => {
  it("shows Light active by default and the four zoom steps for the current theme", async () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    expect(screen.getByRole("button", { name: "Light" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Dark" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "100%" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "90%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "110%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "125%" })).toBeInTheDocument();
  });

  it("clicking Dark switches the theme and applies data-theme", async () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveClass("active");
  });

  it("clicking a zoom step applies it to the root font-size", async () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    await userEvent.click(screen.getByRole("button", { name: "110%" }));

    expect(document.documentElement.style.fontSize).toBe("110%");
    expect(screen.getByRole("button", { name: "110%" })).toHaveClass("active");
  });

  it("switching to Dark shows that theme's own remembered zoom, not the light theme's", async () => {
    window.localStorage.setItem("orp.zoom", JSON.stringify({ light: 90, dark: 125 }));
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    expect(screen.getByRole("button", { name: "90%" })).toHaveClass("active");

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(screen.getByRole("button", { name: "125%" })).toHaveClass("active");
  });
});
