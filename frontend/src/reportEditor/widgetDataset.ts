// A widget's dataset falls back to the report's default when it doesn't name its own.
// Kept as one function so the fallback rule lives in a single testable place rather than
// as a scattered `?? reportDatasetId` at every call site.
export function resolveWidgetDatasetId(
  widgetDatasetId: number | null | undefined,
  reportDatasetId: number | null,
): number | null {
  return widgetDatasetId ?? reportDatasetId;
}
