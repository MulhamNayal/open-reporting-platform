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

/** The 3x3 app-switcher grid that sits at the top of the rail. */
export function WaffleIcon() {
  return (
    <svg {...base} fill="currentColor" stroke="none">
      {[4, 9, 14].flatMap((y) => [4, 9, 14].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width={2.5} height={2.5} rx={0.5} />))}
    </svg>
  );
}

export function HomeIcon() {
  return <svg {...base}><path d="M3.5 9.5L10 4l6.5 5.5V16H3.5V9.5z" /><path d="M8 16v-4h4v4" /></svg>;
}

/** Stacked panes — Power BI's Workspaces glyph. */
export function WorkspacesIcon() {
  return <svg {...base}><rect x="3" y="4.5" width="14" height="9" rx="1.5" /><path d="M6 16h8" /></svg>;
}

/** A small bar-chart, matching how the rail marks a report. */
export function ReportIcon() {
  return <svg {...base}><path d="M4 16V9M8 16V5M12 16v-5M16 16V7" /></svg>;
}

/** The small chevron Power BI puts on command-bar items that open a menu. */
export function ChevronDownIcon() {
  return <svg {...base} width={10} height={10}><path d="M5 8l5 5 5-5" /></svg>;
}

// The rail used emoji for these two (🔌 and 📚), which render as full-colour glyphs in whatever
// font the OS picks and sit at odds with every stroked icon beside them.
export function ConnectionIcon() {
  return <svg {...base}><path d="M8 12l-4 4M12 8l4-4" /><path d="M6.5 9.5l4 4a2.5 2.5 0 003.5 0l1-1a2.5 2.5 0 000-3.5l-4-4a2.5 2.5 0 00-3.5 0l-1 1a2.5 2.5 0 000 3.5z" /></svg>;
}

export function DatasetIcon() {
  return <svg {...base}><ellipse cx="10" cy="5.5" rx="5.5" ry="2" /><path d="M4.5 5.5v9c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2v-9" /><path d="M4.5 10c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2" /></svg>;
}

export function ClockIcon() {
  return <svg {...base}><circle cx="10" cy="10" r="6.5" /><path d="M10 6.5V10l2.5 1.75" /></svg>;
}

export function SearchIcon() {
  return <svg {...base}><circle cx="9" cy="9" r="4.75" /><path d="M12.5 12.5l3.5 3.5" /></svg>;
}

export function CloseIcon() {
  return <svg {...base}><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" /></svg>;
}

export function FilterIcon() {
  return <svg {...base}><path d="M3.5 5h13l-5 5.5v4.5l-3-1.5v-3L3.5 5z" /></svg>;
}
