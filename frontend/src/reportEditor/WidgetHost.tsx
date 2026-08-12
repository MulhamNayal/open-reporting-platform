import { Box, Button, Typography } from "@mui/material";
import type { WidgetSummary } from "../api/widgets";
import WidgetRenderer from "../widgets/WidgetRenderer";
import { PAGE_SIZE, useWidgetData } from "./useWidgetData";

/**
 * Supplies a widget with its data and renders it. Exists because deciding where the rows come
 * from needs a hook, and widgets are rendered inside a .map() where a hook can't be called.
 */
function WidgetHost({
  widget, onDataPointClick, hideTitle = false,
}: {
  widget: WidgetSummary;
  onDataPointClick?: (field: string, value: string) => void;
  hideTitle?: boolean;
}) {
  const { result, error, totalRows, page, setPage, paged, columnValues, columnTotals } = useWidgetData(widget);

  const lastPage = totalRows === null ? 0 : Math.max(0, Math.ceil(totalRows / PAGE_SIZE) - 1);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <WidgetRenderer
          widget={widget}
          result={result}
          error={error}
          onDataPointClick={onDataPointClick}
          hideTitle={hideTitle}
          columnValues={columnValues}
          columnTotals={columnTotals}
        />
      </Box>
      {paged && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.5 }}>
          <Button size="small" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
          <Typography variant="caption" sx={{ flexGrow: 1, textAlign: "center" }}>
            {`${(page * PAGE_SIZE + 1).toLocaleString()}–${Math.min((page + 1) * PAGE_SIZE, totalRows ?? 0).toLocaleString()} of ${(totalRows ?? 0).toLocaleString()}`}
          </Typography>
          <Button size="small" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Next</Button>
        </Box>
      )}
    </Box>
  );
}

export default WidgetHost;
