export function toggleCrossFilterValue(
  filterState: Record<string, string[]>,
  field: string,
  value: string,
): Record<string, string[]> {
  const current = filterState[field] ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  return { ...filterState, [field]: next };
}
