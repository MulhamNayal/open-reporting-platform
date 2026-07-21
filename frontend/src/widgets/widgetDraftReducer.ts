import type { WidgetFormatOptions, WidgetType } from "../api/widgets";

export interface WidgetBindingDraft {
  categoryField: string | null;
  valueFields: string[];
  formatOptions: WidgetFormatOptions;
}

export interface WidgetDraft {
  id: number; // negative for widgets added this editing session and not yet saved
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  content: string | null;
  binding: WidgetBindingDraft | null;
}

export type WidgetDraftAction =
  | { type: "loaded"; widgets: WidgetDraft[] }
  | { type: "added"; widget: WidgetDraft }
  | { type: "removed"; id: number }
  | { type: "positionsChanged"; changes: Array<{ id: number; x: number; y: number; w: number; h: number }> }
  | { type: "titleChanged"; id: number; title: string }
  | { type: "contentChanged"; id: number; content: string }
  | { type: "bindingChanged"; id: number; binding: WidgetBindingDraft | null }
  | { type: "typeChanged"; id: number; newType: WidgetType; binding: WidgetBindingDraft | null };

export function widgetDraftReducer(state: WidgetDraft[], action: WidgetDraftAction): WidgetDraft[] {
  switch (action.type) {
    case "loaded":
      return action.widgets;
    case "added":
      return [...state, action.widget];
    case "removed":
      return state.filter((widget) => widget.id !== action.id);
    case "positionsChanged":
      return state.map((widget) => {
        const change = action.changes.find((c) => c.id === widget.id);
        return change ? { ...widget, x: change.x, y: change.y, w: change.w, h: change.h } : widget;
      });
    case "titleChanged":
      return state.map((widget) => (widget.id === action.id ? { ...widget, title: action.title } : widget));
    case "contentChanged":
      return state.map((widget) => (widget.id === action.id ? { ...widget, content: action.content } : widget));
    case "bindingChanged":
      return state.map((widget) => (widget.id === action.id ? { ...widget, binding: action.binding } : widget));
    case "typeChanged":
      return state.map((widget) =>
        widget.id === action.id ? { ...widget, type: action.newType, binding: action.binding } : widget,
      );
    default:
      return state;
  }
}
