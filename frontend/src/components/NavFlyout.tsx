import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon, SearchIcon } from "./FluentIcons";

/**
 * The panel the rail opens beside itself.
 *
 * A 68px rail can't show a name like "Project Admin Team - Management Reports" — clamped to two
 * lines at 9px it was unreadable, which is what made the rail look cramped. Power BI puts the list
 * in a flyout next to the rail instead, so the rail stays narrow and the names get real room.
 *
 * Overlays the page rather than displacing it: opening it is a glance, not a layout change, and the
 * report behind it shouldn't reflow.
 */
function NavFlyout({
  title, onClose, search, children,
}: {
  title: string;
  onClose: () => void;
  // Omitted when the list is short enough to scan, where a search box is just clutter.
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    // Anything that isn't the panel or the rail button that opened it counts as dismissing it. The
    // rail is excluded so clicking the same button toggles rather than closing and reopening.
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      // A click can land on a text node, which has no closest() — resolving to its element first,
      // because treating it as "outside" closed the panel and let the button's own handler reopen
      // it, so the rail button appeared not to toggle at all.
      const element = target instanceof Element ? target : target?.parentElement ?? null;
      if (panel.current && target && !panel.current.contains(target) && !element?.closest(".app-nav")) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div className="nav-flyout" ref={panel} role="group" aria-label={title}>
      <div className="nav-flyout-head">
        <h2 className="nav-flyout-title">{title}</h2>
        <button type="button" className="nav-flyout-close" aria-label={`Close ${title}`} onClick={onClose}>
          <CloseIcon />
        </button>
      </div>

      {search && (
        <div className="nav-flyout-search">
          <span className="nav-flyout-search-icon"><SearchIcon /></span>
          <input
            type="search"
            value={search.value}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            onChange={(e) => search.onChange(e.target.value)}
          />
        </div>
      )}

      <div className="nav-flyout-list">{children}</div>
    </div>
  );
}

export default NavFlyout;
