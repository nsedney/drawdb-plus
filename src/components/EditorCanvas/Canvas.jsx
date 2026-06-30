import { useEffect, useRef, useState } from "react";
import { Slot } from "../../context/ExtensionsContext";
import {
  Action,
  Cardinality,
  Constraint,
  darkBgTheme,
  ObjectType,
  gridSize,
  gridCircleRadius,
  minAreaSize,
} from "../../data/constants";
import { Toast } from "@douyinfe/semi-ui";
import Table from "./Table";
import Area from "./Area";
import Relationship from "./Relationship";
import Note from "./Note";
import SchemaGroup from "./SchemaGroup";
import {
  useCanvas,
  useSettings,
  useTransform,
  useDiagram,
  useUndoRedo,
  useSelect,
  useAreas,
  useSchemas,
  useNotes,
  useLayout,
  useSaveState,
  useCollab,
} from "../../hooks";
import { useTranslation } from "react-i18next";
import { useEventListener } from "usehooks-ts";
import {
  areFieldsCompatible,
  getTableHeight,
  getSchemaRect,
  getSchemaBox,
  unionRect,
} from "../../utils/utils";
import {
  getRectFromEndpoints,
  isInsideRect,
  isPointInRect,
} from "../../utils/rect";
import {
  State,
  noteWidth,
  minSchemaSize,
} from "../../data/constants";
import { nanoid } from "nanoid";

