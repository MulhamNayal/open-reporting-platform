import type { ReactNode } from "react";
import "./reportEditor.css";

function WidgetChrome({
  title, selected, onDuplicate, onDelete, children,
}: {
  title: string;
  selected: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  return (
    <div className={"visual" + (selected ? " selected" : "")}>
      <div className="vhead">
        <span className="vtitle">{title}</span>
        {selected && (
          <div className="vtools">
            <button type="button" className="vtool" title="Duplicate" onClick={onDuplicate}>⧉</button>
            <button type="button" className="vtool" title="Delete" onClick={onDelete}>🗑</button>
          </div>
        )}
      </div>
      <div className="vbody">{children}</div>
    </div>
  );
}

export default WidgetChrome;
