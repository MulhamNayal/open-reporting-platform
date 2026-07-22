import { useState } from "react";
import type { ReportPage } from "../api/reportPages";
import "./reportEditor.css";

function PageTabsBar({
  pages, activePageId, onSelect, onAdd, onRename, onDelete, readOnly = false,
}: {
  pages: ReportPage[];
  activePageId: number | null;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  readOnly?: boolean;
}) {
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");

  function startRename(page: ReportPage) {
    setRenamingId(page.id);
    setDraftName(page.name);
  }

  function commitRename(page: ReportPage) {
    setRenamingId(null);
    if (draftName.trim() !== "" && draftName !== page.name) {
      onRename(page.id, draftName.trim());
    }
  }

  return (
    <div className="pagetabs">
      {pages.map((page) =>
        renamingId === page.id ? (
          <input
            key={page.id}
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => commitRename(page)}
            onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
          />
        ) : (
          <button
            key={page.id}
            type="button"
            className={"ptab" + (page.id === activePageId ? " active" : "")}
            onClick={() => onSelect(page.id)}
            onDoubleClick={() => { if (!readOnly) { startRename(page); } }}
          >
            {page.name}
            {!readOnly && page.id === activePageId && pages.length > 1 && (
              <span aria-hidden="true" onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}> ×</span>
            )}
          </button>
        ),
      )}
      {!readOnly && <button className="addpage" title="New page" onClick={onAdd}>+</button>}
    </div>
  );
}

export default PageTabsBar;
