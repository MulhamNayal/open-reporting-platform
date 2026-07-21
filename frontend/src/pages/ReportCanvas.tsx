import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Box, Button, Container, MenuItem, TextField, Typography } from "@mui/material";
import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import axios from "axios";
import { getReport } from "../api/reports";
import { executeDataset, type QueryResult } from "../api/datasets";
import { getWidgets, saveWidgets, DEFAULT_FORMAT_OPTIONS, type SaveWidgetRequest, type WidgetType } from "../api/widgets";
import { getReportPages } from "../api/reportPages";
import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
import WidgetRenderer from "../widgets/WidgetRenderer";
import WidgetBindingEditor from "../widgets/WidgetBindingEditor";

let tempIdCounter = -1;

const WIDGET_TYPES: WidgetType[] = ["Table", "Bar", "Line", "Pie", "Kpi", "Text"];

function ReportCanvas() {
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);

  const [reportPageId, setReportPageId] = useState<number | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function load() {
      const report = await getReport(reportId);
      if (report.datasetId !== null) {
        setResult(await executeDataset(report.datasetId));
      }

      const pages = await getReportPages(reportId);
      const firstPageId = pages[0]?.id ?? null;
      setReportPageId(firstPageId);
      if (firstPageId === null) {
        return;
      }

      const summaries = await getWidgets(firstPageId);
      dispatch({
        type: "loaded",
        widgets: summaries.map((s) => ({
          id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content,
          binding: s.binding
            ? { categoryField: s.binding.categoryField, valueFields: s.binding.valueFields, formatOptions: DEFAULT_FORMAT_OPTIONS }
            : null,
        })),
      });
    }

    load().catch(() => setError("Could not load this report."));
  }, [reportId]);

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
      navigate(`/reports/${reportId}`);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(typeof err.response.data === "string" ? err.response.data : "Could not save this report's widgets.");
      } else {
        setError("Could not save this report's widgets.");
      }
    }
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Edit Report</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
        <TextField
          select
          label="Add widget"
          size="small"
          value=""
          onChange={(e) => addWidget(e.target.value as WidgetType)}
          sx={{ minWidth: 160 }}
        >
          {WIDGET_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
        </TextField>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </Box>
      <div className="grid-stack" ref={gridRef}>
        {widgets.map((w) => (
          <div
            key={w.id}
            className="grid-stack-item"
            {...({ "gs-id": String(w.id), "gs-x": w.x, "gs-y": w.y, "gs-w": w.w, "gs-h": w.h } as Record<string, unknown>)}
          >
            <div className="grid-stack-item-content">
              <Button size="small" onClick={() => removeWidget(w.id)}>Remove</Button>
              <TextField
                size="small"
                label="Title"
                value={w.title}
                onChange={(e) => dispatch({ type: "titleChanged", id: w.id, title: e.target.value })}
                sx={{ display: "block", mb: 1, mt: 1 }}
              />
              {w.type === "Text" && (
                <TextField
                  size="small"
                  label="Content"
                  multiline
                  minRows={2}
                  fullWidth
                  value={w.content ?? ""}
                  onChange={(e) => dispatch({ type: "contentChanged", id: w.id, content: e.target.value })}
                  sx={{ mb: 1 }}
                />
              )}
              <WidgetBindingEditor widget={w} columns={result?.columns ?? []} onChange={(binding) => dispatch({ type: "bindingChanged", id: w.id, binding })} />
              <WidgetRenderer
                widget={{
                  id: w.id, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
                  binding: w.binding
                    ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
                    : null,
                }}
                result={result}
              />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

export default ReportCanvas;
