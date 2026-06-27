import { Collapse, Button } from "@douyinfe/semi-ui";
import { IconEyeOpened, IconEyeClosed } from "@douyinfe/semi-icons";
import { IconPlus } from "@douyinfe/semi-icons";
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
  const { schemas, addSchema, setSchemas } = useSchemas();
  const { selectedElement, setSelectedElement } = useSelect();
  const { t } = useTranslation();
  const { layout } = useLayout();
  const { setSaveState } = useSaveState();

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
        <Collapse
          className="mt-2"
          activeKey={
            selectedElement.open &&
            selectedElement.element === ObjectType.SCHEMA
              ? `${selectedElement.id}`
              : ""
          }
          keepDOM={false}
          lazyRender
          onChange={(k) =>
            setSelectedElement((prev) => ({
              ...prev,
              open: true,
              id: k[0],
              element: ObjectType.SCHEMA,
            }))
          }
          accordion
        >
          <SortableList
            keyPrefix="schemas-tab"
            items={schemas}
            onChange={(newSchemas) => setSchemas(newSchemas)}
            afterChange={() => setSaveState(State.SAVING)}
            renderItem={(item) => <SchemaListItem schema={item} />}
          />
        </Collapse>
      )}

      {tables.length === 0 ? (
        <Empty title={t("no_tables")} text={t("no_tables_text")} />
      ) : (
        <Collapse
          activeKey={
            selectedElement.open && selectedElement.element === ObjectType.TABLE
              ? `${selectedElement.id}`
              : ""
          }
          keepDOM={false}
          lazyRender
          onChange={(k) =>
            setSelectedElement((prev) => ({
              ...prev,
              open: true,
              id: k[0],
              element: ObjectType.TABLE,
            }))
          }
          accordion
        >
          <SortableList
            keyPrefix="tables-tab"
            items={tables}
            onChange={(newTables) => setTables(newTables)}
            afterChange={() => setSaveState(State.SAVING)}
            renderItem={(item) => <TableListItem table={item} />}
          />
        </Collapse>
      )}
    </>
  );
}

function SchemaListItem({ schema }) {
  const { layout } = useLayout();
  const { updateSchema } = useSchemas();
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
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 flex-1">
              <DragHandle readOnly={layout.readOnly} id={schema.id} />
              <CylinderIcon color={schema.color} />
              <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                {schema.name}
              </div>
            </div>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={toggleHidden}
              icon={schema.hidden ? <IconEyeClosed /> : <IconEyeOpened />}
              className="me-2"
            />
            <div
              className="w-1 h-full absolute top-0 left-0 bottom-0"
              style={{ backgroundColor: schema.color }}
            />
          </div>
        }
        itemKey={`${schema.id}`}
      >
        <SchemaInfo data={schema} />
      </Collapse.Panel>
    </div>
  );
}

function TableListItem({ table }) {
  const { layout } = useLayout();
  const { updateTable } = useDiagram();
  const { schemas } = useSchemas();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { t } = useTranslation();

  const schema = table.schemaId
    ? schemas.find((s) => s.id === table.schemaId)
    : null;

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
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 flex-1">
              <DragHandle readOnly={layout.readOnly} id={table.id} />
              <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                {table.name}
              </div>
              {schema && (
                <div
                  className="flex items-center gap-1 text-xs opacity-60 shrink-0"
                  title={schema.name}
                >
                  <CylinderIcon color="currentColor" size={11} />
                  <span className="max-w-16 truncate">{schema.name}</span>
                </div>
              )}
            </div>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={toggleTableVisibility}
              icon={table.hidden ? <IconEyeClosed /> : <IconEyeOpened />}
              className="me-2"
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