export default function Canvas() {
  const { t } = useTranslation();

  const canvasRef = useRef(null);
  const canvasContextValue = useCanvas();
  const {
    canvas: { viewBox },
    pointer,
  } = canvasContextValue;

  const { tables, updateTable, relationships, addRelationship, database } =
    useDiagram();
  const { setSaveState } = useSaveState();
  const { areas, updateArea } = useAreas();
  const { schemas, updateSchema } = useSchemas();
  const { notes, updateNote } = useNotes();
  const { layout } = useLayout();
  const { settings } = useSettings();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { transform, setTransform } = useTransform();
  const {
    selectedElement,
    setSelectedElement,
    bulkSelectedElements,
    setBulkSelectedElements,
  } = useSelect();
  const notDragging = {
    id: -1,
    type: ObjectType.NONE,
    grabOffset: { x: 0, y: 0 },
  };
  const [dragging, setDragging] = useState(notDragging);
  // Schema ids whose box a currently-dragged table would join/stay in on drop
  // (highlighted as the drop endpoint), and origin schemas a table is being
  // dragged out of (shaded lighter to flag the drag-out).
  const [dropTargetSchemaIds, setDropTargetSchemaIds] = useState([]);
  const [exitSchemaIds, setExitSchemaIds] = useState([]);
  const [linking, setLinking] = useState(false);
  const [linkingLine, setLinkingLine] = useState({
    startTableId: -1,
    startFieldId: -1,
    endTableId: -1,
    endFieldId: -1,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
  const { emitAwareness } = useCollab();
  const lastLinkingRef = useRef(false);
  const rightClickPanned = useRef(false);

  useEffect(() => {
    if (linking) {
      emitAwareness({
        linking: {
          startX: linkingLine.startX,
          startY: linkingLine.startY,
          endX: linkingLine.endX,
          endY: linkingLine.endY,
        },
      });
      lastLinkingRef.current = true;
    } else if (lastLinkingRef.current) {
      emitAwareness({ linking: null });
      lastLinkingRef.current = false;
    }
  }, [
    linking,
    linkingLine.startX,
    linkingLine.startY,
    linkingLine.endX,
    linkingLine.endY,
    emitAwareness,
  ]);
  const [hoveredTable, setHoveredTable] = useState({
    tableId: null,
    fieldId: null,
  });
  const [panning, setPanning] = useState({
    isPanning: false,
    panStart: { x: 0, y: 0 },
    cursorStart: { x: 0, y: 0 },
  });
  const [areaResize, setAreaResize] = useState({ id: -1, dir: "none" });
  const [areaInitDimensions, setAreaInitDimensions] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  // Manual schema-box resize. `initBox` is the box geometry captured at grab
  // time (restored on undo); `minRect` is the table-derived rect the box must
  // keep containing, so dragging a handle inward stops at the tables.
  const [schemaResize, setSchemaResize] = useState({ id: null, dir: "none" });
  const schemaResizeRef = useRef({ initBox: null, minRect: null });
  const [bulkSelectRect, setBulkSelectRect] = useState({
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    show: false,
    ctrlKey: false,
    metaKey: false,
  });
  // this is used to store the element that is clicked on
  // at the moment, and shouldn't be a part of the state
  let elementPointerDown = null;

  const isSameElement = (el1, el2) => {
    return el1.id === el2.id && el1.type === el2.type;
  };

  const collectSelectedElements = () => {
    const rect = getRectFromEndpoints(bulkSelectRect);
    const elements = [];
    const shouldAddElement = (elementRect, element) => {
      // if ctrl key is pressed, only add the elements that are not already selected
      // can theoretically be optimized later if the selected elements is
      // a map from id to element (after the ids are made unique)
      return (
        isInsideRect(elementRect, rect) &&
        ((!bulkSelectRect.ctrlKey && !bulkSelectRect.metaKey) ||
          !bulkSelectedElements.some((el) => isSameElement(el, element)))
      );
    };

    tables.forEach((table) => {
      if (table.locked) return;

      const element = {
        id: table.id,
        type: ObjectType.TABLE,
        currentCoords: { x: table.x, y: table.y },
        initialCoords: { x: table.x, y: table.y },
      };
      const tableRect = {
        x: table.x,
        y: table.y,
        width: settings.tableWidth,
        height: getTableHeight(
          table,
          settings.tableWidth,
          settings.showComments,
          relationships,
        ),
      };
      if (shouldAddElement(tableRect, element)) {
        elements.push(element);
      }
    });

    areas.forEach((area) => {
      if (area.locked) return;

      const element = {
        id: area.id,
        type: ObjectType.AREA,
        currentCoords: { x: area.x, y: area.y },
        initialCoords: { x: area.x, y: area.y },
      };
      const areaRect = {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
      };
      if (shouldAddElement(areaRect, element)) {
        elements.push(element);
      }
    });

    notes.forEach((note) => {
      if (note.locked) return;

      const element = {
        id: note.id,
        type: ObjectType.NOTE,
        currentCoords: { x: note.x, y: note.y },
        initialCoords: { x: note.x, y: note.y },
      };
      const noteRect = {
        x: note.x,
        y: note.y,
        width: note.width ?? noteWidth,
        height: note.height,
      };
      if (shouldAddElement(noteRect, element)) {
        elements.push(element);
      }
    });

    if (bulkSelectRect.ctrlKey || bulkSelectRect.metaKey) {
      setBulkSelectedElements([...bulkSelectedElements, ...elements]);
    } else {
      setBulkSelectedElements(elements);
    }
  };

  const handlePointerDownOnElement = (e, { element, type }) => {
    if (selectedElement.open && !layout.sidebar) return;

    if (!e.isPrimary) return;

    // Dragging a schema group moves the box and all its member tables together.
    // Seed the bulk-move machinery with the schema (as the anchor) plus every
    // member; the box tracks the cursor and members move rigidly with it. No
    // membership reassignment happens on a group drag (see handlePointerUp).
    if (type === ObjectType.SCHEMA) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.SCHEMA,
        id: element.id,
        open: false,
      }));
      const box = getSchemaBox(element, tables, settings, relationships);
      if (!box) return;
      const members = tables.filter((t) => t.schemaId === element.id);
      setBulkSelectedElements([
        {
          id: element.id,
          type: ObjectType.SCHEMA,
          currentCoords: { x: box.x, y: box.y },
          initialCoords: { x: box.x, y: box.y },
        },
        ...members.map((t) => ({
          id: t.id,
          type: ObjectType.TABLE,
          currentCoords: { x: t.x, y: t.y },
          initialCoords: { x: t.x, y: t.y },
        })),
      ]);
      setDragging({
        id: element.id,
        type: ObjectType.SCHEMA,
        grabOffset: {
          x: pointer.spaces.diagram.x - box.x,
          y: pointer.spaces.diagram.y - box.y,
        },
      });
      return;
    }

    if (!element.locked || !(e.ctrlKey || e.metaKey)) {
      setSelectedElement((prev) => ({
        ...prev,
        element: type,
        id: element.id,
        open: false,
      }));
    }

    if (element.locked) {
      if (!(e.ctrlKey || e.metaKey)) {
        setBulkSelectedElements([]);
      }
      return;
    }

    setBulkSelectRect((prev) => ({
      ...prev,
      show: false,
    }));

    // this is the object that will be added to the bulk selected elements
    // if necessary
    const elementInBulk = {
      id: element.id,
      type,
      currentCoords: { x: element.x, y: element.y },
      initialCoords: { x: element.x, y: element.y },
    };

    const isSelected = bulkSelectedElements.some((el) =>
      isSameElement(el, elementInBulk),
    );

    if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        if (bulkSelectedElements.length > 1) {
          setBulkSelectedElements(
            bulkSelectedElements.filter(
              (el) => !isSameElement(el, elementInBulk),
            ),
          );
          setSelectedElement({
            ...selectedElement,
            element: ObjectType.NONE,
            id: -1,
            open: false,
          });
        }
      } else {
        setBulkSelectedElements([...bulkSelectedElements, elementInBulk]);
      }
      setDragging(notDragging);
      return;
    }

    if (!isSelected) {
      setBulkSelectedElements([elementInBulk]);
    }
    setDragging({
      id: element.id,
      type,
      grabOffset: {
        x: pointer.spaces.diagram.x - element.x,
        y: pointer.spaces.diagram.y - element.y,
      },
    });
  };

  const coordinatesAfterSnappingToGrid = ({ x, y }) => {
    if (settings.snapToGrid) {
      return {
        x: Math.round(x / gridSize) * gridSize,
        y: Math.round(y / gridSize) * gridSize,
      };
    }
    return { x, y };
  };

  // The schema whose stored box contains a point, or null. On overlap the
  // smallest-area box wins (most specific). Drives drop membership + the
  // drag-over highlight.
  const findContainingSchemaId = (cx, cy) => {
    let best = null;
    let bestArea = Infinity;
    for (const s of schemas) {
      const box = getSchemaBox(s, tables, settings, relationships);
      if (!box || !isPointInRect(cx, cy, box)) continue;
      const area = box.width * box.height;
      if (area < bestArea) {
        bestArea = area;
        best = s.id;
      }
    }
    return best;
  };

  const handleSchemaResizeStart = (e, schemaId, dir) => {
    const schema = schemas.find((s) => s.id === schemaId);
    const box = getSchemaBox(schema, tables, settings, relationships);
    if (!box) return;
    schemaResizeRef.current = {
      initBox: box,
      // The box must keep containing its members; null for an empty schema.
      minRect: getSchemaRect(schemaId, tables, settings, relationships),
    };
    setSchemaResize({ id: schemaId, dir });
  };

  /**
   * @param {PointerEvent} e
   */
  const handlePointerMove = (e) => {
    if (selectedElement.open && !layout.sidebar) return;

    if (!e.isPrimary) return;

    if (panning.isPanning) {
      setTransform((prev) => ({
        ...prev,
        pan: {
          x:
            panning.panStart.x +
            (panning.cursorStart.x - pointer.spaces.screen.x) / transform.zoom,
          y:
            panning.panStart.y +
            (panning.cursorStart.y - pointer.spaces.screen.y) / transform.zoom,
        },
      }));
      return;
    }

    if (layout.readOnly) return;

    if (linking) {
      setLinkingLine({
        ...linkingLine,
        endX: pointer.spaces.diagram.x,
        endY: pointer.spaces.diagram.y,
      });
      return;
    }

    if (isDragging()) {
      const { x: mainElementFinalX, y: mainElementFinalY } =
        coordinatesAfterSnappingToGrid({
          x: pointer.spaces.diagram.x - dragging.grabOffset.x,
          y: pointer.spaces.diagram.y - dragging.grabOffset.y,
        });

      const { currentCoords } = bulkSelectedElements.find((el) =>
        isSameElement(el, dragging),
      );

      const deltaX = mainElementFinalX - currentCoords.x;
      const deltaY = mainElementFinalY - currentCoords.y;

      const newBulkSelectedElements = [];
      bulkSelectedElements.forEach((el) => {
        const elementFinalCoords = {
          x: el.currentCoords.x + deltaX,
          y: el.currentCoords.y + deltaY,
        };
        if (el.type === ObjectType.TABLE) {
          updateTable(el.id, { ...elementFinalCoords });
        }
        if (el.type === ObjectType.AREA) {
          updateArea(el.id, { ...elementFinalCoords });
        }
        if (el.type === ObjectType.NOTE) {
          updateNote(el.id, { ...elementFinalCoords });
        }
        if (el.type === ObjectType.SCHEMA) {
          updateSchema(el.id, { ...elementFinalCoords });
        }
        newBulkSelectedElements.push({
          ...el,
          currentCoords: elementFinalCoords,
        });
      });

      setBulkSelectedElements(newBulkSelectedElements);

      // Highlight schemas the drag affects (skipped for a group drag, which
      // never reassigns). `hovered` = the box a table would drop into (its
      // origin while still inside it, so the source reads as an active
      // endpoint, or a new box once over one). `exiting` = a table's origin
      // once its center has left that box, shaded lighter to flag drag-out.
      let hovered = [];
      let exiting = [];
      if (schemas.length > 0 && dragging.type !== ObjectType.SCHEMA) {
        newBulkSelectedElements.forEach((el) => {
          if (el.type !== ObjectType.TABLE) return;
          const table = tables.find((t) => t.id === el.id);
          if (!table) return;
          const cx = el.currentCoords.x + settings.tableWidth / 2;
          const cy =
            el.currentCoords.y +
            getTableHeight(
              table,
              settings.tableWidth,
              settings.showComments,
              relationships,
            ) /
              2;
          const hit = findContainingSchemaId(cx, cy);
          const origin = table.schemaId ?? null;
          if (hit && !hovered.includes(hit)) hovered.push(hit);
          if (origin && hit !== origin && !exiting.includes(origin)) {
            exiting.push(origin);
          }
        });
      }
      const sameSet = (a, b) =>
        a.length === b.length && a.every((id) => b.includes(id));
      setDropTargetSchemaIds((prev) => (sameSet(prev, hovered) ? prev : hovered));
      setExitSchemaIds((prev) => (sameSet(prev, exiting) ? prev : exiting));
      return;
    }

    if (schemaResize.id) {
      setPanning((old) => ({ ...old, isPanning: false }));
      const { initBox, minRect } = schemaResizeRef.current;
      if (!initBox) return;
      const { x, y } = coordinatesAfterSnappingToGrid(pointer.spaces.diagram);
      const dir = schemaResize.dir;
      // Move only the dragged edges; the opposite edges stay put. Each dragged
      // edge is clamped so the box keeps a minimum size and never crosses into
      // the member tables' bounding box (minRect, null when the schema is empty).
      let L = initBox.x;
      let T = initBox.y;
      let R = initBox.x + initBox.width;
      let B = initBox.y + initBox.height;
      if (dir.includes("l")) {
        L = Math.min(x, R - minSchemaSize, minRect ? minRect.x : Infinity);
      }
      if (dir.includes("r")) {
        R = Math.max(
          x,
          L + minSchemaSize,
          minRect ? minRect.x + minRect.width : -Infinity,
        );
      }
      if (dir.includes("t")) {
        T = Math.min(y, B - minSchemaSize, minRect ? minRect.y : Infinity);
      }
      if (dir.includes("b")) {
        B = Math.max(
          y,
          T + minSchemaSize,
          minRect ? minRect.y + minRect.height : -Infinity,
        );
      }
      updateSchema(schemaResize.id, {
        x: L,
        y: T,
        width: R - L,
        height: B - T,
      });
      return;
    }

    if (areaResize.id !== -1) {
      if (areaResize.dir === "none") return;
      let newDims = { ...areaInitDimensions };
      setPanning((old) => ({ ...old, isPanning: false }));
      const { x, y } = coordinatesAfterSnappingToGrid(pointer.spaces.diagram);

      switch (areaResize.dir) {
        case "br":
          newDims.width = x - areaInitDimensions.x;
          newDims.height = y - areaInitDimensions.y;
          break;
        case "tl":
          newDims.x = x;
          newDims.y = y;
          newDims.width = areaInitDimensions.width - (x - areaInitDimensions.x);
          newDims.height =
            areaInitDimensions.height - (y - areaInitDimensions.y);
          break;
        case "tr":
          newDims.y = y;
          newDims.width = x - areaInitDimensions.x;
          newDims.height =
            areaInitDimensions.height - (y - areaInitDimensions.y);
          break;
        case "bl":
          newDims.x = x;
          newDims.width = areaInitDimensions.width - (x - areaInitDimensions.x);
          newDims.height = y - areaInitDimensions.y;
          break;
      }

      if (newDims.width <= minAreaSize) {
        newDims.width = minAreaSize;
        if (areaResize.dir === "tl" || areaResize.dir === "bl") {
          newDims.x =
            areaInitDimensions.x + areaInitDimensions.width - minAreaSize;
        }
      }

      if (newDims.height <= minAreaSize) {
        newDims.height = minAreaSize;
        if (areaResize.dir === "tl" || areaResize.dir === "tr") {
          newDims.y =
            areaInitDimensions.y + areaInitDimensions.height - minAreaSize;
        }
      }

      updateArea(areaResize.id, { ...newDims });
      return;
    }

    if (bulkSelectRect.show) {
      setBulkSelectRect((prev) => ({
        ...prev,
        x2: pointer.spaces.diagram.x,
        y2: pointer.spaces.diagram.y,
      }));
    }
  };

  /**
   * @param {PointerEvent} e
   */
  const handlePointerDown = (e) => {
    if (!e.isPrimary) return;

    // don't pan if the sidesheet for editing a table is open
    if (
      selectedElement.element === ObjectType.TABLE &&
      selectedElement.open &&
      !layout.sidebar
    )
      return;

    const isMouseLeftButton = e.button === 0;
    const isMouseMiddleButton = e.button === 1;
    const isMouseRightButton = e.button === 2;

    if (isMouseLeftButton) {
      setBulkSelectRect({
        x1: pointer.spaces.diagram.x,
        y1: pointer.spaces.diagram.y,
        x2: pointer.spaces.diagram.x,
        y2: pointer.spaces.diagram.y,
        show: elementPointerDown === null || !elementPointerDown.element.locked,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
      });
      if (elementPointerDown !== null) {
        handlePointerDownOnElement(e, elementPointerDown);
      }
      pointer.setStyle("crosshair");
    } else if (isMouseMiddleButton || isMouseRightButton) {
      if (isMouseRightButton) rightClickPanned.current = false;
      setPanning({
        isPanning: true,
        panStart: transform.pan,
        // Diagram space depends on the current panning.
        // Use screen space to avoid circular dependencies and undefined behavior.
        cursorStart: pointer.spaces.screen,
      });
      pointer.setStyle("grabbing");
    }
  };

  const isDragging = () => {
    return dragging.type !== ObjectType.NONE && dragging.id !== -1;
  };

  const didDrag = () => {
    if (!isDragging()) return false;
    // checking any element is sufficient
    const { currentCoords, initialCoords } = bulkSelectedElements[0];
    return (
      currentCoords.x !== initialCoords.x || currentCoords.y !== initialCoords.y
    );
  };

  const didResize = (id) => {
    return !(
      areas[id].x === areaInitDimensions.x &&
      areas[id].y === areaInitDimensions.y &&
      areas[id].width === areaInitDimensions.width &&
      areas[id].height === areaInitDimensions.height
    );
  };

  const didPan = () =>
    !(
      transform.pan.x === panning.panStart.x &&
      transform.pan.y === panning.panStart.y
    );

  /**
   * @param {PointerEvent} e
   */
  const handlePointerUp = (e) => {
    if (selectedElement.open && !layout.sidebar) return;

    if (!e.isPrimary) return;

    if (didDrag()) {
      const isGroupDrag = dragging.type === ObjectType.SCHEMA;

      // Membership on drop (individual / marquee table drag only): a table whose
      // center lands inside a schema box joins it; outside every box → ungrouped
      // ("public"). A group drag never reassigns — the box moved with its tables.
      const schemaChanges = {}; // tableId -> { from, to }
      if (!isGroupDrag && schemas.length > 0) {
        bulkSelectedElements.forEach((el) => {
          if (el.type !== ObjectType.TABLE) return;
          const table = tables.find((t) => t.id === el.id);
          if (!table) return;
          const cx = el.currentCoords.x + settings.tableWidth / 2;
          const cy =
            el.currentCoords.y +
            getTableHeight(
              table,
              settings.tableWidth,
              settings.showComments,
              relationships,
            ) /
              2;
          const to = findContainingSchemaId(cx, cy) ?? null;
          const from = table.schemaId ?? null;
          if (to !== from) schemaChanges[el.id] = { from, to };
        });
      }

      // Post-drag view (final coords + new schemaIds) used to size boxes.
      const finalTables = tables.map((t) => {
        const el = bulkSelectedElements.find(
          (b) => b.type === ObjectType.TABLE && b.id === t.id,
        );
        const change = schemaChanges[t.id];
        if (!el && !change) return t;
        return {
          ...t,
          ...(el ? { x: el.currentCoords.x, y: el.currentCoords.y } : {}),
          ...(change ? { schemaId: change.to } : {}),
        };
      });

      // Box geometry changes: a group drag translates the box; otherwise grow
      // (never shrink) each affected schema to contain its members.
      const schemaBoxChanges = {}; // sid -> { from, to } geometry
      if (isGroupDrag) {
        const el = bulkSelectedElements.find(
          (b) => b.type === ObjectType.SCHEMA,
        );
        if (el) {
          const s = schemas.find((sc) => sc.id === el.id);
          const box = getSchemaBox(s, tables, settings, relationships);
          if (box) {
            schemaBoxChanges[el.id] = {
              from: { ...box, x: el.initialCoords.x, y: el.initialCoords.y },
              to: { ...box, x: el.currentCoords.x, y: el.currentCoords.y },
            };
          }
        }
      } else {
        const affected = new Set();
        bulkSelectedElements.forEach((el) => {
          if (el.type !== ObjectType.TABLE) return;
          const finalSid = schemaChanges[el.id]
            ? schemaChanges[el.id].to
            : (tables.find((t) => t.id === el.id)?.schemaId ?? null);
          if (finalSid) affected.add(finalSid);
        });
        affected.forEach((sid) => {
          const s = schemas.find((sc) => sc.id === sid);
          const storedBox = getSchemaBox(s, tables, settings, relationships);
          const derived = getSchemaRect(sid, finalTables, settings, relationships);
          const grown = unionRect(storedBox, derived);
          if (!grown) return;
          const from = storedBox ?? { ...grown };
          if (
            from.x !== grown.x ||
            from.y !== grown.y ||
            from.width !== grown.width ||
            from.height !== grown.height
          ) {
            schemaBoxChanges[sid] = { from, to: { ...grown } };
          }
        });
      }

      const elements = bulkSelectedElements
        .filter((el) => el.type !== ObjectType.SCHEMA)
        .map((el) => {
          const change = schemaChanges[el.id];
          return {
            id: el.id,
            type: el.type,
            undo: change
              ? { ...el.initialCoords, schemaId: change.from }
              : el.initialCoords,
            redo: change
              ? { ...el.currentCoords, schemaId: change.to }
              : el.currentCoords,
          };
        });
      const schemaBoxes = Object.entries(schemaBoxChanges).map(
        ([sid, c]) => ({ sid, undo: c.from, redo: c.to }),
      );

      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.MOVE,
          bulk: true,
          message: t("bulk_update"),
          elements,
          ...(schemaBoxes.length ? { schemaBoxes } : {}),
        },
      ]);
      setRedoStack([]);
      setBulkSelectedElements((prev) =>
        prev.map((el) => ({
          ...el,
          initialCoords: { ...el.currentCoords },
        })),
      );

      // Positions were applied live during the drag; apply membership + box
      // geometry now (the undo entry above already records them).
      Object.entries(schemaChanges).forEach(([id, change]) => {
        updateTable(id, { schemaId: change.to });
      });
      schemaBoxes.forEach(({ sid, redo }) => updateSchema(sid, redo));
    }

    if (dropTargetSchemaIds.length > 0) setDropTargetSchemaIds([]);
    if (exitSchemaIds.length > 0) setExitSchemaIds([]);

    // Grabbing a schema temporarily puts all its member tables in the bulk
    // selection (so the group moves together). Clear it on pointer-up — whether
    // or not a drag happened — so individual member tables stay independently
    // draggable afterward. The schema itself stays the selected element, and a
    // marquee multi-select (selectedElement !== SCHEMA) is left intact.
    if (selectedElement.element === ObjectType.SCHEMA) {
      setBulkSelectedElements([]);
    }

    if (bulkSelectRect.show) {
      setBulkSelectRect((prev) => ({
        ...prev,
        x2: pointer.spaces.diagram.x,
        y2: pointer.spaces.diagram.y,
        show: false,
      }));
      if (!isDragging()) {
        collectSelectedElements();
      }
    }
    setDragging(notDragging);

    if (panning.isPanning && didPan()) {
      setSaveState(State.SAVING);
      if (e.button === 2) rightClickPanned.current = true;
    }
    setPanning((old) => ({ ...old, isPanning: false }));
    pointer.setStyle("default");

    if (linking) handleLinking();
    setLinking(false);

    if (areaResize.id !== -1 && didResize(areaResize.id)) {
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.AREA,
          aid: areaResize.id,
          undo: {
            ...areas[areaResize.id],
            x: areaInitDimensions.x,
            y: areaInitDimensions.y,
            width: areaInitDimensions.width,
            height: areaInitDimensions.height,
          },
          redo: areas[areaResize.id],
          message: t("edit_area", {
            areaName: areas[areaResize.id].name,
            extra: "[resize]",
          }),
        },
      ]);
      setRedoStack([]);
    }
    setAreaResize({ id: -1, dir: "none" });
    setAreaInitDimensions({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });

    if (schemaResize.id) {
      const schema = schemas.find((s) => s.id === schemaResize.id);
      const initBox = schemaResizeRef.current.initBox;
      const finalBox = getSchemaBox(schema, tables, settings, relationships);
      const changed =
        initBox &&
        finalBox &&
        (initBox.x !== finalBox.x ||
          initBox.y !== finalBox.y ||
          initBox.width !== finalBox.width ||
          initBox.height !== finalBox.height);
      if (changed) {
        setUndoStack((prev) => [
          ...prev,
          {
            action: Action.EDIT,
            element: ObjectType.SCHEMA,
            sid: schemaResize.id,
            undo: { ...initBox },
            redo: { ...finalBox },
            message: t("edit_schema", {
              schemaName: schema.name,
              extra: "[resize]",
            }),
          },
        ]);
        setRedoStack([]);
        setSaveState(State.SAVING);
      }
      setSchemaResize({ id: null, dir: "none" });
      schemaResizeRef.current = { initBox: null, minRect: null };
    }
  };

  const handleGripField = () => {
    setPanning((old) => ({ ...old, isPanning: false }));
    setDragging(notDragging);
    setLinking(true);
  };

  const getCardinality = (startField, endField) => {
    const startIsUnique = startField.unique || startField.primary;
    const endIsUnique = endField.unique || endField.primary;

    if (startIsUnique && endIsUnique) {
      return Cardinality.ONE_TO_ONE;
    }

    if (startIsUnique && !endIsUnique) {
      return Cardinality.ONE_TO_MANY;
    }

    if (!startIsUnique && endIsUnique) {
      return Cardinality.MANY_TO_ONE;
    }

    return Cardinality.ONE_TO_ONE;
  };

  const handleLinking = () => {
    if (hoveredTable.tableId === null) return;
    if (hoveredTable.fieldId === null) return;

    const { fields: startTableFields, name: startTableName } = tables.find(
      (t) => t.id === linkingLine.startTableId,
    );
    const startField = startTableFields.find(
      (f) => f.id === linkingLine.startFieldId,
    );
    const { fields: endTableFields, name: endTableName } = tables.find(
      (t) => t.id === hoveredTable.tableId,
    );
    const endField = endTableFields.find((f) => f.id === hoveredTable.fieldId);

    if (!areFieldsCompatible(database, startField.type, endField.type)) {
      Toast.info(t("cannot_connect"));
      return;
    }
    if (
      linkingLine.startTableId === hoveredTable.tableId &&
      linkingLine.startFieldId === hoveredTable.fieldId
    )
      return;

    const cardinality = getCardinality(startField, endField);

    const newRelationship = {
      ...linkingLine,
      cardinality,
      endTableId: hoveredTable.tableId,
      endFieldId: hoveredTable.fieldId,
      fields: [
        {
          startFieldId: linkingLine.startFieldId,
          endFieldId: hoveredTable.fieldId,
        },
      ],
      updateConstraint: Constraint.NONE,
      deleteConstraint: Constraint.NONE,
      name: `fk_${startTableName}_${startField.name}_${endTableName}`,
      id: nanoid(),
    };
    delete newRelationship.startX;
    delete newRelationship.startY;
    delete newRelationship.endX;
    delete newRelationship.endY;
    addRelationship(newRelationship);
  };

  useEventListener(
    "wheel",
    (e) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const eagernessFactor = 0.05;
        setTransform((prev) => ({
          pan: {
            x:
              prev.pan.x -
              (pointer.spaces.diagram.x - prev.pan.x) *
                eagernessFactor *
                Math.sign(e.deltaY),
            y:
              prev.pan.y -
              (pointer.spaces.diagram.y - prev.pan.y) *
                eagernessFactor *
                Math.sign(e.deltaY),
          },
          zoom: e.deltaY <= 0 ? prev.zoom * 1.05 : prev.zoom / 1.05,
        }));
      } else if (e.shiftKey) {
        setTransform((prev) => ({
          ...prev,
          pan: {
            ...prev.pan,
            x: prev.pan.x + e.deltaY / prev.zoom,
          },
        }));
      } else {
        setTransform((prev) => ({
          ...prev,
          pan: {
            ...prev.pan,
            y: prev.pan.y + e.deltaY / prev.zoom,
          },
        }));
      }
    },
    canvasRef,
    { passive: false },
  );

  return (
    <div className="grow h-full touch-none" id="canvas">
      <div
        className="w-full h-full"
        style={{
          cursor: pointer.style,
          backgroundColor: settings.mode === "dark" ? darkBgTheme : "white",
        }}
      >
        <svg
          id="diagram"
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onContextMenu={(e) => {
            if (rightClickPanned.current) {
              e.preventDefault();
              rightClickPanned.current = false;
            }
          }}
          className="absolute w-full h-full touch-none"
          viewBox={`${viewBox.left} ${viewBox.top} ${viewBox.width} ${viewBox.height}`}
        >
          {settings.showGrid && (
            <>
              <defs>
                <pattern
                  id="pattern-grid"
                  x={-gridCircleRadius}
                  y={-gridCircleRadius}
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                  patternContentUnits="userSpaceOnUse"
                >
                  <circle
                    cx={gridCircleRadius}
                    cy={gridCircleRadius}
                    r={gridCircleRadius}
                    fill="rgb(99, 152, 191)"
                    opacity="1"
                  />
                </pattern>
              </defs>
              <rect
                x={viewBox.left}
                y={viewBox.top}
                width={viewBox.width}
                height={viewBox.height}
                fill="url(#pattern-grid)"
              />
            </>
          )}
          {areas.map((a) => (
            <Area
              key={a.id}
              data={a}
              setResize={setAreaResize}
              setInitDimensions={setAreaInitDimensions}
              onPointerDown={() => {
                elementPointerDown = {
                  element: a,
                  type: ObjectType.AREA,
                };
              }}
            />
          ))}
          {relationships.map((e) => (
            <Relationship key={e.id} data={e} />
          ))}
          {/* Each schema is a self-contained z-layer: its box paints right
              before its own member tables, so a schema in front visually
              overlays (and intentionally captures clicks over) the tables and
              boxes behind it, while its own tables stay on top of its box.
              Ungrouped tables paint first (at the back); reordering schemas
              reorders their layers. The `tables` array is left untouched so
              data/export order stays stable. */}
          {(() => {
            const renderTable = (table) => (
              <Table
                key={table.id}
                tableData={table}
                setHoveredTable={setHoveredTable}
                handleGripField={handleGripField}
                setLinkingLine={setLinkingLine}
                onPointerDown={() => {
                  elementPointerDown = {
                    element: table,
                    type: ObjectType.TABLE,
                  };
                }}
              />
            );
            const nodes = [];
            // Ungrouped tables (and any orphaned schemaId) at the back.
            tables
              .filter((t) => !schemas.some((s) => s.id === t.schemaId))
              .forEach((t) => nodes.push(renderTable(t)));
            // Then each schema layer in panel order: box, then its members.
            schemas.forEach((s) => {
              if (!s.hidden) {
                nodes.push(
                  <SchemaGroup
                    key={`schema_${s.id}`}
                    schema={s}
                    isDropTarget={dropTargetSchemaIds.includes(s.id)}
                    isExitTarget={exitSchemaIds.includes(s.id)}
                    onResizeStart={handleSchemaResizeStart}
                    onPointerDown={() => {
                      elementPointerDown = {
                        element: s,
                        type: ObjectType.SCHEMA,
                      };
                    }}
                  />,
                );
              }
              tables
                .filter((t) => t.schemaId === s.id)
                .forEach((t) => nodes.push(renderTable(t)));
            });
            return nodes;
          })()}
          {linking && (
            <path
              d={`M ${linkingLine.startX} ${linkingLine.startY} L ${linkingLine.endX} ${linkingLine.endY}`}
              stroke="red"
              strokeDasharray="8,8"
              className="pointer-events-none touch-none"
            />
          )}
          <Slot name="svg-overlay" />
          {notes.map((n) => (
            <Note
              key={n.id}
              data={n}
              onPointerDown={() => {
                elementPointerDown = {
                  element: n,
                  type: ObjectType.NOTE,
                };
              }}
            />
          ))}
          {bulkSelectRect.show && (
            <rect
              {...getRectFromEndpoints(bulkSelectRect)}
              stroke="grey"
              fill="grey"
              fillOpacity={0.15}
              strokeDasharray={10}
            />
          )}
        </svg>
      </div>
      {settings.showDebugCoordinates && (
        <div className="fixed flex flex-col flex-wrap gap-6 bg-[rgba(var(--semi-grey-1),var(--tw-bg-opacity))]/40 border border-color bottom-4 right-4 p-4 rounded-xl backdrop-blur-xs pointer-events-none select-none">
          <table className="table-auto grow">
            <thead>
              <tr>
                <th className="text-left" colSpan={3}>
                  {t("transform")}
                </th>
              </tr>
              <tr className="italic [&_th]:font-normal [&_th]:text-right">
                <th>pan x</th>
                <th>pan y</th>
                <th>scale</th>
              </tr>
            </thead>
            <tbody className="[&_td]:text-right [&_td]:min-w-[8ch]">
              <tr>
                <td>{transform.pan.x.toFixed(2)}</td>
                <td>{transform.pan.y.toFixed(2)}</td>
                <td>{transform.zoom.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
          <table className="table-auto grow [&_th]:text-left [&_th:not(:first-of-type)]:text-right [&_td:not(:first-of-type)]:text-right [&_td]:min-w-[8ch]">
            <thead>
              <tr>
                <th colSpan={4}>{t("viewbox")}</th>
              </tr>
              <tr className="italic [&_th]:font-normal">
                <th>left</th>
                <th>top</th>
                <th>width</th>
                <th>height</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{viewBox.left.toFixed(2)}</td>
                <td>{viewBox.top.toFixed(2)}</td>
                <td>{viewBox.width.toFixed(2)}</td>
                <td>{viewBox.height.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <table className="table-auto grow [&_th]:text-left [&_th:not(:first-of-type)]:text-right [&_td:not(:first-of-type)]:text-right [&_td]:min-w-[8ch]">
            <thead>
              <tr>
                <th colSpan={3}>{t("cursor_coordinates")}</th>
              </tr>
              <tr className="italic [&_th]:font-normal">
                <th>{t("coordinate_space")}</th>
                <th>x</th>
                <th>y</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("coordinate_space_screen")}</td>
                <td>{pointer.spaces.screen.x.toFixed(2)}</td>
                <td>{pointer.spaces.screen.y.toFixed(2)}</td>
              </tr>
              <tr>
                <td>{t("coordinate_space_diagram")}</td>
                <td>{pointer.spaces.diagram.x.toFixed(2)}</td>
                <td>{pointer.spaces.diagram.y.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
