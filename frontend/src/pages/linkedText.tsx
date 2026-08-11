import type { ReactNode } from "react";

// Split keeps the captured URLs as their own array entries. The membership check is a separate
// non-global regex on purpose: .test() on a /g regex advances lastIndex between calls, so reusing
// URL_PATTERN here would match every other URL.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const IS_URL = /^https?:\/\//;

/// Renders text with any http/https URL turned into a real anchor. Migrated reports carry a link
/// back to their Power BI original in the description so figures can be cross-checked against it,
/// and a link is only useful if it's clickable rather than copy-pasted out of a table cell.
export function renderLinkedText(text: string | null | undefined): ReactNode {
  if (!text) {
    return "";
  }

  return text.split(URL_PATTERN).map((part, index) =>
    IS_URL.test(part) ? (
      <a
        key={index}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        // The surrounding table row is clickable in some call sites; opening the link should not
        // also trigger whatever the row does.
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    ),
  );
}
