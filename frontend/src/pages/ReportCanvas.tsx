import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Dialog, DialogContent, DialogTitle } from "@mui/material";
import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import axios from "axios";
import { getWidgets, saveWidgets, parseFormatOptions, DEFAULT_FORMAT_OPTIONS, type SaveWidgetRequest, type WidgetType } from "../api/widgets";
import { renameReport, setReportDataset } from "../api/reports";
import { createReportPage, deleteReportPage, updateReportPage } from "../api/reportPages";
import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
import WidgetRenderer from "../widgets/WidgetRenderer";
import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";
import Ribbon from "../reportEditor/Ribbon";
import VisualizationsPane from "../reportEditor/VisualizationsPane";
import BuildTab from "../reportEditor/BuildTab";
import FormatTab from "../reportEditor/FormatTab";
import DataPane from "../reportEditor/DataPane";
import FiltersPane from "../reportEditor/FiltersPane";
import PageTabsBar from "../reportEditor/PageTabsBar";
import WidgetChrome from "../reportEditor/WidgetChrome";
import QueryResultGrid from "../components/QueryResultGrid";
import { smartAdd } from "../reportEditor/fieldAssignment";
import { toggleCrossFilterValue } from "../reportEditor/clickToCrossFilter";
import QueryDefinitionForm from "./QueryDefinitionForm";
import "../reportEditor/reportEditor.css";

let tempIdCounter = -1;

