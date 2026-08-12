/**
 * The handful of Fluent icons the command bars need, inline.
 *
 * Deliberately not a dependency: @mui/icons-material carries thousands of Material glyphs, and
 * Material is the design language this app is moving *away* from. These are drawn on Fluent's
 * 20px grid with a 1.5px stroke, take their colour from the surrounding text, and sit on the text
 * baseline so an icon+label button reads as one object.
 */
import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
  style: { flexShrink: 0, verticalAlign: "text-bottom" },
};

export function AddIcon() {
  return <svg {...base}><path d="M10 4v12M4 10h12" /></svg>;
}

export function DocumentIcon() {
  return <svg {...base}><path d="M5 3h6l4 4v10H5V3z" /><path d="M11 3v4h4" /></svg>;
}

export function InsertIcon() {
  return <svg {...base}><rect x="3.5" y="3.5" width="13" height="13" rx="1.5" /><path d="M10 7v6M7 10h6" /></svg>;
}

export function ViewIcon() {
  return <svg {...base}><path d="M2.5 10S5 5.5 10 5.5 17.5 10 17.5 10 15 14.5 10 14.5 2.5 10 2.5 10z" /><circle cx="10" cy="10" r="2.25" /></svg>;
}

export function EditIcon() {
  return <svg {...base}><path d="M4 16h3l9-9-3-3-9 9v3z" /><path d="M12.5 4.5l3 3" /></svg>;
}

export function RefreshIcon() {
  return <svg {...base}><path d="M16 10a6 6 0 1 1-1.8-4.3" /><path d="M16 3.5V6h-2.5" /></svg>;
}

export function SaveIcon() {
  return <svg {...base}><path d="M4 4h9l3 3v9H4V4z" /><path d="M7 4v4h6V4M7 16v-4h6v4" /></svg>;
}

export function ExportIcon() {
  return <svg {...base}><path d="M10 3v9" /><path d="M6.5 8.5L10 12l3.5-3.5" /><path d="M4 15.5h12" /></svg>;
}

export function CopyIcon() {
  return <svg {...base}><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4H5.5A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></svg>;
}

export function FilterIcon() {
  return <svg {...base}><path d="M3.5 5h13l-5 5.5v4.5l-3-1.5v-3L3.5 5z" /></svg>;
}
