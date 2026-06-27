import { Modal, Button } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { Action, ObjectType } from "../data/constants";
import useDiagram from "./useDiagram";
import useSchemas from "./useSchemas";
import useSelect from "./useSelect";
import useUndoRedo from "./useUndoRedo";

/*
 * Shared schema-deletion used by both the left-panel delete button and the
 * canvas Delete key, so the experience is identical. A schema with member
 * tables prompts to keep them (ungroup) or delete them too; an empty schema is
 * removed without a prompt. The delete is one atomic, undoable operation
 * (before/after snapshot).
 */
export default function useSchemaDelete() {
  const { tables, setTables, relationships, setRelationships } = useDiagram();
  const { schemas, setSchemas } = useSchemas();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { setSelectedElement } = useSelect();
  const { t } = useTranslation();

  const performDelete = (schema, mode) => {
    const before = { tables, relationships, schemas };
    let newTables;
    let newRelationships = relationships;
    if (mode === "withTables") {
      const memberIds = new Set(
        tables.filter((tb) => tb.schemaId === schema.id).map((tb) => tb.id),
      );
      newTables = tables.filter((tb) => !memberIds.has(tb.id));
      newRelationships = relationships.filter(
        (r) => !memberIds.has(r.startTableId) && !memberIds.has(r.endTableId),
      );
    } else {
      newTables = tables.map((tb) =>
        tb.schemaId === schema.id ? { ...tb, schemaId: null } : tb,
      );
    }
    const newSchemas = schemas.filter((s) => s.id !== schema.id);

    setTables(newTables);
    setRelationships(newRelationships);
    setSchemas(newSchemas);
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.DELETE,
        element: ObjectType.SCHEMA,
        data: {
          before,
          after: {
            tables: newTables,
            relationships: newRelationships,
            schemas: newSchemas,
          },
        },
        message: t("delete_schema", { schemaName: schema.name }),
      },
    ]);
    setRedoStack([]);
    setSelectedElement((prev) => ({
      ...prev,
      element: ObjectType.NONE,
      id: -1,
      open: false,
    }));
  };

  const confirmDeleteSchema = (schema) => {
    if (!schema) return;

    // Empty schema: nothing to keep-or-delete, so just remove it (undoable).
    if (!tables.some((tb) => tb.schemaId === schema.id)) {
      performDelete(schema, "ungroup");
      return;
    }

    // Dismiss via the close (X), Esc, or click-outside — no separate Cancel.
    let handle;
    handle = Modal.confirm({
      width: 420,
      icon: null,
      className: "schema-delete-modal",
      maskClosable: true,
      title: t("delete_schema", { schemaName: schema.name }),
      content: t("delete_schema_confirm"),
      footer: (
        <div className="flex justify-end gap-2 mt-2">
          <Button
            theme="solid"
            type="primary"
            onClick={() => {
              performDelete(schema, "ungroup");
              handle.destroy();
            }}
          >
            {t("keep_tables")}
          </Button>
          <Button
            theme="solid"
            type="danger"
            onClick={() => {
              performDelete(schema, "withTables");
              handle.destroy();
            }}
          >
            {t("delete_tables")}
          </Button>
        </div>
      ),
    });
  };

  return confirmDeleteSchema;
}
