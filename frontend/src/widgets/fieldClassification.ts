export type FieldKind = "Categorical" | "Numeric" | "Temporal" | "Unsupported";

const NUMERIC_PREFIXES = new Set([
  "int", "bigint", "smallint", "tinyint", "decimal", "numeric", "float", "real", "money", "smallmoney", "number",
]);

const TEMPORAL_PREFIXES = new Set([
  "date", "datetime", "datetime2", "smalldatetime", "time", "datetimeoffset",
]);

const CATEGORICAL_PREFIXES = new Set([
  "nvarchar", "varchar", "nchar", "char", "text", "ntext", "uniqueidentifier", "bit", "string", "boolean",
]);

export function classify(nativeType: string): FieldKind {
  if (!nativeType || nativeType.trim() === "") {
    return "Unsupported";
  }

  const prefix = nativeType.split("(")[0].trim().toLowerCase();

  if (NUMERIC_PREFIXES.has(prefix)) {
    return "Numeric";
  }

  if (TEMPORAL_PREFIXES.has(prefix)) {
    return "Temporal";
  }

  if (CATEGORICAL_PREFIXES.has(prefix)) {
    return "Categorical";
  }

  return "Unsupported";
}
