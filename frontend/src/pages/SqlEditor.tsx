import { useEffect, useRef } from "react";
import { EditorView, basicSetup } from "codemirror";
import { MSSQL, sql } from "@codemirror/lang-sql";
import type { SqlCompletionSchema } from "./sqlCompletionSchema";
import "./sqlEditor.css";

// Uncontrolled by design: the callers of this form never need to push an
// external value into an already-mounted editor (a fresh QueryDefinitionForm
// always starts blank), so `value` only seeds the initial document and typing
// is reported upward via onChange without CodeMirror fighting a controlled
// value on every keystroke.
function SqlEditor({
  value, onChange, schema, "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  schema?: SqlCompletionSchema;
  "aria-label"?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const view = new EditorView({
      doc: value,
      extensions: [
        basicSetup,
        sql({ dialect: MSSQL, schema: schema ?? {}, upperCaseKeywords: true }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
      parent: containerRef.current,
    });
    view.contentDOM.setAttribute("aria-label", ariaLabel ?? "SQL");

    return () => view.destroy();
    // Recreated only when the completion schema changes (new connection picked), not on every
    // keystroke — `value` is intentionally excluded, see the uncontrolled-by-design note above.
  }, [schema, ariaLabel]);

  return <div ref={containerRef} className="sql-editor" data-testid="sql-editor" />;
}

export default SqlEditor;
