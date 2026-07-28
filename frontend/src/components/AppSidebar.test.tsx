import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppearanceProvider } from "../appearance/AppearanceContext";
import AppSidebar from "./AppSidebar";

describe("AppSidebar", () => {
  it("renders links to Connections, Datasets, and Reports", () => {
    render(
      <AppearanceProvider>
        <MemoryRouter initialEntries={["/reports"]}>
          <AppSidebar />
        </MemoryRouter>
      </AppearanceProvider>,
    );

    expect(screen.getByRole("link", { name: /connections/i })).toHaveAttribute("href", "/datasources");
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveAttribute("href", "/datasets");
    expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/reports");
  });

  it("shows a section header and marks the active destination", () => {
    render(
      <AppearanceProvider>
        <MemoryRouter initialEntries={["/datasets"]}>
          <AppSidebar />
        </MemoryRouter>
      </AppearanceProvider>,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /reports/i })).not.toHaveClass("active");
  });
});
