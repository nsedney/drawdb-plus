import { createContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { Action, ObjectType, defaultBlue } from "../data/constants";
import { useSelect, useUndoRedo } from "../hooks";

export const SchemasContext = createContext(null);

/*
 * Schemas are first-class objects { id (nanoid), name, color, hidden }. They
 * have no position/size — a schema's box on the canvas is always derived from
 * its member tables (tables reference it via `schemaId`). Unlike areas/notes,
 * schema ids are stable nanoid strings, so we never reindex them.
 */
export default function SchemasContextProvider({ children }) {
  const { t } = useTranslation();
  const [schemas, setSchemas] = useState([]);
  const { selectedElement, setSelectedElement } = useSelect();
  const { setUndoStack, setRedoStack } = useUndoRedo();

  const addSchema = (data, addToHistory = true) => {
    const newSchema = data ?? {
      id: nanoid(),
      name: `schema_${schemas.length}`,
      color: defaultBlue,
      hidden: false,
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
