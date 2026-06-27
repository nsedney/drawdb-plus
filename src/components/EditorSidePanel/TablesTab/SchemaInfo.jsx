import { useState, useRef } from "react";
import { Button, Input } from "@douyinfe/semi-ui";
import { IconDeleteStroked } from "@douyinfe/semi-icons";
import ColorPicker from "../ColorPicker";
import { Action, ObjectType } from "../../../data/constants";
import {
  useSchemas,
  useSchemaDelete,
  useUndoRedo,
  useLayout,
} from "../../../hooks";
import { useTranslation } from "react-i18next";

export default function SchemaInfo({ data }) {
  const { t } = useTranslation();
  const { layout } = useLayout();
  const { updateSchema } = useSchemas();
  const confirmDeleteSchema = useSchemaDelete();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const [editField, setEditField] = useState({});
  const initialColorRef = useRef(data.color);

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
    <div className="flex items-center gap-2">
      <ColorPicker
        usePopover={true}
        readOnly={layout.readOnly}
        value={data.color}
        onChange={(color) => updateSchema(data.id, { color })}
        onColorPick={handleColorPick}
      />
      <Input
        className="flex-1"
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
      <Button
        type="danger"
        icon={<IconDeleteStroked />}
        disabled={layout.readOnly}
        onClick={() => confirmDeleteSchema(data)}
      />
    </div>
  );
}
