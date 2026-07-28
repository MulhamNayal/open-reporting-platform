import type { SchemaDescriptor } from "../api/datasources";

// @codemirror/lang-sql's schema-completion source wants a plain
// { tableName: [columnName, ...] } map, not our richer SchemaDescriptor shape.
export type SqlCompletionSchema = Record<string, string[]>;

export function buildSqlCompletionSchema(schema: SchemaDescriptor): SqlCompletionSchema {
  const result: SqlCompletionSchema = {};
  for (const table of schema.tables) {
    result[table.name] = table.fields.map((field) => field.name);
  }
  return result;
}
