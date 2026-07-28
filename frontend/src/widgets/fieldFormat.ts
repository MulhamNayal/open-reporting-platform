import type { BooleanStyle, DatePreset, FieldFormat, FieldFormatType, WidgetFormatOptions } from "../api/widgets";

export const DEFAULT_FIELD_FORMAT: FieldFormat = {
  type: "auto",
  decimalPlaces: 2,
  thousandsSeparator: true,
  prefix: "",
  suffix: "",
  datePreset: "iso",
  booleanStyle: "trueFalse",
  displayName: null,
};

// Shown as the option label in the date-format dropdown, and reused as a live preview.
export const DATE_PRESET_EXAMPLES: Record<DatePreset, string> = {
  iso: "2026-07-28",
  isoDateTime: "2026-07-28 14:30",
  shortDate: "7/28/2026",
  longDate: "July 28, 2026",
  monthYear: "July 2026",
};

// SQL Server native type name (ColumnDescriptor.nativeType) -> the format type "Auto" resolves
// to. Unrecognized/text types fall back to plain text (no formatting applied).
export function inferFormatType(nativeType: string | undefined): FieldFormatType {
  if (!nativeType) {
    return "text";
  }

  const type = nativeType.toLowerCase();
  if (["decimal", "numeric", "float", "real", "money", "smallmoney"].includes(type)) {
    return "decimal";
  }
  if (["int", "bigint", "smallint", "tinyint"].includes(type)) {
    return "integer";
  }
  if (["date", "datetime", "datetime2", "smalldatetime", "datetimeoffset"].includes(type)) {
    return "date";
  }
  if (type === "bit") {
    return "boolean";
  }
  return "text";
}

// The single entry point for resolving a field's effective format: merges whatever was saved
// (possibly nothing, or only a couple of properties) with the defaults, and resolves "auto" to a
// concrete type from the column's native SQL type.
export function getFieldFormat(options: WidgetFormatOptions | undefined, fieldName: string, nativeType?: string): FieldFormat {
  const saved = options?.fieldFormats?.[fieldName];
  const merged: FieldFormat = { ...DEFAULT_FIELD_FORMAT, ...saved };

  return merged.type === "auto" ? { ...merged, type: inferFormatType(nativeType) } : merged;
}

// A blank/whitespace-only display name is treated the same as unset — falls back to the real
// column name rather than showing an empty label.
export function resolveDisplayName(fieldName: string, format: FieldFormat): string {
  const trimmed = format.displayName?.trim();
  return trimmed ? trimmed : fieldName;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Reads local date/time components throughout, never .toISOString() — the backend sends
// timezone-less strings (e.g. "2026-07-28T00:00:00") for SQL Server date/datetime columns, which
// Date parses as local time. Converting to UTC for display (.toISOString()) would then shift the
// calendar day depending on the viewer's timezone offset from UTC.
function formatDate(value: unknown, preset: DatePreset): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  switch (preset) {
    case "iso":
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    case "isoDateTime":
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    case "shortDate":
      return date.toLocaleDateString("en-US");
    case "longDate":
      return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    case "monthYear":
      return date.toLocaleDateString("en-US", { year: "numeric", month: "long" });
  }
}

function formatNumber(value: unknown, format: FieldFormat): string {
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) {
    return String(value);
  }

  const fixed = num.toFixed(Math.max(0, format.decimalPlaces));
  const [wholePart, fractionPart] = fixed.split(".");
  const whole = format.thousandsSeparator ? Number(wholePart).toLocaleString("en-US") : wholePart;
  const body = fractionPart !== undefined ? `${whole}.${fractionPart}` : whole;

  return `${format.prefix}${body}${format.suffix}`;
}

function formatBoolean(value: unknown, style: BooleanStyle): string {
  const isTrue = value === true || value === 1 || value === "1" || value === "true";
  switch (style) {
    case "yesNo":
      return isTrue ? "Yes" : "No";
    case "checkmark":
      return isTrue ? "✓" : "✗";
    case "trueFalse":
    default:
      return isTrue ? "True" : "False";
  }
}

// format must already have "auto" resolved to a concrete type — see getFieldFormat.
export function formatFieldValue(value: unknown, format: FieldFormat): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  switch (format.type) {
    case "decimal":
      return formatNumber(value, format);
    case "integer":
      return formatNumber(value, { ...format, decimalPlaces: 0 });
    case "date":
      return formatDate(value, format.datePreset);
    case "boolean":
      return formatBoolean(value, format.booleanStyle);
    case "auto":
    case "text":
    default:
      return String(value);
  }
}
