import { useState, useRef } from "react";
import { Button, Input } from "@douyinfe/semi-ui";
import { IconDeleteStroked } from "@douyinfe/semi-icons";
import ColorPicker from "../ColorPicker";
import {
  Action,
  ObjectType,
  tableHeaderHeight,
  tableColorStripHeight,
  tableFieldHeight,
} from "../../../data/constants";
import {
  useDiagram,
  useSchemas,
  useSchemaDelete,
  useSettings,
  useUndoRedo,
  useLayout,
} from "../../../hooks";
import {
  getSchemaBox,
  unionRect,
  schemaMemberRect,
} from "../../../utils/utils";
import { useTranslation } from "react-i18next";

export default function SchemaInfo({ data, children }) {
  const { t } = useTranslation();
  const { layout } = useLayout();
  const { settings } = useSettings();
  const { updateSchema } = useSchemas();
  const { addTable, tables, relationships } = useDiagram();
  const confirmDeleteSchema = useSchemaDelete();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const [editField, setEditField] = useState({});
  const initialColorRef = useRef(data.color);

  // Add a new table centered in the schema's box (so its center is inside the
  // box and it stays a member — creating at the canvas center would land
  // outside the box and get dropped on the first drag), then grow the box to
  // its minimum containing dimensions so the new table fits fully inside.
  const addTableToSchema = () => {
    const box = getSchemaBox(data, tables, settings, relationships);
    const defaults = { schemaId: data.id };
    let grown = null;
    if (box) {
      const estHeight =
        tableHeaderHeight + tableColorStripHeight + tableFieldHeight;
      const x = Math.round(box.x + (box.width - settings.tableWidth) / 2);
      const y = Math.round(box.y + (box.height - estHeight) / 2);
      defaults.x = x;
      defaults.y = y;
      // Grow the box to contain the not-yet-created table, reusing the same
      // per-member margin rule getSchemaRect uses.
      grown = unionRect(
        box,
        schemaMemberRect(x, y, settings.tableWidth, estHeight),
      );
    }
    addTable(null, true, defaults);
    // Grow-only: the box never auto-shrinks (consistent with canvas resize), so
    // undoing the add removes the table but leaves the box at its grown size.
    if (
      grown &&
      box &&
      (grown.x !== box.x ||
        grown.y !== box.y ||
        grown.width !== box.width ||
        grown.height !== box.height)
    ) {
      updateSchema(data.id, grown);
    }
  };

  const handleColorPick = (color) => {
    const undoColor = initialColorRef.current;
    if (color === undoColor) return;
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.SCHEMA,
        sid: data.id,
        undo: { color: undoColor },
        redo: { color },
        message: t("edit_schema", { schemaName: data.name, extra: "[color]" }),
      },
    ]);
    setRedoStack([]);
    initialColorRef.current = color;
  };

  return (
    <div>
      <div className="flex items-center mb-2.5">
        <div className="text-md font-semibold break-keep">{t("name")}:</div>
        <Input
          className="ms-2"
          value={data.name}
          placeholder={t("name")}
          readonly={layout.readOnly}
          onChange={(value) => updateSchema(data.id, { name: value })}
          onFocus={(e) => setEditField({ name: e.target.value })}
          onBlur={(e) => {
            if (e.target.value === editField.name) return;
            setUndoStack((prev) => [
              ...prev,
              {
                action: Action.EDIT,
                element: ObjectType.SCHEMA,
                sid: data.id,
                undo: editField,
                redo: { name: e.target.value },
                message: t("edit_schema", {
                  schemaName: e.target.value,
                  extra: "[name]",
                }),
              },
            ]);
            setRedoStack([]);
          }}
        />
      </div>
      {children}
      <div className="flex items-center gap-1 mt-3">
        <ColorPicker
          usePopover={true}
          readOnly={layout.readOnly}
          value={data.color}
          onChange={(color) => updateSchema(data.id, { color })}
          onColorPick={handleColorPick}
        />
        <div className="flex gap-1 ml-auto">
          <Button disabled={layout.readOnly} onClick={addTableToSchema}>
            {t("add_table")}
          </Button>
          <Button
            type="danger"
            icon={<IconDeleteStroked />}
            disabled={layout.readOnly}
            onClick={() => confirmDeleteSchema(data)}
          />
        </div>
      </div>
    </div>
  );
}
