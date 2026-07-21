import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Dialog, DialogContent, DialogTitle } from "@mui/material";
import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import axios from "axios";
import { getWidgets, saveWidgets, parseFormatOptions, type SaveWidgetRequest, type WidgetType } from "../api/widgets";
import { renameReport, setReportDataset } from "../api/reports";
import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
import WidgetRenderer from "../widgets/WidgetRenderer";
import WidgetBindingEditor from "../widgets/WidgetBindingEditor";
import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";
import Ribbon from "../reportEditor/Ribbon";
import QueryDefinitionForm from "./QueryDefinitionForm";
import "../reportEditor/reportEditor.css";

let tempIdCounter = -1;

function ReportCanvasInner() {
  const navigate = useNavigate();
  const { reportId, reportPageId, filteredResult, loading: queryLoading, refresh } = useReportQuery();

  const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
  const [error, setError] = useState<string | null>(null);
  const [reportName, setReportName] = useState("Report");
  const [changeSourceOpen, setChangeSourceOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reportPageId === null) {
      return;
    }

    getWidgets(reportPageId)
      .then((summaries) =>
        dispatch({
          type: "loaded",
          widgets: summaries.map((s) => ({
            id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content,
            binding: s.binding
              ? { categoryField: s.binding.categoryField, valueFields: s.binding.valueFields, formatOptions: parseFormatOptions(s.binding.formatOptions) }
              : null,
          })),
        }),
      )
      .catch(() => setError("Could not load this report's widgets."));
  }, [reportPageId]);

  const widgetIds = widgets.map((w) => w.id).join(",");

  useEffect(() => {
    if (!gridRef.current) {
      return;
    }

    const grid = GridStack.init({ column: 12, cellHeight: 80 }, gridRef.current);
    if (!grid) {
      return;
    }

    grid.on("change", (_event, items) => {
      const changes = (items ?? []).map((item) => ({
        id: Number(item.id),
        x: item.x ?? 0,
        y: item.y ?? 0,
        w: item.w ?? 1,
        h: item.h ?? 1,
      }));
      dispatch({ type: "positionsChanged", changes });
    });

    return () => {
      grid.destroy(false);
    };
  }, [widgetIds]);

  function addWidget(type: WidgetType) {
    dispatch({
      type: "added",
      widget: {
        id: tempIdCounter--,
        type,
        x: 0,
        y: 0,
        w: 4,
        h: 3,
        title: `New ${type} widget`,
        content: type === "Text" ? "" : null,
        binding: null,
      },
    });
  }

  function removeWidget(widgetId: number) {
    dispatch({ type: "removed", id: widgetId });
  }

  async function handleSave() {
    if (reportPageId === null) {
      return;
    }

    setError(null);
    const payload: SaveWidgetRequest[] = widgets.map((w) => ({
      type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
      binding: w.binding
        ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
        : null,
    }));

    try {
      await saveWidgets(reportPageId, payload);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(typeof err.response.data === "string" ? err.response.data : "Could not save this report's widgets.");
      } else {
        setError("Could not save this report's widgets.");
      }
    }
  }

  async function handleRename() {
    const next = window.prompt("Rename report", reportName);
    if (next && next.trim() !== "") {
      await renameReport(reportId, next.trim());
      setReportName(next.trim());
    }
  }

  if (queryLoading) {
    return <div>Loading…</div>;
  }

  return (
    <div className="app" style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <Ribbon
        reportName={reportName}
        onRename={handleRename}
        onChangeDataSource={() => setChangeSourceOpen(true)}
        onBackToReports={() => navigate("/reports")}
        onAddText={() => addWidget("Text")}
        onToggleFilters={() => {}}
        onRefresh={refresh}
        onSave={handleSave}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <div className="body">
        <div className="rail">
          <button className="rbtn active" title="Report">▦</button>
          <button className="rbtn" title="Data table">☰</button>
        </div>
        <div className="stage">
          <div className="stagebar">
            <span>{widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
          </div>
          <div className="scroll">
            <div className="canvas" ref={gridRef} data-testid="gridstack-canvas">
              {widgets.length === 0 && (
                <div className="canvas-empty">
                  <b>Build your report</b>
                  <div>Pick a visual from the right, or drag a field onto the canvas.</div>
                </div>
              )}
              <div className="grid-stack">
                {widgets.map((w) => (
                  <div
                    key={w.id}
                    className="grid-stack-item"
                    {...({ "gs-id": String(w.id), "gs-x": w.x, "gs-y": w.y, "gs-w": w.w, "gs-h": w.h } as Record<string, unknown>)}
                  >
                    <div className="grid-stack-item-content">
                      <button onClick={() => removeWidget(w.id)}>Remove</button>
                      <input
                        value={w.title}
                        onChange={(e) => dispatch({ type: "titleChanged", id: w.id, title: e.target.value })}
                      />
                      {w.type === "Text" && (
                        <textarea
                          value={w.content ?? ""}
                          onChange={(e) => dispatch({ type: "contentChanged", id: w.id, content: e.target.value })}
                        />
                      )}
                      <WidgetBindingEditor widget={w} columns={filteredResult?.columns ?? []} onChange={(binding) => dispatch({ type: "bindingChanged", id: w.id, binding })} />
                      <WidgetRenderer
                        widget={{
                          id: w.id, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
                          binding: w.binding
                            ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
                            : null,
                        }}
                        result={filteredResult}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="pagetabs">
        <button className="ptab active">Page 1</button>
      </div>

      <Dialog open={changeSourceOpen} maxWidth="sm" fullWidth onClose={() => setChangeSourceOpen(false)}>
        <DialogTitle>Change data source</DialogTitle>
        <DialogContent>
          <QueryDefinitionForm
            onRun={async (value) => {
              const updated = await setReportDataset(reportId, value);
              const { executeDataset } = await import("../api/datasets");
              return executeDataset(updated.datasetId!);
            }}
            onSubmit={async (value) => {
              await setReportDataset(reportId, value);
              setChangeSourceOpen(false);
              await refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ReportCanvas() {
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);

  return (
    <ReportQueryProvider reportId={reportId}>
      <ReportCanvasInner />
    </ReportQueryProvider>
  );
}

export default ReportCanvas;
