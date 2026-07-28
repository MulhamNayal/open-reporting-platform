import "./reportEditor.css";

// Sits to the left of a fixed-width side panel, so dragging it left (negative
// clientX delta) grows the panel and dragging it right shrinks it back.
function PaneDivider({
  width, onWidthChange, min = 200, max = 480, label,
}: {
  width: number;
  onWidthChange: (width: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = width;

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = Math.min(max, Math.max(min, Math.round(startWidth - (moveEvent.clientX - startX))));
      onWidthChange(nextWidth);
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      className="pane-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      onMouseDown={startResize}
    />
  );
}

export default PaneDivider;
