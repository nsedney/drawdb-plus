import { useMemo } from "react";
import { useDiagram, useSettings, useSelect, useLayout } from "../../hooks";
import { ObjectType, Tab } from "../../data/constants";
import {
  getSchemaRect,
  schemaGroupTitleHeight,
  schemaGroupPadding,
} from "../../utils/utils";

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
 * A schema's box is fully derived from its member tables (see getSchemaRect) —
 * it has no stored position/size and is never resized. The outline ignores
 * pointer events so tables on top stay interactive and clicks on empty space
 * inside still start a marquee; only the title bar is grabbable (starts a
 * group drag via the onPointerDown handler supplied by Canvas).
 */
export default function SchemaGroup({ schema, onPointerDown }) {
  const { tables, relationships } = useDiagram();
  const { settings } = useSettings();
  const { layout } = useLayout();
  const { selectedElement, setSelectedElement } = useSelect();

  const rect = useMemo(
    () => getSchemaRect(schema.id, tables, settings, relationships),
    [schema.id, tables, settings, relationships],
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
    selectedElement.element === ObjectType.SCHEMA &&
    selectedElement.id === schema.id;

  return (
    <g>
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={16}
        ry={16}
        fill={`${schema.color}66`}
        stroke={isSelected ? "#3b82f6" : schema.color}
        strokeWidth={isSelected ? 3 : 2}
        style={{ pointerEvents: "none" }}
      />
      {/* Full-width title band above the tables — the grab handle for dragging
          the whole group. Label is top-padded to match note/area labels. */}
      <foreignObject
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={schemaGroupTitleHeight + schemaGroupPadding}
      >
        <div
          onPointerDown={onPointerDown}
          onDoubleClick={openEditor}
          className="flex items-start gap-1 px-3 pt-2 select-none cursor-move w-full h-full"
          style={{ color: schema.color, fontWeight: 600 }}
        >
          <CylinderIcon color={schema.color} size={15} />
          <span className="truncate">{schema.name}</span>
        </div>
      </foreignObject>
    </g>
  );
}
