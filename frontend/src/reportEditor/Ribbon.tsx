import { useState } from "react";
import { Menu, MenuItem } from "@mui/material";
import AppearanceMenu from "../appearance/AppearanceMenu";
import { DocumentIcon, InsertIcon, RefreshIcon, SaveIcon, ViewIcon } from "../components/FluentIcons";
import "./reportEditor.css";

function Ribbon({
  reportName, onRename, onChangeDataSource, onBackToReports, onAddText, onToggleFilters, onRefresh, onSave,
  readOnly = false,
}: {
  reportName: string;
  onRename: () => void;
  onChangeDataSource: () => void;
  onBackToReports: () => void;
  onAddText: () => void;
  onToggleFilters: () => void;
  onRefresh: () => void;
  onSave: () => void;
  readOnly?: boolean;
}) {
  const [fileAnchor, setFileAnchor] = useState<HTMLElement | null>(null);
  const [insertAnchor, setInsertAnchor] = useState<HTMLElement | null>(null);
  const [viewAnchor, setViewAnchor] = useState<HTMLElement | null>(null);

  return (
    <div className="ribbon">
      {/* No coloured brand mark: Power BI's command bar carries the report name as plain text and
          nothing else on the left. The mark was a Meridian flourish. */}
      <div className="brand">{reportName}</div>
      {!readOnly && (
        <div className="menu">
          <button onClick={(e) => setFileAnchor(e.currentTarget)}><DocumentIcon />File</button>
          <Menu anchorEl={fileAnchor} open={Boolean(fileAnchor)} onClose={() => setFileAnchor(null)}>
            <MenuItem onClick={() => { setFileAnchor(null); onRename(); }}>Rename report</MenuItem>
            <MenuItem onClick={() => { setFileAnchor(null); onChangeDataSource(); }}>Change data source</MenuItem>
            <MenuItem onClick={() => { setFileAnchor(null); onBackToReports(); }}>Back to Reports</MenuItem>
          </Menu>

          <button onClick={(e) => setInsertAnchor(e.currentTarget)}><InsertIcon />Insert</button>
          <Menu anchorEl={insertAnchor} open={Boolean(insertAnchor)} onClose={() => setInsertAnchor(null)}>
            <MenuItem onClick={() => { setInsertAnchor(null); onAddText(); }}>Add Text widget</MenuItem>
          </Menu>

          <button onClick={(e) => setViewAnchor(e.currentTarget)}><ViewIcon />View</button>
          <Menu anchorEl={viewAnchor} open={Boolean(viewAnchor)} onClose={() => setViewAnchor(null)}>
            <MenuItem onClick={() => { setViewAnchor(null); onToggleFilters(); }}>Toggle Filters pane</MenuItem>
          </Menu>
        </div>
      )}
      <div className="spacer" />
      <div className="tools">
        <AppearanceMenu />
        <button className="iconbtn" title="Refresh data" aria-label="Refresh data" onClick={onRefresh}><RefreshIcon /></button>
        {!readOnly && (
          <>
            <div className="divider-v" />
            <button className="btn-primary" onClick={onSave}><SaveIcon />Save</button>
          </>
        )}
      </div>
    </div>
  );
}

export default Ribbon;
