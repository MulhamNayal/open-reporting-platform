import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AppSidebar from "./AppSidebar";

describe("AppSidebar", () => {
  it("renders links to Connections, Datasets, and Reports", () => {
    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /connections/i })).toHaveAttribute("href", "/datasources");
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveAttribute("href", "/datasets");
    expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/reports");
  });
});
