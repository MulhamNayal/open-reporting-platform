import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PaneDivider from "./PaneDivider";

afterEach(cleanup);

describe("PaneDivider", () => {
  it("dragging left grows the panel width", () => {
    const onWidthChange = vi.fn();
    render(<PaneDivider width={256} onWidthChange={onWidthChange} label="Resize Visualizations panel" />);

    const handle = screen.getByRole("separator", { name: "Resize Visualizations panel" });
    fireEvent.mouseDown(handle, { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 260 });
    fireEvent.mouseUp(window);

    expect(onWidthChange).toHaveBeenCalledWith(296);
  });

  it("dragging right shrinks the panel width", () => {
    const onWidthChange = vi.fn();
    render(<PaneDivider width={256} onWidthChange={onWidthChange} label="Resize Visualizations panel" />);

    const handle = screen.getByRole("separator", { name: "Resize Visualizations panel" });
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 140 });
    fireEvent.mouseUp(window);

    expect(onWidthChange).toHaveBeenCalledWith(216);
  });

  it("clamps the width to the given minimum", () => {
    const onWidthChange = vi.fn();
    render(<PaneDivider width={256} onWidthChange={onWidthChange} min={200} max={480} label="Resize Visualizations panel" />);

    const handle = screen.getByRole("separator", { name: "Resize Visualizations panel" });
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 1000 });
    fireEvent.mouseUp(window);

    expect(onWidthChange).toHaveBeenCalledWith(200);
  });

  it("clamps the width to the given maximum", () => {
    const onWidthChange = vi.fn();
    render(<PaneDivider width={256} onWidthChange={onWidthChange} min={200} max={480} label="Resize Visualizations panel" />);

    const handle = screen.getByRole("separator", { name: "Resize Visualizations panel" });
    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 100 });
    fireEvent.mouseUp(window);

    expect(onWidthChange).toHaveBeenCalledWith(480);
  });

  it("stops resizing once the mouse button is released", () => {
    const onWidthChange = vi.fn();
    render(<PaneDivider width={256} onWidthChange={onWidthChange} label="Resize Visualizations panel" />);

    const handle = screen.getByRole("separator", { name: "Resize Visualizations panel" });
    fireEvent.mouseDown(handle, { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 260 });
    fireEvent.mouseUp(window);
    onWidthChange.mockClear();

    fireEvent.mouseMove(window, { clientX: 200 });

    expect(onWidthChange).not.toHaveBeenCalled();
  });
});
