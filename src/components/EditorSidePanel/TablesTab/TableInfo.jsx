import { useState, useRef } from "react";
import {
  Collapse,
  Input,
  TextArea,
  Button,
  Card,
  Select,
  Dropdown,
  Popover,
} from "@douyinfe/semi-ui";
import ColorPicker from "../ColorPicker";
import { IconDeleteStroked, IconPlus } from "@douyinfe/semi-icons";
import {
  useDiagram,
  useLayout,
  useSaveState,
  useSchemas,
  useSettings,
  useUndoRedo,
} from "../../../hooks";
import { CylinderIcon } from "../../EditorCanvas/SchemaGroup";
import {
  Action,
  ObjectType,
  State,
  DB,
  defaultBlue,
} from "../../../data/constants";
import {
  getSchemaBox,
  getSchemaRect,
  growSchemaBox,
} from "../../../utils/utils";
import TableField from "./TableField";
import IndexDetails from "./IndexDetails";
import UniqueConstraintDetails from "./UniqueConstraintDetails";
import { useTranslation } from "react-i18next";
import { SortableList } from "../../SortableList/SortableList";
import { nanoid } from "nanoid";

export default function TableInfo({ data }) {
  const { tables, database, relationships } = useDiagram();
  const { t } = useTranslation();
  const [indexActiveKey, setIndexActiveKey] = useState("");
  const [uniqueActiveKey, setUniqueActiveKey] = useState("");
  const [commentActiveKey, setCommentActiveKey] = useState("");
  const [showComment, setShowComment] = useState(false);
  const { layout } = useLayout();
  const { settings } = useSettings();
  const { deleteTable, updateTable, setTables } = useDiagram();
  const { schemas, addSchema, updateSchema } = useSchemas();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { setSaveState } = useSaveState();
  const [editField, setEditField] = useState({});
  const initialColorRef = useRef(data.color);

  // `createdSchemas` (used by createAndAssignSchema) folds a just-created schema
  // into this one undo entry, so undo removes both the assignment and the schema.
  const assignSchema = (schemaId, createdSchemas = []) => {
    if (schemaId === (data.schemaId ?? null)) return;
    const from = data.schemaId ?? null;

    // Joining a schema grows its box (grow-only) to contain the table at its
    // current canvas position — we never reposition the table, matching the
    // canvas drop behavior. Removing from a schema leaves boxes untouched.
    let boxChange = null;
    const target = schemaId ? schemas.find((s) => s.id === schemaId) : null;
    if (target) {
      const tablesAfter = tables.map((t) =>
        t.id === data.id ? { ...t, schemaId } : t,
      );
      const storedBox = getSchemaBox(target, tables, settings, relationships);
      const grown = growSchemaBox(target, tablesAfter, settings, relationships);
      if (
        grown &&
        storedBox &&
        (grown.x !== storedBox.x ||
          grown.y !== storedBox.y ||
          grown.width !== storedBox.width ||
          grown.height !== storedBox.height)
      ) {
        boxChange = { sid: schemaId, undo: storedBox, redo: grown };
      }
    }

    // One undoable step (reuses the bulk-move path: `elements` via updateTable,
    // `schemaBoxes` via updateSchema, `createdSchemas` via add/deleteSchema) so
    // undo reverts membership + box + any created schema together.
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.MOVE,
        bulk: true,
        bulkKind: "move",
        message: t("edit_table", { tableName: data.name, extra: "[schema]" }),
        elements: [
          {
            id: data.id,
            type: ObjectType.TABLE,
            undo: { schemaId: from },
            redo: { schemaId },
          },
        ],
        ...(boxChange ? { schemaBoxes: [boxChange] } : {}),
        ...(createdSchemas.length ? { createdSchemas } : {}),
      },
    ]);
    setRedoStack([]);
    updateTable(data.id, { schemaId });
    if (boxChange) updateSchema(boxChange.sid, boxChange.redo);
  };

  const createAndAssignSchema = () => {
    // Create the new schema with a box already fitted around this table, so it
    // encloses the table without a separate grow step. Create without its own
    // undo entry; assignSchema folds it into a single undoable step.
    const fitted = getSchemaRect(
      "tmp",
      tables.map((t) => (t.id === data.id ? { ...t, schemaId: "tmp" } : t)),
      settings,
      relationships,
    );
    const newSchema = {
      id: nanoid(),
      name: `schema_${schemas.length}`,
      color: defaultBlue,
      hidden: false,
      ...fitted,
    };
    addSchema(newSchema, false);
    assignSchema(newSchema.id, [newSchema]);
  };

  const handleColorPick = (color) => {
    setUndoStack((prev) => {
      let undoColor = initialColorRef.current;
      const lastColorChange = prev.findLast(
        (e) =>
          e.element === ObjectType.TABLE &&
          e.tid === data.id &&
          e.action === Action.EDIT &&
          e.redo?.color,
      );
      if (lastColorChange) {
        undoColor = lastColorChange.redo.color;
      }

      if (color === undoColor) return prev;

      const newStack = [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "self",
          tid: data.id,
          undo: { color: undoColor },
          redo: { color: color },
          message: t("edit_table", {
            tableName: data.name,
            extra: "[color]",
          }),
        },
      ];
      return newStack;
    });
    setRedoStack([]);
  };

  const inheritedFieldNames =
    Array.isArray(data.inherits) && data.inherits.length > 0
      ? data.inherits
          .map((parentName) => {
            const parent = tables.find((t) => t.name === parentName);
            return parent ? parent.fields.map((f) => f.name) : [];
          })
          .flat()
      : [];

  const addIndex = () => {
    setIndexActiveKey("1");
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "index_add",
        tid: data.id,
        message: t("edit_table", {
          tableName: data.name,
          extra: "[add index]",
        }),
      },
    ]);
    setRedoStack([]);
    updateTable(data.id, {
      indices: [
        ...data.indices,
        {
          id: data.indices.length,
          name: `${data.name}_index_${data.indices.length}`,
          unique: false,
          fields: [],
        },
      ],
    });
  };

  const addUniqueConstraint = () => {
    setUniqueActiveKey("1");
    const constraints = data.uniqueConstraints || [];
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "unique_constraint_add",
        tid: data.id,
        message: t("edit_table", {
          tableName: data.name,
          extra: "[add unique constraint]",
        }),
      },
    ]);
    setRedoStack([]);
    updateTable(data.id, {
      uniqueConstraints: [
        ...constraints,
        {
          id: constraints.length,
          name: `${data.name}_unique_${constraints.length}`,
          fields: [],
        },
      ],
    });
  };

  const addComment = () => {
    setShowComment(true);
    setCommentActiveKey("1");
  };

  return (
    <div>
      <div className="flex items-center mb-2.5">
        <div className="text-md font-semibold break-keep">{t("name")}:</div>
        <Input
          value={data.name}
          validateStatus={data.name.trim() === "" ? "error" : "default"}
          placeholder={t("name")}
          className="ms-2"
          readonly={layout.readOnly}
          onChange={(value) => updateTable(data.id, { name: value })}
          onFocus={(e) => setEditField({ name: e.target.value })}
          onBlur={(e) => {
            if (e.target.value === editField.name) return;
            setUndoStack((prev) => [
              ...prev,
              {
                action: Action.EDIT,
                element: ObjectType.TABLE,
                component: "self",
                tid: data.id,
                undo: editField,
                redo: { name: e.target.value },
                message: t("edit_table", {
                  tableName: e.target.value,
                  extra: "[name]",
                }),
              },
            ]);
            setRedoStack([]);
          }}
        />
      </div>

      <SortableList
        items={data.fields}
        keyPrefix={`table-${data.id}`}
        onChange={(newFields) =>
          setTables((prev) =>
            prev.map((t) =>
              t.id === data.id ? { ...t, fields: newFields } : t,
            ),
          )
        }
        afterChange={() => setSaveState(State.SAVING)}
        renderItem={(item, i) => (
          <TableField
            data={item}
            tid={data.id}
            index={i}
            inherited={inheritedFieldNames.includes(item.name)}
          />
        )}
      />

      {database === DB.POSTGRES && (
        <div className="mb-2">
          <div className="text-md font-semibold break-keep">
            {t("inherits")}:
          </div>
          <Select
            multiple
            value={data.inherits || []}
            optionList={tables
              .filter((t) => t.id !== data.id)
              .map((t) => ({ label: t.name, value: t.name }))}
            onChange={(value) => {
              if (layout.readOnly) return;

              setUndoStack((prev) => [
                ...prev,
                {
                  action: Action.EDIT,
                  element: ObjectType.TABLE,
                  component: "self",
                  tid: data.id,
                  undo: { inherits: data.inherits },
                  redo: { inherits: value },
                  message: t("edit_table", {
                    tableName: data.name,
                    extra: "[inherits]",
                  }),
                },
              ]);
              setRedoStack([]);
              updateTable(data.id, { inherits: value });
            }}
            placeholder={t("inherits")}
            className="w-full"
          />
        </div>
      )}

      {data.indices.length > 0 && (
        <Card
          bodyStyle={{ padding: "4px" }}
          style={{ marginTop: "12px", marginBottom: "12px" }}
          headerLine={false}
        >
          <Collapse
            activeKey={indexActiveKey}
            keepDOM={false}
            lazyRender
            onChange={(itemKey) => setIndexActiveKey(itemKey)}
            accordion
          >
            <Collapse.Panel header={t("indices")} itemKey="1">
              {data.indices.map((idx, k) => (
                <IndexDetails
                  key={"index_" + k}
                  data={idx}
                  iid={k}
                  tid={data.id}
                  fields={data.fields.map((e) => ({
                    value: e.name,
                    label: e.name,
                  }))}
                />
              ))}
            </Collapse.Panel>
          </Collapse>
        </Card>
      )}

      {(data.uniqueConstraints || []).length > 0 && (
        <Card
          bodyStyle={{ padding: "4px" }}
          style={{ marginTop: "12px", marginBottom: "12px" }}
          headerLine={false}
        >
          <Collapse
            activeKey={uniqueActiveKey}
            keepDOM={false}
            lazyRender
            onChange={(itemKey) => setUniqueActiveKey(itemKey)}
            accordion
          >
            <Collapse.Panel header={t("unique_constraints")} itemKey="1">
              {data.uniqueConstraints.map((uc, k) => (
                <UniqueConstraintDetails
                  key={"unique_constraint_" + k}
                  data={uc}
                  cid={k}
                  tid={data.id}
                  fields={data.fields.map((e) => ({
                    value: e.name,
                    label: e.name,
                  }))}
                />
              ))}
            </Collapse.Panel>
          </Collapse>
        </Card>
      )}

      {((data.comment && data.comment.trim() !== "") || showComment) && (
        <Card
          bodyStyle={{ padding: "4px" }}
          style={{ marginTop: "12px", marginBottom: "12px" }}
          headerLine={false}
        >
          <Collapse
            activeKey={commentActiveKey}
            onChange={(itemKey) => setCommentActiveKey(itemKey)}
            keepDOM={false}
            lazyRender
            accordion
          >
            <Collapse.Panel header={t("comment")} itemKey="1">
              <TextArea
                field="comment"
              value={data.comment}
              readonly={layout.readOnly}
              autosize
              placeholder={t("comment")}
              rows={1}
              onChange={(value) =>
                updateTable(data.id, { comment: value }, false)
              }
              onFocus={(e) => setEditField({ comment: e.target.value })}
              onBlur={(e) => {
                if (e.target.value === editField.comment) return;
                setUndoStack((prev) => [
                  ...prev,
                  {
                    action: Action.EDIT,
                    element: ObjectType.TABLE,
                    component: "self",
                    tid: data.id,
                    undo: editField,
                    redo: { comment: e.target.value },
                    message: t("edit_table", {
                      tableName: e.target.value,
                      extra: "[comment]",
                    }),
                  },
                ]);
                setRedoStack([]);
              }}
              />
            </Collapse.Panel>
          </Collapse>
        </Card>
      )}

      <div className="flex justify-between items-center gap-1 mt-5 mb-2">
        <div className="flex items-center gap-1">
        <ColorPicker
          usePopover={true}
          readOnly={layout.readOnly}
          value={data.color}
          onChange={(color) => updateTable(data.id, { color })}
          onColorPick={(color) => handleColorPick(color)}
        />
        <Popover
          trigger="click"
          position="bottomLeft"
          showArrow
          content={
            <div className="popover-theme flex flex-col gap-1 p-1 w-52 max-h-60 overflow-y-auto">
              {schemas.map((s) => (
                <Button
                  key={s.id}
                  block
                  theme="borderless"
                  type="tertiary"
                  style={{ justifyContent: "flex-start" }}
                  icon={<CylinderIcon color={s.color} />}
                  onClick={() => assignSchema(s.id)}
                  disabled={layout.readOnly}
                >
                  {s.name}
                  {data.schemaId === s.id ? " ✓" : ""}
                </Button>
              ))}
              {data.schemaId && (
                <Button
                  block
                  theme="borderless"
                  type="tertiary"
                  style={{ justifyContent: "flex-start" }}
                  onClick={() => assignSchema(null)}
                  disabled={layout.readOnly}
                >
                  {t("remove_from_schema")}
                </Button>
              )}
              <Button
                block
                theme="borderless"
                type="tertiary"
                style={{ justifyContent: "flex-start" }}
                icon={<IconPlus />}
                onClick={createAndAssignSchema}
                disabled={layout.readOnly}
              >
                {t("create_schema")}
              </Button>
            </div>
          }
        >
          <Button
            icon={<CylinderIcon color="currentColor" />}
            disabled={layout.readOnly}
            title={t("schema")}
          />
        </Popover>
        </div>
        <div className="flex gap-1">
          <Dropdown
            position="bottomLeft"
            trigger="click"
            render={
              <Dropdown.Menu>
                <Dropdown.Item onClick={addComment}>
                  {t("add_comment")}
                </Dropdown.Item>
                <Dropdown.Item onClick={addUniqueConstraint}>
                  {t("add_unique_constraint")}
                </Dropdown.Item>
                <Dropdown.Item onClick={addIndex}>
                  {t("add_index")}
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Button
              icon={<IconPlus />}
              disabled={layout.readOnly}
              title={t("add")}
            />
          </Dropdown>
          <Button
            block
            disabled={layout.readOnly}
            onClick={() => {
              const id = nanoid();
              setUndoStack((prev) => [
                ...prev,
                {
                  action: Action.EDIT,
                  element: ObjectType.TABLE,
                  component: "field_add",
                  tid: data.id,
                  fid: id,
                  message: t("edit_table", {
                    tableName: data.name,
                    extra: "[add field]",
                  }),
                },
              ]);
              setRedoStack([]);
              updateTable(data.id, {
                fields: [
                  ...data.fields,
                  {
                    id,
                    name: "",
                    type: "",
                    default: "",
                    check: "",
                    primary: false,
                    unique: false,
                    notNull: false,
                    increment: false,
                    comment: "",
                  },
                ],
              });
            }}
          >
            {t("add_field")}
          </Button>
          <Button
            type="danger"
            disabled={layout.readOnly}
            icon={<IconDeleteStroked />}
            onClick={() => deleteTable(data.id)}
          />
        </div>
      </div>
    </div>
  );
}
