import { useState } from "react";
import { Menu, MenuItem } from "@mui/material";
import "./reportEditor.css";

function Ribbon({
  reportName, onRename, onChangeDataSource, onBackToReports, onAddText, onToggleFilters, onRefresh, onSave,
}: {
  reportName: string;
  onRename: () => void;
  onChangeDataSource: () => void;
  onBackToReports: () => void;
  onAddText: () => void;
  onToggleFilters: () => void;
  onRefresh: () => void;
  onSave: () => void;
}) {
  const [fileAnchor, setFileAnchor] = useState<HTMLElement | null>(null);
  const [insertAnchor, setInsertAnchor] = useState<HTMLElement | null>(null);
  const [viewAnchor, setViewAnchor] = useState<HTMLElement | null>(null);

  return (
    <div className="ribbon">
      <div className="brand">{reportName}</div>
      <div className="menu">
        <button onClick={(e) => setFileAnchor(e.currentTarget)}>File</button>
        <Menu anchorEl={fileAnchor} open={Boolean(fileAnchor)} onClose={() => setFileAnchor(null)}>
          <MenuItem onClick={() => { setFileAnchor(null); onRename(); }}>Rename report</MenuItem>
          <MenuItem onClick={() => { setFileAnchor(null); onChangeDataSource(); }}>Change data source</MenuItem>
          <MenuItem onClick={() => { setFileAnchor(null); onBackToReports(); }}>Back to Reports</MenuItem>
        </Menu>

        <button onClick={(e) => setInsertAnchor(e.currentTarget)}>Insert</button>
        <Menu anchorEl={insertAnchor} open={Boolean(insertAnchor)} onClose={() => setInsertAnchor(null)}>
          <MenuItem onClick={() => { setInsertAnchor(null); onAddText(); }}>Add Text widget</MenuItem>
        </Menu>

        <button onClick={(e) => setViewAnchor(e.currentTarget)}>View</button>
        <Menu anchorEl={viewAnchor} open={Boolean(viewAnchor)} onClose={() => setViewAnchor(null)}>
          <MenuItem onClick={() => { setViewAnchor(null); onToggleFilters(); }}>Toggle Filters pane</MenuItem>
        </Menu>
      </div>
      <div className="spacer" />
      <div className="tools">
        <button className="iconbtn" title="Refresh data" onClick={onRefresh}>⟳</button>
        <div className="divider-v" />
        <button className="btn-primary" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

export default Ribbon;
