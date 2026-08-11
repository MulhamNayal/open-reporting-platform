import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderLinkedText } from "./linkedText";

describe("renderLinkedText", () => {
  it("returns an empty string for no text", () => {
    const { container } = render(<div>{renderLinkedText(null)}</div>);
    expect(container.textContent).toBe("");
  });

  it("leaves plain text alone", () => {
    render(<div>{renderLinkedText("Migrated from Power BI.")}</div>);
    expect(screen.getByText("Migrated from Power BI.")).toBeInTheDocument();
  });

  it("turns a URL into an anchor that opens in a new tab", () => {
    const url = "https://app.powerbi.com/groups/abc/reports/def";
    render(<div>{renderLinkedText(`Original: ${url}`)}</div>);

    const link = screen.getByRole("link", { name: url });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  // Regression guard: a global regex reused for .test() advances lastIndex between calls, which
  // silently linkified only every other URL.
  it("linkifies every URL, not every other one", () => {
    render(
      <div>
        {renderLinkedText("a https://one.example b https://two.example c https://three.example")}
      </div>,
    );

    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("keeps the surrounding text around a link", () => {
    const { container } = render(<div>{renderLinkedText("see https://x.example now")}</div>);
    expect(container.textContent).toBe("see https://x.example now");
  });
});