function ReportCanvasInner() {
  const navigate = useNavigate();
  const { reportId, reportName: fetchedReportName, reportPages, reportPageId, setReportPageId, filteredResult, filterState, setFilterState, saveFilterState, rawResult, loading: queryLoading, refresh } = useReportQuery();

  const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
  const [error, setError] = useState<string | null>(null);
  const [reportName, setReportName] = useState("Report");
  const reportNameSeededRef = useRef(false);
  const [changeSourceOpen, setChangeSourceOpen] = useState(false);
  const [selectedWidgetId, setSelectedWidgetId] = useState<number | null>(null);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [railView, setRailView] = useState<"Report" | "Data table">("Report");
  const [widgetsLoaded, setWidgetsLoaded] = useState(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Seed the ribbon title from the fetched report name once. Guarded so an
  // in-session rename (or a later refresh) never clobbers unsaved local edits.
  useEffect(() => {
    if (!reportNameSeededRef.current && fetchedReportName !== null) {
      setReportName(fetchedReportName);
      reportNameSeededRef.current = true;
    }
  }, [fetchedReportName]);

  useEffect(() => {
    if (reportPageId === null) {
      setWidgetsLoaded(true);
      return;
    }

    setWidgetsLoaded(false);
    getWidgets(reportPageId)
      .then((summaries) => {
        dispatch({
          type: "loaded",
          widgets: summaries.map((s) => ({
            id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content,
            binding: s.binding
              ? { categoryField: s.binding.categoryField, valueFields: s.binding.valueFields, formatOptions: parseFormatOptions(s.binding.formatOptions) }
              : null,
          })),
        });
        setWidgetsLoaded(true);
      })
      .catch(() => {
        setError("Could not load this report's widgets.");
        setWidgetsLoaded(true);
      });
  }, [reportPageId]);

  const widgetIds = widgets.map((w) => w.id).join(",");

  // Gated on widgetsLoaded so the very first GridStack.init() call happens once,
  // directly against the real widget list — not once on an empty grid and again
  // moments later once the fetch resolves. That throwaway first init left widgets
  // loaded from the backend permanently unregistered with GridStack (no computed
  // size, no resize handles, no drag), while widgets added interactively after the
  // page had already settled were unaffected.
  // useLayoutEffect (not useEffect): GridStack scans the container's DOM children
  // synchronously during construction, so this needs to run before paint.
  //
  // gridRef.current can still be transiently null on the render that first
  // supplies real widget data: React (under StrictMode's simulated dev-mode
  // unmount/remount of this effect) can momentarily detach the ref around
  // that exact commit. Since nothing else changes afterward, a plain effect
  // never gets a second chance to run — so retry on the next animation frame
  // instead of silently giving up, until the ref is actually attached.
  const [gridRetryTick, setGridRetryTick] = useState(0);

  useLayoutEffect(() => {
    if (!widgetsLoaded) {
      return;
    }

    if (!gridRef.current) {
      const raf = requestAnimationFrame(() => setGridRetryTick((t) => t + 1));
      return () => cancelAnimationFrame(raf);
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
  }, [widgetIds, widgetsLoaded, gridRetryTick]);

  function nextWidgetPosition(): { x: number; y: number } {
    if (widgets.length === 0) {
      return { x: 0, y: 0 };
    }
    return { x: 0, y: Math.max(...widgets.map((w) => w.y + w.h)) };
  }

  function addWidget(type: WidgetType) {
    dispatch({
      type: "added",
      widget: {
        id: tempIdCounter--,
        type,
        ...nextWidgetPosition(),
        w: 4,
        h: 3,
        title: `New ${type} widget`,
        content: type === "Text" ? "" : null,
        // Table's empty ValueFields is a valid, complete binding ("show every column"),
        // so it should render immediately with no field configuration required. Every
        // other bindable type genuinely needs the user to pick fields first.
        binding: type === "Table" ? { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } : null,
      },
    });
  }

  function removeWidget(widgetId: number) {
    dispatch({ type: "removed", id: widgetId });
  }

  function duplicateWidget(source: WidgetDraft) {
    dispatch({
      type: "added",
      widget: { ...source, id: tempIdCounter--, x: source.x + 1, y: source.y + 1 },
    });
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
      await saveFilterState();
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
        onToggleFilters={() => setFiltersVisible((v) => !v)}
        onRefresh={refresh}
        onSave={handleSave}
      />
      {error && <Alert severity="error">{error}</Alert>}
      <div className="body">
        <FiltersPane visible={filtersVisible} rawResult={rawResult} filterState={filterState} onChange={setFilterState} />
        <div className="rail">
          <button className={"rbtn" + (railView === "Report" ? " active" : "")} title="Report" onClick={() => setRailView("Report")}>▦</button>
          <button className={"rbtn" + (railView === "Data table" ? " active" : "")} title="Data table" onClick={() => setRailView("Data table")}>☰</button>
        </div>
        <div className="stage">
          {railView === "Report" ? (
          <>
          <div className="stagebar">
            <span>{widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
          </div>
          <div className="scroll">
            <div className="canvas">
              {widgets.length === 0 && (
                <div className="canvas-empty">
                  <b>Build your report</b>
                  <div>Pick a visual from the right, or drag a field onto the canvas.</div>
                </div>
              )}
              <div className="grid-stack" ref={gridRef} data-testid="gridstack-canvas">
                {widgets.map((w) => (
                  <div
                    key={w.id}
                    className="grid-stack-item"
                    {...({ "gs-id": String(w.id), "gs-x": w.x, "gs-y": w.y, "gs-w": w.w, "gs-h": w.h } as Record<string, unknown>)}
                  >
                    <div className="grid-stack-item-content" onClick={() => setSelectedWidgetId(w.id)}>
                      <WidgetChrome
                        title={w.title}
                        selected={selectedWidgetId === w.id}
                        onDuplicate={() => duplicateWidget(w)}
                        onDelete={() => removeWidget(w.id)}
                        onRename={(title) => dispatch({ type: "titleChanged", id: w.id, title })}
                      >
                        {w.type === "Text" && (
                          <textarea
                            value={w.content ?? ""}
                            onChange={(e) => dispatch({ type: "contentChanged", id: w.id, content: e.target.value })}
                          />
                        )}
                        <WidgetRenderer
                          widget={{
                            id: w.id, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
                            binding: w.binding
                              ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
                              : null,
                          }}
                          result={filteredResult}
                          onDataPointClick={(field, value) => setFilterState(toggleCrossFilterValue(filterState, field, value))}
                        />
                      </WidgetChrome>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </>
          ) : (
            <div className="scroll">
              <QueryResultGrid result={rawResult} />
            </div>
          )}
        </div>
        <VisualizationsPane
          selectedWidget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
          onAddWidget={(type) => addWidget(type)}
          onChangeType={(type) => {
            if (selectedWidgetId !== null) {
              dispatch({ type: "typeChanged", id: selectedWidgetId, newType: type, binding: null });
            }
          }}
        >
          {(tab) =>
            tab === "build"
              ? (
                <BuildTab
                  widget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
                  columns={filteredResult?.columns ?? []}
                  onChange={(binding) => {
                    if (selectedWidgetId !== null) {
                      dispatch({ type: "bindingChanged", id: selectedWidgetId, binding });
                    }
                  }}
                />
              )
              : (
                <FormatTab
                  widget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
                  onChange={(binding) => {
                    if (selectedWidgetId !== null) {
                      dispatch({ type: "bindingChanged", id: selectedWidgetId, binding });
                    }
                  }}
                />
              )
          }
        </VisualizationsPane>
        <DataPane
          columns={filteredResult?.columns ?? []}
          selectedWidget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
          onSmartAdd={(fieldName, fieldKind) => {
            if (selectedWidgetId === null) {
              const newId = tempIdCounter--;
              const binding = smartAdd(
                { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS },
                "Bar",
                fieldName,
                fieldKind,
              );
              dispatch({
                type: "added",
                widget: { id: newId, type: "Bar", ...nextWidgetPosition(), w: 4, h: 3, title: "New Bar widget", content: null, binding },
              });
              setSelectedWidgetId(newId);
              return;
            }

            const widget = widgets.find((w) => w.id === selectedWidgetId);
            if (!widget || widget.type === "Text") {
              return;
            }
            const currentBinding = widget.binding ?? { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS };
            dispatch({ type: "bindingChanged", id: selectedWidgetId, binding: smartAdd(currentBinding, widget.type, fieldName, fieldKind) });
          }}
        />
      </div>
      <div className="pagetabs">
        <PageTabsBar
          pages={reportPages}
          activePageId={reportPageId}
          onSelect={setReportPageId}
          onAdd={async () => {
            const created = await createReportPage(reportId, null);
            await refresh();
            setReportPageId(created.id);
          }}
          onRename={async (pageId, name) => {
            await updateReportPage(reportId, pageId, { name });
            await refresh();
          }}
          onDelete={async (pageId) => {
            try {
              await deleteReportPage(reportId, pageId);
              await refresh();
            } catch (err) {
              if (axios.isAxiosError(err) && err.response?.status === 409) {
                window.alert(typeof err.response.data === "string" ? err.response.data : "A report needs at least one page.");
              }
            }
          }}
        />
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
