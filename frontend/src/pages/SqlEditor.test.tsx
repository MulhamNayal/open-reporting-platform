import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SqlEditor from "./SqlEditor";

afterEach(cleanup);

// CodeMirror owns a contentEditable DOM tree it manages itself, not a native
// <textarea>/<input> — real typing is verified live (Playwright), not simulated
// here. This confirms the wrapper mounts, seeds its initial doc, unmounts
// cleanly, and exposes an accessible name, matching how GridStack's canvas
// wiring in ReportCanvas is verified live rather than unit-tested.
describe("SqlEditor", () => {
  it("mounts CodeMirror with the initial SQL text", () => {
    render(<SqlEditor value="select 1" onChange={() => {}} />);

    expect(screen.getByTestId("sql-editor").textContent).toContain("select 1");
  });

  it("exposes an accessible name for the editable region", () => {
    render(<SqlEditor value="" onChange={() => {}} aria-label="SQL" />);

    expect(screen.getByRole("textbox", { name: "SQL" })).toBeInTheDocument();
  });

  it("unmounts without throwing", () => {
    const { unmount } = render(<SqlEditor value="select 1" onChange={() => {}} />);

    expect(() => unmount()).not.toThrow();
  });
});
