import { useMemo, useRef } from "react";
import { useHover } from "usehooks-ts";
import { useDiagram, useSettings, useSelect, useLayout } from "../../hooks";
import { ObjectType, Tab } from "../../data/constants";
import { getSchemaBox } from "../../utils/utils";

export function CylinderIcon({ color, size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke={color}
      strokeWidth="1.4"
      className="shrink-0"
    >
      <ellipse cx="8" cy="3.5" rx="5.5" ry="2" />
      <path d="M2.5 3.5 V12.5 C2.5 13.6 5 14.5 8 14.5 C11 14.5 13.5 13.6 13.5 12.5 V3.5" />
      <path d="M2.5 8 C2.5 9.1 5 10 8 10 C11 10 13.5 9.1 13.5 8" />
    </svg>
  );
}

/*
 * A schema's box has its own stored geometry { x, y, width, height } (with a
 * table-derived fallback for legacy schemas — see getSchemaBox). It behaves
 * like a subject Area: the translucent body captures pointer events so clicking
 * it selects the schema and dragging it moves the whole group, while member
 * tables — painted in a layer above all boxes — stay individually interactive.
 * Hovering shows a dashed outline + corner resize handles. Membership is
 * decided spatially when a table is dropped (handled in Canvas), so the box no
 * longer follows its tables.
 */
export default function SchemaGroup({
  schema,
  onPointerDown,
  onResizeStart,
  isDropTarget = false,
  isExitTarget = false,
}) {
  const ref = useRef(null);
  const isHovered = useHover(ref);
  const { tables, relationships } = useDiagram();
  const { settings } = useSettings();
  const { layout } = useLayout();
  const { selectedElement, setSelectedElement, bulkSelectedElements } =
    useSelect();

  const rect = useMemo(
    () => getSchemaBox(schema, tables, settings, relationships),
    [schema, tables, settings, relationships],
  );

  // Double-click opens the schema's row in the left panel (mirrors tables).
  const openEditor = () => {
    if (!layout.sidebar) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.SCHEMA,
        id: schema.id,
        open: true,
      }));
      return;
    }
    setSelectedElement((prev) => ({
      ...prev,
      currentTab: Tab.TABLES,
      element: ObjectType.SCHEMA,
      id: schema.id,
      open: true,
    }));
    document
      .getElementById(`scroll_schema_${schema.id}`)
      ?.scrollIntoView({ behavior: "smooth" });
  };

  if (!rect) return null;

  const isSelected =
    (selectedElement.element === ObjectType.SCHEMA &&
      selectedElement.id === schema.id) ||
    bulkSelectedElements.some(
      (el) => el.type === ObjectType.SCHEMA && el.id === schema.id,
    );

  // Blue accent for drop-target/hover/select; otherwise the schema's own color.
  // `isExitTarget` (a table being dragged out) wins only when it isn't also the
  // drop endpoint, and shows a lighter, dashed shade in the schema's own color.
  const exiting = isExitTarget && !isDropTarget;
  const accent = isDropTarget || isHovered || isSelected;
  const dashed = isDropTarget || exiting || isHovered;
  const fillAlpha = isDropTarget ? "99" : exiting ? "33" : "66";

  return (
    <g ref={ref}>
      <foreignObject
        x={rect.x}
        y={rect.y}
        width={rect.width > 0 ? rect.width : 0}
        height={rect.height > 0 ? rect.height : 0}
        onPointerDown={onPointerDown}
      >
        <div
          onDoubleClick={openEditor}
          className={`w-full h-full rounded-2xl cursor-move border-2 ${
            dashed ? "border-dashed" : "border-solid"
          }`}
          style={{
            backgroundColor: `${schema.color}${fillAlpha}`,
            borderColor: accent ? "#3b82f6" : schema.color,
            borderWidth: accent ? 3 : 2,
            transition: "background-color 0.1s ease",
            filter: isDropTarget
              ? "drop-shadow(0 0 6px rgba(59, 130, 246, 0.6))"
              : undefined,
          }}
        >
          <div
            className="flex items-center gap-1 px-3 pt-2 select-none min-w-0"
            style={{ color: schema.color, fontWeight: 600 }}
          >
            <CylinderIcon color={schema.color} size={15} />
            <span className="truncate">{schema.name}</span>
          </div>
        </div>
      </foreignObject>
      {/* Corner resize handles. The box can be grown freely and shrunk down to
          a snug fit around its tables (clamped in Canvas). Shown on hover or
          while selected, mirroring subject areas. */}
      {(isHovered || isSelected) && !layout.readOnly && onResizeStart && (
        <>
          {[
            { dir: "tl", cx: rect.x, cy: rect.y, cursor: "nwse-resize" },
            {
              dir: "tr",
              cx: rect.x + rect.width,
              cy: rect.y,
              cursor: "nesw-resize",
            },
            {
              dir: "bl",
              cx: rect.x,
              cy: rect.y + rect.height,
              cursor: "nesw-resize",
            },
            {
              dir: "br",
              cx: rect.x + rect.width,
              cy: rect.y + rect.height,
              cursor: "nwse-resize",
            },
          ].map((h) => (
            <circle
              key={h.dir}
              cx={h.cx}
              cy={h.cy}
              r={6}
              fill={settings.mode === "light" ? "white" : "rgb(28, 31, 35)"}
              stroke="#5891db"
              strokeWidth={2}
              cursor={h.cursor}
              onPointerDown={(e) =>
                e.isPrimary && onResizeStart(e, schema.id, h.dir)
              }
            />
          ))}
        </>
      )}
    </g>
  );
}
