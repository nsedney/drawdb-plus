import { createContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import {
  Action,
  ObjectType,
  defaultBlue,
  defaultSchemaSize,
} from "../data/constants";
import { useSelect, useUndoRedo, useTransform } from "../hooks";

export const SchemasContext = createContext(null);

/*
 * Schemas are first-class objects { id (nanoid), name, color, hidden } with a
 * stored canvas box { x, y, width, height }. The box is independent of the
 * member tables (tables reference the schema via `schemaId`); it is moved,
 * resized, and grown explicitly, and table membership is decided spatially on
 * drop. Unlike areas/notes, schema ids are stable nanoid strings, so we never
 * reindex them.
 */
export default function SchemasContextProvider({ children }) {
  const { t } = useTranslation();
  const [schemas, setSchemas] = useState([]);
  const { selectedElement, setSelectedElement } = useSelect();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { transform } = useTransform();

  const addSchema = (data, addToHistory = true) => {
    const newSchema = data ?? {
      id: nanoid(),
      name: `schema_${schemas.length}`,
      color: defaultBlue,
      hidden: false,
      x: transform.pan.x - defaultSchemaSize.width / 2,
      y: transform.pan.y - defaultSchemaSize.height / 2,
      width: defaultSchemaSize.width,
      height: defaultSchemaSize.height,
    };
    setSchemas((prev) => [...prev, newSchema]);
    if (addToHistory) {
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.ADD,
          element: ObjectType.SCHEMA,
          data: newSchema,
          message: t("add_schema"),
        },
      ]);
      setRedoStack([]);
    }
    return newSchema;
  };

  // Removes the schema object only. Callers are responsible for the member
  // tables (ungroup vs delete-with-tables) and for any combined undo entry.
  const deleteSchema = (id, addToHistory = true) => {
    const schema = schemas.find((s) => s.id === id);
    if (addToHistory && schema) {
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.DELETE,
          element: ObjectType.SCHEMA,
          data: schema,
          message: t("delete_schema", { schemaName: schema.name }),
        },
      ]);
      setRedoStack([]);
    }
    setSchemas((prev) => prev.filter((s) => s.id !== id));
    if (
      selectedElement.element === ObjectType.SCHEMA &&
      selectedElement.id === id
    ) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.NONE,
        id: -1,
        open: false,
      }));
    }
  };

  const updateSchema = (id, values) => {
    setSchemas((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...values } : s)),
    );
  };

  return (
    <SchemasContext.Provider
      value={{
        schemas,
        setSchemas,
        addSchema,
        updateSchema,
        deleteSchema,
        schemasCount: schemas.length,
      }}
    >
      {children}
    </SchemasContext.Provider>
  );
}
