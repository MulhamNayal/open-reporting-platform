import { useEffect, useReducer, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box, Button, Container, MenuItem, TextField, Typography } from "@mui/material";
import { GridStack } from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { getWidgets, type WidgetType } from "../api/widgets";
import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
import WidgetRenderer from "../widgets/WidgetRenderer";

let tempIdCounter = -1;

const WIDGET_TYPES: WidgetType[] = ["Table", "Bar", "Line", "Pie", "Kpi", "Text"];

function ReportCanvas() {
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);

  const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getWidgets(reportId)
      .then((summaries) =>
        dispatch({
          type: "loaded",
          widgets: summaries.map((s) => ({
            id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content, binding: s.binding,
          })),
        }),
      )
      .catch(() => setError("Could not load this report's widgets."));
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
              <WidgetRenderer widget={w} />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

export default ReportCanvas;
