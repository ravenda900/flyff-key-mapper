import { CloseOutlined } from "@ant-design/icons";
import { message } from "antd";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Rnd } from "react-rnd";
import {
  shouldIgnoreTriggeredPointerEvent,
  stopToggleShapeArea,
  triggerShapeArea,
} from "../../keybinding";
import {
  getReservedShapeShortcutUsage,
  sanitizeShapeBinding,
} from "../shortcutBinding";
import { ShapeGeometry } from "../components/ShapeGeometry";
import { ShortcutKeys } from "../components/ShortcutKeys";
import type { MapperSettings, ShapeMapping } from "../../types";

const SNAP_THRESHOLD = 6;
const SHIFT_DRAG_STEP = 10;

type ShapeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SnapGuides = {
  vertical?: number;
  horizontal?: number;
};

type Props = {
  overlayVisible: boolean;
  shapesVisible: boolean;
  shapes: ShapeMapping[];
  settings: MapperSettings;
  hasClipboardShapes: boolean;
  selectedIds: string[];
  selectSingleShape: (id: string | null) => void;
  toggleShapeSelection: (id: string) => void;
  runningTooltip: { x: number; y: number; keyBinding: string } | null;
  setIsTransformingShape: (value: boolean) => void;
  setShapes: Dispatch<SetStateAction<ShapeMapping[]>>;
  setShapesWithoutHistory: Dispatch<SetStateAction<ShapeMapping[]>>;
  removeShape: (id: string) => void;
  deleteShapeIds: (ids: string[]) => void;
  copyShapeIds: (ids: string[]) => void;
  cutShapeIds: (ids: string[]) => void;
  pasteCopiedShapesAt: (point?: { x: number; y: number }) => boolean;
  rotateIdRef: MutableRefObject<string | null>;
  previousBodyCursorRef: MutableRefObject<string | null>;
  buildShortcutFromEvent: (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => string;
  normalizeShape: (shape: ShapeMapping) => ShapeMapping;
};

type ShapeItemProps = {
  shape: ShapeMapping;
  shapeRects: Record<string, ShapeRect>;
  isSelected: boolean;
  selectedIds: string[];
  editMode: boolean;
  livePosition?: { x: number; y: number };
  liveRect?: ShapeRect;
  isShiftPressed: boolean;
  buildShortcutFromEvent: (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => string;
  mergeCapturedShortcut: (
    existingBinding: string,
    capturedBinding: string,
    shapeId: string,
  ) => string;
  updateShapeBinding: (shapeId: string, nextBinding: string) => void;
  buildPointerShortcut: (
    event: {
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
    },
    pointerToken: string,
  ) => string;
  capturePointerBinding: (
    event: {
      button: number;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
    },
    shapeId: string,
  ) => void;
  selectSingleShape: (id: string | null) => void;
  toggleShapeSelection: (id: string) => void;
  setIsTransformingShape: (value: boolean) => void;
  setLiveShapeDragPositions: Dispatch<
    SetStateAction<Record<string, { x: number; y: number }>>
  >;
  setLiveShapeResizeRects: Dispatch<SetStateAction<Record<string, ShapeRect>>>;
  setSnapGuides: Dispatch<SetStateAction<SnapGuides | null>>;
  updateLiveShapeDragPosition: (id: string, x: number, y: number) => void;
  setShapes: Dispatch<SetStateAction<ShapeMapping[]>>;
  normalizeShape: (shape: ShapeMapping) => ShapeMapping;
  removeShape: (id: string) => void;
  rotateIdRef: MutableRefObject<string | null>;
  previousBodyCursorRef: MutableRefObject<string | null>;
  openContextMenu: (shapeId: string, x: number, y: number) => void;
};

const ShapeOverlayItem = ({
  shape,
  shapeRects,
  isSelected,
  selectedIds,
  editMode,
  livePosition,
  liveRect,
  isShiftPressed,
  buildShortcutFromEvent,
  mergeCapturedShortcut,
  updateShapeBinding,
  buildPointerShortcut,
  capturePointerBinding,
  selectSingleShape,
  toggleShapeSelection,
  setIsTransformingShape,
  setLiveShapeDragPositions,
  setLiveShapeResizeRects,
  setSnapGuides,
  updateLiveShapeDragPosition,
  setShapes,
  normalizeShape,
  removeShape,
  rotateIdRef,
  previousBodyCursorRef,
  openContextMenu,
}: ShapeItemProps) => {
  const groupDragRef = useRef<{
    ids: string[];
    originById: Record<string, { x: number; y: number }>;
  } | null>(null);

  const showShortcutInput = shape.width >= 72 && shape.height >= 34;

  const getSnapCandidates = useCallback(
    (excludeIds: string[]) => {
      const excluded = new Set(excludeIds);
      const vertical: number[] = [];
      const horizontal: number[] = [];

      Object.entries(shapeRects).forEach(([id, rect]) => {
        if (excluded.has(id)) {
          return;
        }

        vertical.push(rect.x, rect.x + rect.width / 2, rect.x + rect.width);
        horizontal.push(rect.y, rect.y + rect.height / 2, rect.y + rect.height);
      });

      return { vertical, horizontal };
    },
    [shapeRects],
  );

  const findSnap = useCallback((points: number[], candidates: number[]) => {
    let bestOffset = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestLine: number | undefined;

    points.forEach((point) => {
      candidates.forEach((candidate) => {
        const offset = candidate - point;
        const distance = Math.abs(offset);
        if (distance < bestDistance && distance <= SNAP_THRESHOLD) {
          bestDistance = distance;
          bestOffset = offset;
          bestLine = candidate;
        }
      });
    });

    return {
      offset: bestLine === undefined ? 0 : bestOffset,
      line: bestLine,
    };
  }, []);
  const shortcutInput = (
    <div
      className={`fm-shortcut-input-shell fm-shortcut-input-shell-shape${shape.keyBinding ? " fm-shortcut-input-has-value" : ""}`}
    >
      <input
        className="fm-shape-shortcut-input"
        value={shape.keyBinding}
        placeholder={editMode ? "Press keys" : ""}
        readOnly={!editMode}
        tabIndex={editMode ? 0 : -1}
        style={{
          pointerEvents: editMode ? "auto" : "none",
        }}
        onFocus={() => {
          if (!editMode) return;
          selectSingleShape(shape.id);
        }}
        onKeyDown={(event) => {
          if (!editMode) return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === "Escape") {
            (event.target as HTMLInputElement).blur();
            return;
          }
          if (event.key === "Backspace" || event.key === "Delete") {
            updateShapeBinding(shape.id, "");
            return;
          }

          const captured = buildShortcutFromEvent(event);
          if (!captured) return;

          updateShapeBinding(
            shape.id,
            mergeCapturedShortcut(shape.keyBinding, captured, shape.id),
          );
        }}
        onMouseDown={(event) => {
          if (!editMode) return;
          const input = event.currentTarget as HTMLInputElement;
          const wasFocused = document.activeElement === input;
          event.preventDefault();
          event.stopPropagation();
          selectSingleShape(shape.id);
          input.focus({ preventScroll: true });

          if (!wasFocused) {
            return;
          }

          if (event.button === 0 || event.button === 2) {
            capturePointerBinding(event, shape.id);
          }
        }}
        onContextMenu={(event) => {
          if (!editMode) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        onWheel={(event) => {
          if (!editMode) return;
          const input = event.currentTarget as HTMLInputElement;
          const wasFocused = document.activeElement === input;
          event.stopPropagation();
          if (!wasFocused) {
            input.focus({ preventScroll: true });
            return;
          }
          const token = event.deltaY < 0 ? "Wheel Up" : "Wheel Down";
          updateShapeBinding(shape.id, buildPointerShortcut(event, token));
        }}
      />
      {shape.keyBinding && (
        <span
          className="fm-shortcut-input-overlay fm-shortcut-input-overlay-centered"
          aria-hidden="true"
        >
          <ShortcutKeys combo={shape.keyBinding} />
        </span>
      )}
    </div>
  );

  return (
    <Rnd
      className={`fm-shape ${isSelected ? "fm-shape-selected" : ""}`}
      size={{
        width: liveRect?.width ?? shape.width,
        height: liveRect?.height ?? shape.height,
      }}
      position={
        liveRect ??
        livePosition ?? {
          x: shape.x,
          y: shape.y,
        }
      }
      minWidth={5}
      minHeight={5}
      dragHandleClassName="fm-shape-hit-area"
      disableDragging={!editMode}
      enableResizing={
        editMode && isSelected
          ? {
              top: true,
              right: true,
              bottom: true,
              left: true,
              topLeft: true,
              topRight: true,
              bottomLeft: true,
              bottomRight: true,
            }
          : false
      }
      resizeHandleStyles={
        editMode && isSelected
          ? {
              topLeft: {
                left: "2px",
                top: "2px",
                right: "auto",
                bottom: "auto",
                width: "12px",
                height: "12px",
                cursor: "nwse-resize",
              },
              top: {
                left: "0",
                top: "0",
                right: "0",
                bottom: "auto",
                width: "auto",
                height: "8px",
                cursor: "ns-resize",
              },
              topRight: {
                right: "2px",
                top: "2px",
                left: "auto",
                bottom: "auto",
                width: "12px",
                height: "12px",
                cursor: "nesw-resize",
              },
              right: {
                right: "0",
                top: "0",
                left: "auto",
                bottom: "0",
                width: "8px",
                height: "auto",
                cursor: "ew-resize",
              },
              bottom: {
                left: "0",
                bottom: "0",
                right: "0",
                top: "auto",
                width: "auto",
                height: "8px",
                cursor: "ns-resize",
              },
              bottomLeft: {
                left: "2px",
                bottom: "2px",
                right: "auto",
                top: "auto",
                width: "12px",
                height: "12px",
                cursor: "nesw-resize",
              },
              left: {
                left: "0",
                top: "0",
                right: "auto",
                bottom: "0",
                width: "8px",
                height: "auto",
                cursor: "ew-resize",
              },
              bottomRight: {
                right: "2px",
                bottom: "2px",
                left: "auto",
                top: "auto",
                width: "12px",
                height: "12px",
                cursor: "nwse-resize",
              },
            }
          : {}
      }
      resizeHandleClasses={
        editMode && isSelected
          ? {
              top: "fm-resize-handle fm-resize-handle-t",
              right: "fm-resize-handle fm-resize-handle-r",
              bottom: "fm-resize-handle fm-resize-handle-b",
              left: "fm-resize-handle fm-resize-handle-l",
              topLeft: "fm-resize-handle fm-resize-handle-tl",
              topRight: "fm-resize-handle fm-resize-handle-tr",
              bottomLeft: "fm-resize-handle fm-resize-handle-bl",
              bottomRight: "fm-resize-handle fm-resize-handle-br",
            }
          : {}
      }
      cancel=".fm-shape-shortcut, .fm-shape-shortcut-floating, .fm-shape-shortcut-input, .fm-close-btn, .fm-rotate-handle"
      bounds="window"
      lockAspectRatio={
        editMode && isSelected && isShiftPressed
          ? (liveRect?.width ?? shape.width) /
            Math.max(1, liveRect?.height ?? shape.height)
          : false
      }
      style={{
        pointerEvents: editMode ? "auto" : "none",
        zIndex: isSelected ? 2147483644 : 2147483643,
      }}
      onDragStart={() => {
        if (!editMode) return;
        const isDraggingSelection =
          selectedIds.length > 1 && selectedIds.includes(shape.id);
        const dragIds = isDraggingSelection ? selectedIds : [shape.id];

        if (!isDraggingSelection) {
          selectSingleShape(shape.id);
        }

        const originById = dragIds.reduce<
          Record<string, { x: number; y: number }>
        >((acc, id) => {
          const source = shapeRects[id];
          if (source) {
            acc[id] = { x: source.x, y: source.y };
          }
          return acc;
        }, {});

        groupDragRef.current = {
          ids: dragIds,
          originById,
        };

        setIsTransformingShape(true);
        setLiveShapeDragPositions((prev) => ({
          ...prev,
          ...originById,
        }));
      }}
      onDrag={(_event, data) => {
        if (!editMode) return;
        const pointerEvent = _event as MouseEvent;
        const groupDrag = groupDragRef.current;

        const step = pointerEvent.shiftKey ? SHIFT_DRAG_STEP : 1;
        const shouldSnap = !pointerEvent.shiftKey;
        const snapTargets = getSnapCandidates(groupDrag?.ids ?? [shape.id]);

        if (groupDrag && groupDrag.ids.length > 1) {
          const origin = groupDrag.originById[shape.id];
          if (!origin) {
            return;
          }

          let dx = data.x - origin.x;
          let dy = data.y - origin.y;
          dx = Math.round(dx / step) * step;
          dy = Math.round(dy / step) * step;

          const leadRect = shapeRects[shape.id];
          if (!leadRect) {
            return;
          }

          const tentativeX = origin.x + dx;
          const tentativeY = origin.y + dy;
          const xSnap = shouldSnap
            ? findSnap(
                [
                  tentativeX,
                  tentativeX + leadRect.width / 2,
                  tentativeX + leadRect.width,
                ],
                snapTargets.vertical,
              )
            : { offset: 0, line: undefined as number | undefined };
          const ySnap = shouldSnap
            ? findSnap(
                [
                  tentativeY,
                  tentativeY + leadRect.height / 2,
                  tentativeY + leadRect.height,
                ],
                snapTargets.horizontal,
              )
            : { offset: 0, line: undefined as number | undefined };

          dx += xSnap.offset;
          dy += ySnap.offset;

          setSnapGuides(
            xSnap.line === undefined && ySnap.line === undefined
              ? null
              : {
                  vertical: xSnap.line,
                  horizontal: ySnap.line,
                },
          );

          setLiveShapeDragPositions((prev) => {
            const next = { ...prev };
            groupDrag.ids.forEach((id) => {
              const base = groupDrag.originById[id];
              if (!base) {
                return;
              }
              next[id] = {
                x: base.x + dx,
                y: base.y + dy,
              };
            });
            return next;
          });
          return;
        }

        const origin = { x: shape.x, y: shape.y };
        let dx = data.x - origin.x;
        let dy = data.y - origin.y;
        dx = Math.round(dx / step) * step;
        dy = Math.round(dy / step) * step;

        const leadRect = shapeRects[shape.id];
        if (!leadRect) {
          return;
        }

        const tentativeX = origin.x + dx;
        const tentativeY = origin.y + dy;
        const xSnap = shouldSnap
          ? findSnap(
              [
                tentativeX,
                tentativeX + leadRect.width / 2,
                tentativeX + leadRect.width,
              ],
              snapTargets.vertical,
            )
          : { offset: 0, line: undefined as number | undefined };
        const ySnap = shouldSnap
          ? findSnap(
              [
                tentativeY,
                tentativeY + leadRect.height / 2,
                tentativeY + leadRect.height,
              ],
              snapTargets.horizontal,
            )
          : { offset: 0, line: undefined as number | undefined };

        const nextX = tentativeX + xSnap.offset;
        const nextY = tentativeY + ySnap.offset;

        setSnapGuides(
          xSnap.line === undefined && ySnap.line === undefined
            ? null
            : {
                vertical: xSnap.line,
                horizontal: ySnap.line,
              },
        );

        updateLiveShapeDragPosition(shape.id, nextX, nextY);
      }}
      onDragStop={(_event, data) => {
        const groupDrag = groupDragRef.current;
        groupDragRef.current = null;
        setSnapGuides(null);

        if (groupDrag && groupDrag.ids.length > 1) {
          const origin = groupDrag.originById[shape.id];
          if (origin) {
            const dx = data.x - origin.x;
            const dy = data.y - origin.y;

            setLiveShapeDragPositions((prev) => {
              const next = { ...prev };
              groupDrag.ids.forEach((id) => {
                delete next[id];
              });
              return next;
            });

            setIsTransformingShape(false);
            setShapes((prev) =>
              prev.map((item) =>
                groupDrag.ids.includes(item.id)
                  ? normalizeShape({
                      ...item,
                      x: item.x + dx,
                      y: item.y + dy,
                    })
                  : item,
              ),
            );
            return;
          }
        }

        setLiveShapeDragPositions((prev) => {
          const next = { ...prev };
          delete next[shape.id];
          return next;
        });
        setIsTransformingShape(false);
        setShapes((prev) =>
          prev.map((item) =>
            item.id === shape.id
              ? normalizeShape({ ...item, x: data.x, y: data.y })
              : item,
          ),
        );
      }}
      onResizeStart={() => {
        if (!editMode) return;
        selectSingleShape(shape.id);
        setIsTransformingShape(true);
        setLiveShapeResizeRects((prev) => ({
          ...prev,
          [shape.id]: {
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
          },
        }));
      }}
      onResize={(_event, dir, ref, _delta, position) => {
        if (!editMode) {
          return;
        }

        const dirToken = String(dir).toLowerCase();

        let nextX = position.x;
        let nextY = position.y;
        let nextWidth = Number(ref.style.width.replace("px", ""));
        let nextHeight = Number(ref.style.height.replace("px", ""));

        const { vertical, horizontal } = getSnapCandidates([shape.id]);

        let xLine: number | undefined;
        let yLine: number | undefined;

        if (dirToken.includes("right")) {
          const snap = findSnap([nextX + nextWidth], vertical);
          nextWidth += snap.offset;
          xLine = snap.line;
        }

        if (dirToken.includes("left")) {
          const snap = findSnap([nextX], vertical);
          nextX += snap.offset;
          nextWidth -= snap.offset;
          xLine = snap.line ?? xLine;
        }

        if (dirToken.includes("bottom")) {
          const snap = findSnap([nextY + nextHeight], horizontal);
          nextHeight += snap.offset;
          yLine = snap.line;
        }

        if (dirToken.includes("top")) {
          const snap = findSnap([nextY], horizontal);
          nextY += snap.offset;
          nextHeight -= snap.offset;
          yLine = snap.line ?? yLine;
        }

        nextWidth = Math.max(5, nextWidth);
        nextHeight = Math.max(5, nextHeight);

        setSnapGuides(
          xLine === undefined && yLine === undefined
            ? null
            : {
                vertical: xLine,
                horizontal: yLine,
              },
        );

        setLiveShapeResizeRects((prev) => ({
          ...prev,
          [shape.id]: {
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight,
          },
        }));
      }}
      onResizeStop={(_event, dir, ref, _delta, position) => {
        setSnapGuides(null);
        setLiveShapeResizeRects((prev) => {
          const next = { ...prev };
          delete next[shape.id];
          return next;
        });
        setIsTransformingShape(false);

        const live = liveRect;
        let nextX = live?.x ?? position.x;
        let nextY = live?.y ?? position.y;
        let nextWidth =
          live?.width ?? Number(ref.style.width.replace("px", ""));
        let nextHeight =
          live?.height ?? Number(ref.style.height.replace("px", ""));

        const dirToken = String(dir).toLowerCase();
        const { vertical, horizontal } = getSnapCandidates([shape.id]);

        if (dirToken.includes("right")) {
          const snap = findSnap([nextX + nextWidth], vertical);
          nextWidth += snap.offset;
        }

        if (dirToken.includes("left")) {
          const snap = findSnap([nextX], vertical);
          nextX += snap.offset;
          nextWidth -= snap.offset;
        }

        if (dirToken.includes("bottom")) {
          const snap = findSnap([nextY + nextHeight], horizontal);
          nextHeight += snap.offset;
        }

        if (dirToken.includes("top")) {
          const snap = findSnap([nextY], horizontal);
          nextY += snap.offset;
          nextHeight -= snap.offset;
        }

        nextWidth = Math.max(5, nextWidth);
        nextHeight = Math.max(5, nextHeight);

        setShapes((prev) =>
          prev.map((item) =>
            item.id === shape.id
              ? normalizeShape({
                  ...item,
                  x: nextX,
                  y: nextY,
                  width: nextWidth,
                  height: nextHeight,
                })
              : item,
          ),
        );
      }}
    >
      {editMode && (
        <button
          type="button"
          className={`fm-close-btn ${isSelected ? "fm-close-btn-shifted" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            removeShape(shape.id);
          }}
        >
          <CloseOutlined />
        </button>
      )}
      <div
        className="fm-shape-shell"
        style={{
          transform: `rotate(${shape.rotation}deg)`,
          opacity: shape.opacity,
          pointerEvents: "auto",
        }}
      >
        <svg
          className="fm-shape-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <ShapeGeometry
            shape={shape.type}
            className="fm-shape-fill fm-shape-hit-area"
            onMouseDown={(event) => {
              if (editMode) {
                if (event.ctrlKey || event.metaKey) {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleShapeSelection(shape.id);
                  return;
                }

                if (selectedIds.includes(shape.id)) {
                  return;
                }

                selectSingleShape(shape.id);
                return;
              }

              if (event.button !== 0) {
                return;
              }

              if (
                shouldIgnoreTriggeredPointerEvent(event.clientX, event.clientY)
              ) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              triggerShapeArea(
                shape,
                {
                  x: event.clientX,
                  y: event.clientY,
                },
                { delayMs: 0 },
              );
            }}
            onContextMenu={(event) => {
              if (!editMode) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();
              selectSingleShape(shape.id);
              openContextMenu(shape.id, event.clientX, event.clientY);
            }}
            onClick={(event) => {
              if (!editMode) return;
              if (event.ctrlKey || event.metaKey) {
                return;
              }

              if (selectedIds.includes(shape.id)) {
                return;
              }

              selectSingleShape(shape.id);
            }}
          />
        </svg>
        {editMode && isSelected && (
          <>
            <div
              className="fm-rotate-handle"
              onPointerDown={(event) => {
                event.stopPropagation();
                previousBodyCursorRef.current = document.body.style.cursor;
                rotateIdRef.current = shape.id;
                document.body.style.cursor = "grabbing";
              }}
            />
            <div className="fm-corner-indicators" aria-hidden="true">
              <span className="fm-corner-indicator fm-corner-indicator-tl" />
              <span className="fm-corner-indicator fm-corner-indicator-tr" />
              <span className="fm-corner-indicator fm-corner-indicator-bl" />
              <span className="fm-corner-indicator fm-corner-indicator-br" />
            </div>
          </>
        )}
        {showShortcutInput && (
          <div className={`fm-shape-shortcut fm-shape-shortcut-${shape.type}`}>
            {shortcutInput}
          </div>
        )}
      </div>
    </Rnd>
  );
};

const MemoizedShapeOverlayItem = memo(
  ShapeOverlayItem,
  (prev, next) =>
    prev.shape === next.shape &&
    prev.isSelected === next.isSelected &&
    prev.editMode === next.editMode &&
    prev.livePosition === next.livePosition,
);

export const ShapeOverlay = ({
  overlayVisible,
  shapesVisible,
  shapes,
  settings,
  hasClipboardShapes,
  selectedIds,
  selectSingleShape,
  toggleShapeSelection,
  runningTooltip,
  setIsTransformingShape,
  setShapes,
  setShapesWithoutHistory,
  removeShape,
  deleteShapeIds,
  copyShapeIds,
  cutShapeIds,
  pasteCopiedShapesAt,
  rotateIdRef,
  previousBodyCursorRef,
  buildShortcutFromEvent,
  normalizeShape,
}: Props) => {
  const [messageApi, messageContextHolder] = message.useMessage();
  const captureTimestampsRef = useRef<Record<string, number>>({});
  const leftClickCaptureRef = useRef<Record<string, number>>({});
  const rightClickCaptureRef = useRef<Record<string, number>>({});
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragUpdateRef = useRef<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [liveShapeDragPositions, setLiveShapeDragPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [liveShapeResizeRects, setLiveShapeResizeRects] = useState<
    Record<string, ShapeRect>
  >({});
  const [bindingConflictByShapeId, setBindingConflictByShapeId] = useState<
    Record<string, string>
  >({});
  const [snapGuides, setSnapGuides] = useState<SnapGuides | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [contextMenu, setContextMenu] = useState<
    | {
        kind: "shape";
        shapeId: string;
        x: number;
        y: number;
      }
    | {
        kind: "canvas";
        x: number;
        y: number;
      }
    | null
  >(null);
  const [cursorMoveState, setCursorMoveState] = useState<{
    shapeId: string;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [moveHintPosition, setMoveHintPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const contextShape = useMemo(
    () =>
      contextMenu?.kind === "shape"
        ? (shapes.find((shape) => shape.id === contextMenu.shapeId) ?? null)
        : null,
    [contextMenu, shapes],
  );

  const shapeRects = useMemo(
    () =>
      shapes.reduce<Record<string, ShapeRect>>((acc, shape) => {
        acc[shape.id] = {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        };
        return acc;
      }, {}),
    [shapes],
  );

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const contextShapeNeedsShortcutInput =
    !!contextShape &&
    !(contextShape.width >= 72 && contextShape.height >= 34) &&
    settings.editMode;

  const contextShortcutConflict = contextShape
    ? bindingConflictByShapeId[contextShape.id]
    : undefined;

  const contextMenuPosition = useMemo(() => {
    if (!contextMenu) {
      return { left: 0, top: 0 };
    }

    const viewportPadding = 8;
    const pointerOffset = 8;
    const maxViewportWidth = Math.max(
      180,
      window.innerWidth - viewportPadding * 2,
    );
    const estimatedWidth =
      contextMenu.kind === "canvas"
        ? Math.min(220, maxViewportWidth)
        : Math.min(300, maxViewportWidth);
    const estimatedHeight =
      contextMenu.kind === "canvas"
        ? 80
        : contextShapeNeedsShortcutInput
          ? 560
          : 500;

    const maxLeft = Math.max(
      viewportPadding,
      window.innerWidth - estimatedWidth - viewportPadding,
    );
    const maxTop = Math.max(
      viewportPadding,
      window.innerHeight - estimatedHeight - viewportPadding,
    );

    let anchorX = contextMenu.x;
    let anchorY = contextMenu.y;

    if (contextMenu.kind === "shape") {
      const contextRect = shapeRects[contextMenu.shapeId];
      if (contextRect) {
        anchorX = contextRect.x + contextRect.width;
        anchorY = contextRect.y;
      }
    }

    const nextLeft = Math.min(
      Math.max(anchorX + pointerOffset, viewportPadding),
      maxLeft,
    );
    const nextTop = Math.min(
      Math.max(anchorY + pointerOffset, viewportPadding),
      maxTop,
    );

    return {
      left: nextLeft,
      top: nextTop,
    };
  }, [contextMenu, contextShapeNeedsShortcutInput, shapeRects]);

  const mergeCapturedShortcut = useCallback(
    (
      existingBinding: string,
      capturedBinding: string,
      shapeId: string,
    ): string => {
      const now = Date.now();
      const lastCaptureAt = captureTimestampsRef.current[shapeId] ?? 0;
      captureTimestampsRef.current[shapeId] = now;

      if (!existingBinding || now - lastCaptureAt > 1200) {
        return capturedBinding;
      }

      const modifierTokens = new Set(["Ctrl", "Alt", "Shift", "Meta"]);
      const existingParts = existingBinding
        .split("+")
        .map((part) => part.trim());
      const capturedParts = capturedBinding
        .split("+")
        .map((part) => part.trim());

      const existingModifiers = existingParts.filter((part) =>
        modifierTokens.has(part),
      );
      const existingSteps = existingParts.filter(
        (part) => !modifierTokens.has(part),
      );
      const capturedModifiers = capturedParts.filter((part) =>
        modifierTokens.has(part),
      );
      const capturedSteps = capturedParts.filter(
        (part) => !modifierTokens.has(part),
      );

      if (
        capturedSteps.length !== 1 ||
        existingModifiers.join("+") !== capturedModifiers.join("+")
      ) {
        return capturedBinding;
      }

      return [...existingModifiers, ...existingSteps, capturedSteps[0]].join(
        "+",
      );
    },
    [],
  );

  const buildPointerShortcut = useCallback(
    (
      event: {
        ctrlKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
      },
      pointerToken: string,
    ): string => {
      const parts: string[] = [];
      if (event.ctrlKey) parts.push("Ctrl");
      if (event.altKey) parts.push("Alt");
      if (event.shiftKey) parts.push("Shift");
      parts.push(pointerToken);
      return parts.join("+");
    },
    [],
  );

  const updateShapeBinding = useCallback(
    (shapeId: string, nextBinding: string) => {
      const sanitizedBinding = sanitizeShapeBinding(nextBinding);
      const conflictMessageKey = `fm-shape-shortcut-conflict-${shapeId}`;
      const targetShape = shapes.find((item) => item.id === shapeId);
      const hasInlineShortcutInput =
        !!targetShape &&
        settings.editMode &&
        targetShape.width >= 72 &&
        targetShape.height >= 34;

      if (!sanitizedBinding) {
        messageApi.destroy(conflictMessageKey);
        setBindingConflictByShapeId((prev) => {
          if (!prev[shapeId]) {
            return prev;
          }

          const next = { ...prev };
          delete next[shapeId];
          return next;
        });
      } else {
        const usage = getReservedShapeShortcutUsage(sanitizedBinding, settings);
        if (usage) {
          const conflictText = `Shortcut is already used by: ${usage}`;

          if (hasInlineShortcutInput) {
            messageApi.open({
              key: conflictMessageKey,
              type: "warning",
              content: conflictText,
              duration: 2,
            });
            setBindingConflictByShapeId((prev) => {
              if (!prev[shapeId]) {
                return prev;
              }

              const next = { ...prev };
              delete next[shapeId];
              return next;
            });
          } else {
            setBindingConflictByShapeId((prev) => ({
              ...prev,
              [shapeId]: conflictText,
            }));
          }

          return;
        }

        messageApi.destroy(conflictMessageKey);
        setBindingConflictByShapeId((prev) => {
          if (!prev[shapeId]) {
            return prev;
          }

          const next = { ...prev };
          delete next[shapeId];
          return next;
        });
      }

      setShapesWithoutHistory((prev) =>
        prev.map((item) =>
          item.id === shapeId
            ? normalizeShape({
                ...item,
                keyBinding: sanitizedBinding,
              })
            : item,
        ),
      );
    },
    [messageApi, normalizeShape, setShapesWithoutHistory, settings, shapes],
  );

  const capturePointerBinding = useCallback(
    (
      event: {
        button: number;
        ctrlKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
      },
      shapeId: string,
    ) => {
      if (event.button !== 0 && event.button !== 2) {
        return;
      }

      if (event.button === 0) {
        const now = Date.now();
        const previous = leftClickCaptureRef.current[shapeId] ?? 0;
        leftClickCaptureRef.current[shapeId] = now;
        const token = now - previous < 360 ? "Double Left Click" : "Left Click";
        updateShapeBinding(shapeId, buildPointerShortcut(event, token));
        return;
      }

      const now = Date.now();
      const previous = rightClickCaptureRef.current[shapeId] ?? 0;
      rightClickCaptureRef.current[shapeId] = now;
      const token = now - previous < 360 ? "Double Right Click" : "Right Click";
      updateShapeBinding(shapeId, buildPointerShortcut(event, token));
    },
    [buildPointerShortcut, updateShapeBinding],
  );

  const openContextMenu = useCallback(
    (shapeId: string, x: number, y: number) => {
      setContextMenu({ kind: "shape", shapeId, x, y });
    },
    [],
  );

  const getContextTargetIds = useCallback(() => {
    if (!contextShape) {
      return [] as string[];
    }

    if (selectedIds.length > 0 && selectedIds.includes(contextShape.id)) {
      return selectedIds;
    }

    return [contextShape.id];
  }, [contextShape, selectedIds]);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const computeCursorMoveSnap = useCallback(
    (shapeId: string, rawX: number, rawY: number, shouldSnap: boolean) => {
      const movingShape = shapes.find((shape) => shape.id === shapeId);
      if (!movingShape) {
        return {
          x: rawX,
          y: rawY,
          guides: null as SnapGuides | null,
        };
      }

      const verticalCandidates: number[] = [];
      const horizontalCandidates: number[] = [];

      Object.entries(shapeRects).forEach(([id, rect]) => {
        if (id === shapeId) {
          return;
        }

        verticalCandidates.push(
          rect.x,
          rect.x + rect.width / 2,
          rect.x + rect.width,
        );
        horizontalCandidates.push(
          rect.y,
          rect.y + rect.height / 2,
          rect.y + rect.height,
        );
      });

      const findSnap = (points: number[], candidates: number[]) => {
        let bestOffset = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        let bestLine: number | undefined;

        points.forEach((point) => {
          candidates.forEach((candidate) => {
            const offset = candidate - point;
            const distance = Math.abs(offset);
            if (distance < bestDistance && distance <= SNAP_THRESHOLD) {
              bestDistance = distance;
              bestOffset = offset;
              bestLine = candidate;
            }
          });
        });

        return {
          offset: bestLine === undefined ? 0 : bestOffset,
          line: bestLine,
        };
      };

      const xSnap = shouldSnap
        ? findSnap(
            [rawX, rawX + movingShape.width / 2, rawX + movingShape.width],
            verticalCandidates,
          )
        : { offset: 0, line: undefined as number | undefined };
      const ySnap = shouldSnap
        ? findSnap(
            [rawY, rawY + movingShape.height / 2, rawY + movingShape.height],
            horizontalCandidates,
          )
        : { offset: 0, line: undefined as number | undefined };

      return {
        x: rawX + xSnap.offset,
        y: rawY + ySnap.offset,
        guides:
          xSnap.line !== undefined || ySnap.line !== undefined
            ? {
                vertical: xSnap.line,
                horizontal: ySnap.line,
              }
            : null,
      };
    },
    [shapeRects, shapes],
  );

  const startCursorMove = useCallback(
    (shapeId: string) => {
      const shape = shapes.find((item) => item.id === shapeId);
      if (!shape) {
        return;
      }

      selectSingleShape(shape.id);
      setContextMenu(null);
      setCursorMoveState({
        shapeId,
        offsetX: shape.width / 2,
        offsetY: shape.height / 2,
      });
      setMoveHintPosition({
        x: shape.x + shape.width / 2,
        y: shape.y + shape.height / 2,
      });
      setLiveShapeDragPositions((prev) => ({
        ...prev,
        [shapeId]: { x: shape.x, y: shape.y },
      }));
      setIsTransformingShape(true);
    },
    [selectSingleShape, setIsTransformingShape, shapes],
  );

  useEffect(() => {
    if (!overlayVisible || !shapesVisible || !settings.editMode) {
      return;
    }

    const onCanvasContextMenu = (event: MouseEvent) => {
      if (!hasClipboardShapes) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target?.closest("canvas")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ kind: "canvas", x: event.clientX, y: event.clientY });
    };

    window.addEventListener("contextmenu", onCanvasContextMenu, {
      capture: true,
    });

    return () => {
      window.removeEventListener("contextmenu", onCanvasContextMenu, {
        capture: true,
      });
    };
  }, [hasClipboardShapes, overlayVisible, settings.editMode, shapesVisible]);

  useEffect(() => {
    if (!cursorMoveState || !settings.editMode) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const rawX = event.clientX - cursorMoveState.offsetX;
      const rawY = event.clientY - cursorMoveState.offsetY;
      const snapped = computeCursorMoveSnap(
        cursorMoveState.shapeId,
        rawX,
        rawY,
        !event.shiftKey,
      );

      setMoveHintPosition({ x: event.clientX, y: event.clientY });
      setSnapGuides(snapped.guides);
      setLiveShapeDragPositions((prev) => ({
        ...prev,
        [cursorMoveState.shapeId]: {
          x: snapped.x,
          y: snapped.y,
        },
      }));
    };

    const stopMoveMode = () => {
      setCursorMoveState(null);
      setLiveShapeDragPositions((prev) => {
        if (!prev[cursorMoveState.shapeId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[cursorMoveState.shapeId];
        return next;
      });
      setSnapGuides(null);
      setMoveHintPosition(null);
      setIsTransformingShape(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const rawX = event.clientX - cursorMoveState.offsetX;
      const rawY = event.clientY - cursorMoveState.offsetY;
      const snapped = computeCursorMoveSnap(
        cursorMoveState.shapeId,
        rawX,
        rawY,
        !event.shiftKey,
      );

      setShapes((prev) =>
        prev.map((shape) =>
          shape.id === cursorMoveState.shapeId
            ? normalizeShape({
                ...shape,
                x: snapped.x,
                y: snapped.y,
              })
            : shape,
        ),
      );

      event.preventDefault();
      event.stopPropagation();
      stopMoveMode();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        stopMoveMode();
      }
    };

    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      setSnapGuides(null);
      setMoveHintPosition(null);
      setIsTransformingShape(false);
    };
  }, [
    computeCursorMoveSnap,
    cursorMoveState,
    normalizeShape,
    setIsTransformingShape,
    setShapes,
    settings.editMode,
  ]);

  const updateLiveShapeDragPosition = useCallback(
    (id: string, x: number, y: number) => {
      pendingDragUpdateRef.current = { id, x, y };

      if (dragFrameRef.current !== null) {
        return;
      }

      dragFrameRef.current = window.requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const pending = pendingDragUpdateRef.current;
        if (!pending) {
          return;
        }

        setLiveShapeDragPositions((prev) => {
          const current = prev[pending.id];
          if (current && current.x === pending.x && current.y === pending.y) {
            return prev;
          }

          return {
            ...prev,
            [pending.id]: { x: pending.x, y: pending.y },
          };
        });
      });
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        window.cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const shapeIds = new Set(shapes.map((shape) => shape.id));
    setLiveShapeDragPositions((prev) => {
      const next: Record<string, { x: number; y: number }> = {};
      let changed = false;

      Object.entries(prev).forEach(([id, position]) => {
        if (shapeIds.has(id)) {
          next[id] = position;
          return;
        }
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [shapes]);

  useEffect(() => {
    const shapeIds = new Set(shapes.map((shape) => shape.id));
    setBindingConflictByShapeId((prev) => {
      const next: Record<string, string> = {};
      let changed = false;

      Object.entries(prev).forEach(([id, message]) => {
        if (shapeIds.has(id)) {
          next[id] = message;
          return;
        }
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [shapes]);

  useEffect(() => {
    const shapeIds = new Set(shapes.map((shape) => shape.id));
    setLiveShapeResizeRects((prev) => {
      const next: Record<string, ShapeRect> = {};
      let changed = false;

      Object.entries(prev).forEach(([id, rect]) => {
        if (shapeIds.has(id)) {
          next[id] = rect;
          return;
        }
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [shapes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsShiftPressed(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    const onWindowBlur = () => {
      setIsShiftPressed(false);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (!overlayVisible || !shapesVisible || !settings.editMode) {
      return;
    }

    const onArrowMove = (event: KeyboardEvent) => {
      let dx = 0;
      let dy = 0;

      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowUp") {
        dy = -step;
      } else if (event.key === "ArrowDown") {
        dy = step;
      } else if (event.key === "ArrowLeft") {
        dx = -step;
      } else if (event.key === "ArrowRight") {
        dx = step;
      } else {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT") {
        return;
      }

      if (selectedIds.length === 0) {
        return;
      }

      const selectedIdSet = new Set(selectedIds);

      event.preventDefault();
      event.stopPropagation();

      setShapes((prev) => {
        let movedAny = false;
        const next = prev.map((shape) => {
          if (!selectedIdSet.has(shape.id)) {
            return shape;
          }

          movedAny = true;
          return normalizeShape({
            ...shape,
            x: shape.x + dx,
            y: shape.y + dy,
          });
        });

        return movedAny ? next : prev;
      });
    };

    window.addEventListener("keydown", onArrowMove, { capture: true });
    return () => {
      window.removeEventListener("keydown", onArrowMove, { capture: true });
    };
  }, [
    normalizeShape,
    overlayVisible,
    selectedIds,
    setShapes,
    settings.editMode,
    shapesVisible,
  ]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const closeMenuOnPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".fm-shape-context-menu")) {
        return;
      }
      setContextMenu(null);
    };

    const closeMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    window.addEventListener("pointerdown", closeMenuOnPointerDown, {
      capture: true,
    });
    window.addEventListener("keydown", closeMenuOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeMenuOnPointerDown, {
        capture: true,
      });
      window.removeEventListener("keydown", closeMenuOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const shapeExists =
      contextMenu.kind !== "shape" ||
      shapes.some((shape) => shape.id === contextMenu.shapeId);

    if (
      !shapeExists ||
      !settings.editMode ||
      !overlayVisible ||
      !shapesVisible ||
      (contextMenu.kind === "canvas" && !hasClipboardShapes)
    ) {
      setContextMenu(null);
    }
  }, [
    contextMenu,
    hasClipboardShapes,
    overlayVisible,
    settings.editMode,
    shapes,
    shapesVisible,
  ]);

  return (
    <>
      {messageContextHolder}
      {overlayVisible &&
        shapesVisible &&
        shapes.map((shape) => {
          return (
            <MemoizedShapeOverlayItem
              key={shape.id}
              shape={shape}
              shapeRects={shapeRects}
              isSelected={settings.editMode && selectedIdSet.has(shape.id)}
              selectedIds={selectedIds}
              editMode={settings.editMode}
              livePosition={liveShapeDragPositions[shape.id]}
              liveRect={liveShapeResizeRects[shape.id]}
              isShiftPressed={isShiftPressed}
              buildShortcutFromEvent={buildShortcutFromEvent}
              mergeCapturedShortcut={mergeCapturedShortcut}
              updateShapeBinding={updateShapeBinding}
              buildPointerShortcut={buildPointerShortcut}
              capturePointerBinding={capturePointerBinding}
              selectSingleShape={selectSingleShape}
              toggleShapeSelection={toggleShapeSelection}
              setIsTransformingShape={setIsTransformingShape}
              setLiveShapeDragPositions={setLiveShapeDragPositions}
              setLiveShapeResizeRects={setLiveShapeResizeRects}
              setSnapGuides={setSnapGuides}
              updateLiveShapeDragPosition={updateLiveShapeDragPosition}
              setShapes={setShapes}
              normalizeShape={normalizeShape}
              removeShape={removeShape}
              rotateIdRef={rotateIdRef}
              previousBodyCursorRef={previousBodyCursorRef}
              openContextMenu={openContextMenu}
            />
          );
        })}

      {overlayVisible &&
        shapesVisible &&
        settings.editMode &&
        settings.showSnapIndicators &&
        snapGuides?.vertical !== undefined && (
          <div
            className="fm-snap-guide fm-snap-guide-vertical"
            style={{ left: snapGuides.vertical }}
          />
        )}

      {overlayVisible &&
        shapesVisible &&
        settings.editMode &&
        settings.showSnapIndicators &&
        snapGuides?.horizontal !== undefined && (
          <div
            className="fm-snap-guide fm-snap-guide-horizontal"
            style={{ top: snapGuides.horizontal }}
          />
        )}

      {overlayVisible && shapesVisible && settings.editMode && contextMenu && (
        <div
          className="fm-shape-context-menu"
          style={contextMenuPosition}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          {contextMenu.kind === "canvas" ? (
            <div className="fm-shape-context-actions fm-shape-context-actions-list">
              <button
                type="button"
                className="fm-shape-context-action"
                onClick={() => {
                  pasteCopiedShapesAt({ x: contextMenu.x, y: contextMenu.y });
                  closeContextMenu();
                }}
              >
                Paste
              </button>
            </div>
          ) : (
            contextShape && (
              <>
                <div className="fm-shape-context-actions fm-shape-context-actions-list">
                  <button
                    type="button"
                    className="fm-shape-context-action fm-shape-context-action-danger"
                    onClick={() => {
                      deleteShapeIds(getContextTargetIds());
                      closeContextMenu();
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="fm-shape-context-action"
                    onClick={() => {
                      copyShapeIds(getContextTargetIds());
                      closeContextMenu();
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="fm-shape-context-action"
                    onClick={() => {
                      cutShapeIds(getContextTargetIds());
                      closeContextMenu();
                    }}
                  >
                    Cut
                  </button>
                  {hasClipboardShapes && (
                    <button
                      type="button"
                      className="fm-shape-context-action"
                      onClick={() => {
                        pasteCopiedShapesAt({
                          x: contextMenu.x,
                          y: contextMenu.y,
                        });
                        closeContextMenu();
                      }}
                    >
                      Paste
                    </button>
                  )}
                  <button
                    type="button"
                    className="fm-shape-context-action"
                    onClick={() => {
                      startCursorMove(contextShape.id);
                    }}
                  >
                    Move
                  </button>
                </div>

                {contextShapeNeedsShortcutInput && (
                  <>
                    <label
                      htmlFor="fm-context-shortcut-input"
                      className="fm-shape-context-label"
                    >
                      Shortcut
                    </label>
                    <div
                      className={`fm-shortcut-input-shell${contextShape.keyBinding ? " fm-shortcut-input-has-value" : ""}`}
                    >
                      <input
                        id="fm-context-shortcut-input"
                        className="fm-shape-context-input"
                        value={contextShape.keyBinding}
                        placeholder="Press keys"
                        onKeyDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (event.key === "Escape") {
                            (event.target as HTMLInputElement).blur();
                            return;
                          }
                          if (
                            event.key === "Backspace" ||
                            event.key === "Delete"
                          ) {
                            updateShapeBinding(contextShape.id, "");
                            return;
                          }
                          const captured = buildShortcutFromEvent(event);
                          if (!captured) return;

                          updateShapeBinding(
                            contextShape.id,
                            mergeCapturedShortcut(
                              contextShape.keyBinding,
                              captured,
                              contextShape.id,
                            ),
                          );
                        }}
                        onMouseDown={(event) => {
                          const input = event.currentTarget as HTMLInputElement;
                          const wasFocused = document.activeElement === input;
                          event.preventDefault();
                          event.stopPropagation();
                          input.focus({ preventScroll: true });

                          if (!wasFocused) {
                            return;
                          }

                          if (event.button === 0 || event.button === 2) {
                            capturePointerBinding(event, contextShape.id);
                          }
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onWheel={(event) => {
                          const input = event.currentTarget as HTMLInputElement;
                          const wasFocused = document.activeElement === input;
                          event.stopPropagation();
                          if (!wasFocused) {
                            input.focus({ preventScroll: true });
                            return;
                          }
                          const token =
                            event.deltaY < 0 ? "Wheel Up" : "Wheel Down";
                          updateShapeBinding(
                            contextShape.id,
                            buildPointerShortcut(event, token),
                          );
                        }}
                      />
                      {contextShape.keyBinding && (
                        <span
                          className="fm-shortcut-input-overlay"
                          aria-hidden="true"
                        >
                          <ShortcutKeys combo={contextShape.keyBinding} />
                        </span>
                      )}
                    </div>
                    {contextShortcutConflict && (
                      <div className="fm-shape-context-error">
                        {contextShortcutConflict}
                      </div>
                    )}
                  </>
                )}

                <label className="fm-shape-context-label">X</label>
                <input
                  className="fm-shape-context-input"
                  type="number"
                  step={1}
                  value={Math.round(contextShape.x)}
                  onChange={(event) => {
                    const nextX = Math.round(Number(event.target.value) || 0);
                    setShapes((prev) =>
                      prev.map((item) =>
                        item.id === contextShape.id
                          ? normalizeShape({
                              ...item,
                              x: nextX,
                            })
                          : item,
                      ),
                    );
                  }}
                  aria-label="Shape X coordinate"
                />
                <label className="fm-shape-context-label">Y</label>
                <input
                  className="fm-shape-context-input"
                  type="number"
                  step={1}
                  value={Math.round(contextShape.y)}
                  onChange={(event) => {
                    const nextY = Math.round(Number(event.target.value) || 0);
                    setShapes((prev) =>
                      prev.map((item) =>
                        item.id === contextShape.id
                          ? normalizeShape({
                              ...item,
                              y: nextY,
                            })
                          : item,
                      ),
                    );
                  }}
                  aria-label="Shape Y coordinate"
                />

                <label className="fm-shape-context-label">Width</label>
                <input
                  className="fm-shape-context-input"
                  type="number"
                  min={5}
                  step={1}
                  value={Math.round(contextShape.width)}
                  onChange={(event) => {
                    const nextWidth = Math.max(
                      5,
                      Math.round(Number(event.target.value) || 0),
                    );
                    setShapes((prev) =>
                      prev.map((item) =>
                        item.id === contextShape.id
                          ? normalizeShape({
                              ...item,
                              width: nextWidth,
                            })
                          : item,
                      ),
                    );
                  }}
                  aria-label="Shape width"
                />
                <label className="fm-shape-context-label">Height</label>
                <input
                  className="fm-shape-context-input"
                  type="number"
                  min={5}
                  step={1}
                  value={Math.round(contextShape.height)}
                  onChange={(event) => {
                    const nextHeight = Math.max(
                      5,
                      Math.round(Number(event.target.value) || 0),
                    );
                    setShapes((prev) =>
                      prev.map((item) =>
                        item.id === contextShape.id
                          ? normalizeShape({
                              ...item,
                              height: nextHeight,
                            })
                          : item,
                      ),
                    );
                  }}
                  aria-label="Shape height"
                />

                <label
                  htmlFor="fm-delay-input"
                  className="fm-shape-context-label"
                >
                  Trigger Delay (ms)
                </label>
                <input
                  id="fm-delay-input"
                  className="fm-shape-context-input"
                  type="number"
                  min={0}
                  step={25}
                  value={contextShape.delayMs}
                  onChange={(event) => {
                    const nextDelay = Math.max(
                      0,
                      Math.round(Number(event.target.value) || 0),
                    );

                    setShapesWithoutHistory((prev) =>
                      prev.map((item) =>
                        item.id === contextShape.id
                          ? normalizeShape({
                              ...item,
                              delayMs: nextDelay,
                            })
                          : item,
                      ),
                    );
                  }}
                />

                <label
                  htmlFor="fm-trigger-type-input"
                  className="fm-shape-context-label"
                >
                  Trigger Type
                </label>
                <select
                  id="fm-trigger-type-input"
                  className="fm-shape-context-input"
                  value={contextShape.triggerType}
                  onChange={(event) => {
                    const nextType =
                      event.target.value === "toggle" ? "toggle" : "once";

                    if (nextType === "once") {
                      stopToggleShapeArea(contextShape.id);
                    }

                    setShapesWithoutHistory((prev) =>
                      prev.map((item) =>
                        item.id === contextShape.id
                          ? normalizeShape({
                              ...item,
                              triggerType: nextType,
                            })
                          : item,
                      ),
                    );
                  }}
                >
                  <option value="once">Once</option>
                  <option value="toggle">Toggle</option>
                </select>
              </>
            )
          )}
        </div>
      )}

      {overlayVisible &&
        shapesVisible &&
        settings.editMode &&
        cursorMoveState && (
          <div
            className="fm-shape-move-hint"
            aria-live="polite"
            style={
              moveHintPosition
                ? {
                    left:
                      typeof window === "undefined"
                        ? moveHintPosition.x + 14
                        : Math.min(
                            Math.max(moveHintPosition.x + 14, 8),
                            Math.max(8, window.innerWidth - 248),
                          ),
                    top:
                      typeof window === "undefined"
                        ? moveHintPosition.y + 14
                        : Math.min(
                            Math.max(moveHintPosition.y + 14, 8),
                            Math.max(8, window.innerHeight - 44),
                          ),
                  }
                : undefined
            }
          >
            Move mode: click to drop · Esc to cancel
          </div>
        )}

      {overlayVisible &&
        shapesVisible &&
        runningTooltip &&
        settings.showShapeTooltips && (
          <div
            className="fm-running-tooltip"
            style={{
              left: runningTooltip.x,
              top: runningTooltip.y,
            }}
          >
            <ShortcutKeys combo={runningTooltip.keyBinding} />
          </div>
        )}
    </>
  );
};
