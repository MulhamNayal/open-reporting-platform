import { useState, type ReactNode } from "react";
import "./reportEditor.css";

function WidgetChrome({
  title, selected, onDuplicate, onDelete, onRename, children,
}: {
  title: string;
  selected: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  children: ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);

  function startRename() {
    setDraftTitle(title);
    setRenaming(true);
  }

  function commitRename() {
    setRenaming(false);
    if (draftTitle.trim() !== "" && draftTitle !== title) {
      onRename(draftTitle.trim());
    }
  }

  return (
    <div className={"visual" + (selected ? " selected" : "")}>
      <div className="vhead">
        {renaming ? (
          <input
            className="vtitle-input"
            value={draftTitle}
            autoFocus
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
          />
        ) : (
          <span className="vtitle" onDoubleClick={startRename}>{title}</span>
        )}
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
