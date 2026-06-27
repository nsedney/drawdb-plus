import { useEffect, useState } from "react";
import { Collapse, Button } from "@douyinfe/semi-ui";
import { IconEyeOpened, IconEyeClosed, IconPlus } from "@douyinfe/semi-icons";
import {
  useSelect,
  useDiagram,
  useSchemas,
  useSaveState,
  useLayout,
  useUndoRedo,
} from "../../../hooks";
import { Action, ObjectType, State } from "../../../data/constants";
import { useTranslation } from "react-i18next";
import { DragHandle } from "../../SortableList/DragHandle";
import { SortableList } from "../../SortableList/SortableList";
import { CylinderIcon } from "../../EditorCanvas/SchemaGroup";
import SearchBar from "./SearchBar";
import Empty from "../Empty";
import TableInfo from "./TableInfo";
import SchemaInfo from "./SchemaInfo";

export default function TablesTab() {
  const { tables, addTable, setTables } = useDiagram();
  const { schemas, addSchema } = useSchemas();
  const { selectedElement, setSelectedElement } = useSelect();
  const { t } = useTranslation();
  const { layout } = useLayout();
  const { setSaveState } = useSaveState();
  const [openSchemaIds, setOpenSchemaIds] = useState([]);

  // Expand a schema in the panel when it's opened from the canvas, without
  // collapsing any others that are already open.
  useEffect(() => {
    if (selectedElement.element === ObjectType.SCHEMA && selectedElement.open) {
      const id = `${selectedElement.id}`;
      setOpenSchemaIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, [selectedElement.element, selectedElement.id, selectedElement.open]);

  const ungrouped = tables.filter((tb) => !tb.schemaId);

  // Reorder only the subset of `tables` belonging to one schema (null =
  // ungrouped), leaving every other table at its global index. The flat
  // `tables` array is the canvas paint order, so this splices the reordered
  // members back into their original slots.
  const reorderWithin = (schemaId, newOrder) => {
    setTables((prev) => {
      const copy = prev.slice();
      const slots = [];
      prev.forEach((tb, i) => {
        if ((tb.schemaId ?? null) === schemaId) slots.push(i);
      });
      slots.forEach((slot, k) => {
        copy[slot] = newOrder[k];
      });
      return copy;
    });
    setSaveState(State.SAVING);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <div className="flex-1 min-w-40">
          <SearchBar tables={tables} />
        </div>
        <div className="flex gap-2 ml-auto">
          <Button
            icon={<IconPlus />}
            onClick={() => addTable()}
            disabled={layout.readOnly}
          >
            {t("add_table")}
          </Button>
          <Button
            icon={<IconPlus />}
            onClick={() => addSchema()}
            disabled={layout.readOnly}
          >
            {t("add_schema")}
          </Button>
        </div>
      </div>

      {schemas.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold opacity-60 mb-1 ms-1">
            {t("schemas")}
          </div>
          <Collapse
            activeKey={openSchemaIds}
            keepDOM={false}
            lazyRender
            onChange={(k) => {
              const next = Array.isArray(k) ? k : k ? [k] : [];
              const opened = next.find((id) => !openSchemaIds.includes(id));
              setOpenSchemaIds(next);
              if (opened) {
                setSelectedElement((prev) => ({
                  ...prev,
                  open: true,
                  id: opened,
                  element: ObjectType.SCHEMA,
                }));
              }
            }}
          >
            {schemas.map((s) => (
              <SchemaListItem
                key={s.id}
                schema={s}
                members={tables.filter((tb) => tb.schemaId === s.id)}
                onReorder={(newOrder) => reorderWithin(s.id, newOrder)}
              />
            ))}
          </Collapse>
        </div>
      )}

      {tables.length === 0 ? (
        <Empty title={t("no_tables")} text={t("no_tables_text")} />
      ) : (
        ungrouped.length > 0 && (
          <div className="mt-3">
            {schemas.length > 0 && (
              <div className="text-xs font-semibold opacity-60 mb-1 ms-1">
                {t("ungrouped_tables")}
              </div>
            )}
            <Collapse
              activeKey={
                selectedElement.open &&
                selectedElement.element === ObjectType.TABLE
                  ? `${selectedElement.id}`
                  : ""
              }
              keepDOM={false}
              lazyRender
              onChange={(k) =>
                setSelectedElement((prev) => ({
                  ...prev,
                  open: true,
                  id: Array.isArray(k) ? k[0] : k,
                  element: ObjectType.TABLE,
                }))
              }
              accordion
            >
              <SortableList
                keyPrefix="ungrouped-tables"
                items={ungrouped}
                onChange={(newOrder) => reorderWithin(null, newOrder)}
                renderItem={(item) => <TableListItem table={item} />}
              />
            </Collapse>
          </div>
        )
      )}
    </>
  );
}

function SchemaListItem({ schema, members, onReorder }) {
  const { updateSchema } = useSchemas();
  const { selectedElement, setSelectedElement } = useSelect();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { t } = useTranslation();

  const toggleHidden = (e) => {
    e.stopPropagation();
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.SCHEMA,
        sid: schema.id,
        undo: { hidden: schema.hidden },
        redo: { hidden: !schema.hidden },
        message: t("edit_schema", {
          schemaName: schema.name,
          extra: "[hidden]",
        }),
      },
    ]);
    setRedoStack([]);
    updateSchema(schema.id, { hidden: !schema.hidden });
  };

  return (
    <div id={`scroll_schema_${schema.id}`}>
      <Collapse.Panel
        className="relative"
        header={
          <div className="flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <CylinderIcon color={schema.color} />
              <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {schema.name}
              </div>
            </div>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={toggleHidden}
              icon={schema.hidden ? <IconEyeClosed /> : <IconEyeOpened />}
              className="me-2 shrink-0"
            />
            <div
              className="w-1 h-full absolute top-0 left-0 bottom-0"
              style={{ backgroundColor: schema.color }}
            />
          </div>
        }
        itemKey={`${schema.id}`}
      >
        <SchemaInfo data={schema}>
          {members.length > 0 && (
            <Collapse
              activeKey={
                selectedElement.open &&
                selectedElement.element === ObjectType.TABLE
                  ? `${selectedElement.id}`
                  : ""
              }
              keepDOM={false}
              lazyRender
              onChange={(k) =>
                setSelectedElement((prev) => ({
                  ...prev,
                  open: true,
                  id: Array.isArray(k) ? k[0] : k,
                  element: ObjectType.TABLE,
                }))
              }
              accordion
            >
              <SortableList
                keyPrefix={`schema-${schema.id}-tables`}
                items={members}
                onChange={(newOrder) => onReorder(newOrder)}
                renderItem={(item) => <TableListItem table={item} />}
              />
            </Collapse>
          )}
        </SchemaInfo>
      </Collapse.Panel>
    </div>
  );
}

function TableListItem({ table }) {
  const { layout } = useLayout();
  const { updateTable } = useDiagram();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { t } = useTranslation();

  const toggleTableVisibility = (e) => {
    e.stopPropagation();
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "self",
        tid: table.id,
        undo: { hidden: table.hidden },
        redo: { hidden: !table.hidden },
        message: t("edit_table", {
          tableName: table.name,
          extra: "[hidden]",
        }),
      },
    ]);
    setRedoStack([]);
    updateTable(table.id, { hidden: !table.hidden });
  };

  return (
    <div id={`scroll_table_${table.id}`}>
      <Collapse.Panel
        className="relative"
        header={
          <div className="flex items-center justify-between w-full min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <DragHandle readOnly={layout.readOnly} id={table.id} />
              <div className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {table.name}
              </div>
            </div>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={toggleTableVisibility}
              icon={table.hidden ? <IconEyeClosed /> : <IconEyeOpened />}
              className="me-2 shrink-0"
            />
            <div
              className="w-1 h-full absolute top-0 left-0 bottom-0"
              style={{ backgroundColor: table.color }}
            />
          </div>
        }
        itemKey={`${table.id}`}
      >
        <TableInfo data={table} />
      </Collapse.Panel>
    </div>
  );
}
