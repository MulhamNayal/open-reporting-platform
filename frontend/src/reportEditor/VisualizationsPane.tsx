import { useState } from "react";
import type { ReactNode } from "react";
import type { WidgetType } from "../api/widgets";
import type { WidgetDraft } from "../widgets/widgetDraftReducer";
import { VIZ_ICON_PATHS, VIZ_LABELS, VIZ_PICKER_ORDER } from "./vizIcons";
import "./reportEditor.css";

function VisualizationsPane({
  selectedWidget, onAddWidget, onChangeType, children,
}: {
  selectedWidget: WidgetDraft | null;
  onAddWidget: (type: WidgetType) => void;
  onChangeType: (type: WidgetType) => void;
  children: (tab: "build" | "format") => ReactNode;
}) {
  const [tab, setTab] = useState<"build" | "format">("build");

  function handlePick(type: WidgetType) {
    if (selectedWidget) {
      onChangeType(type);
    } else {
      onAddWidget(type);
    }
  }

  return (
    <div className="pane pane-viz">
      <div className="pane-head">Visualizations</div>
      <div className="viz-picker">
        <div className="viz-grid">
          {VIZ_PICKER_ORDER.map((type) => (
            <button
              key={type}
              type="button"
              title={VIZ_LABELS[type]}
              className={"viz-cell" + (selectedWidget?.type === type ? " active" : "")}
              onClick={() => handlePick(type)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" dangerouslySetInnerHTML={{ __html: VIZ_ICON_PATHS[type] }} />
            </button>
          ))}
        </div>
      </div>
      <div className="buildtabs">
        <button type="button" className={"buildtab" + (tab === "build" ? " active" : "")} onClick={() => setTab("build")}>Build visual</button>
        <button type="button" className={"buildtab" + (tab === "format" ? " active" : "")} onClick={() => setTab("format")}>Format</button>
      </div>
      <div className="pane-scroll">{children(tab)}</div>
    </div>
  );
}

export default VisualizationsPane;
