import { App, Card, ConfigProvider, Modal, theme } from "antd";
import "antd/dist/reset.css";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Rnd } from "react-rnd";
import jsfeat from "jsfeat";
import {
  getKeyboardBindingToken,
  matchesBinding,
  matchesBindingAction,
  recordBindingAction,
  shouldIgnoreTriggeredPointerEvent,
  stopAllToggleShapeAreas,
  stopToggleShapeArea,
  triggerShapeArea,
} from "./keybinding";
import { AWAKEN_STAT_BY_ID } from "./auto-awaken/stats";
import {
  OVERLAY_SHORTCUT,
  ROOT_ID,
  buildShortcutFromEvent,
  createProfileId,
  createShape,
  getSystemDark,
  isGameplayMovementKey,
  isPointInsideShape,
  makeUniqueProfileName,
  normalizeShape,
} from "./key-mapping/constants";
import {
  isMouseWheelShortcutToken,
  shouldHandleGlobalDialogShortcut,
} from "./shortcutRuntime";
import { MapperDialog } from "./key-mapping/features/MapperDialog";
import { ShapeOverlay } from "./key-mapping/features/ShapeOverlay";
import {
  duplicateClipboardShapes,
  getClipboardShapes,
  isClipboardShortcut,
} from "./key-mapping/shapeClipboard";
import {
  getGlobalShortcutConflict,
  getReservedShapeShortcutUsage,
  type GlobalShortcutField,
} from "./key-mapping/shortcutBinding";
import { ImportMappingsModal } from "./key-mapping/modals/ImportMappingsModal";
import { ProfileNameModal } from "./key-mapping/modals/ProfileNameModal";
import { DEFAULT_SETTINGS, storage } from "./storage";
import "./styles.css";
import type {
  CharacterTabInfo,
  DialogRect,
  KeyTriggerAction,
  KeyTriggerProfile,
  MappingProfile,
  MapperSettings,
  NormalizedRect,
  ShapeMapping,
  ShapeType,
  ThemeMode,
  UtilityTab,
} from "./types";

const DEFAULT_DIALOG_RECT: DialogRect = {
  x: 40,
  y: 80,
  width: 420,
  height: 540,
};

const MAX_SHAPE_HISTORY_ENTRIES = 200;
const RUN_STATE_STORAGE_KEY = "flyff-mapper-run-state-v1";

const AUTO_IMAGE_SCALE_WIDTH = 800;
const AUTO_HOLY_COOLDOWN_MS = 1200;
const AUTO_PILLS_COOLDOWN_MS = 900;
const AUTO_PILLS_DEBUG_LOG = true;
const AUTO_PILLS_OCR_INTERVAL_MS = 900;
const AUTO_PILLS_OCR_MIN_CONFIDENCE = 45;
const AUTO_HOLY_SCAN_REGION_WIDTH_RATIO = 0.72;
const AUTO_HOLY_SCAN_REGION_HEIGHT_RATIO = 0.28;
const AUTO_HOLY_REQUIRED_CONSECUTIVE_DETECTIONS = 2;
const HP_SCAN_REGION_WIDTH_RATIO = 0.56;
const HP_SCAN_REGION_HEIGHT_RATIO = 0.2;
const MIN_AUTOMATION_CAPTURE_REGION_SIZE_PX = 12;
const AUTO_STOP_SHARED_STATE_KEY = "flyff-mapper-auto-stop-shared-v1";
const RECAPTCHA_SHARED_SIGNAL_KEY = "flyff-mapper-recaptcha-shared-v1";
const RECAPTCHA_DEBUG_LOG = true;

const isExtensionContextInvalidatedError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Extension context invalidated/i.test(message);
};

const safeSendRuntimeMessage = async <TResponse = unknown,>(
  message: unknown,
): Promise<TResponse | undefined> => {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return undefined;
  }

  try {
    return (await chrome.runtime.sendMessage(message)) as TResponse | undefined;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return undefined;
    }

    throw error;
  }
};

const safeSendRuntimeMessageWithCallback = <TResponse = unknown,>(
  message: unknown,
  callback: (response: TResponse | undefined) => void,
) => {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    callback(undefined);
    return;
  }

  try {
    chrome.runtime.sendMessage(message, (response) => {
      try {
        const runtimeErrorMessage = chrome.runtime?.lastError?.message;
        if (
          runtimeErrorMessage &&
          isExtensionContextInvalidatedError(new Error(runtimeErrorMessage))
        ) {
          callback(undefined);
          return;
        }
      } catch {
        callback(undefined);
        return;
      }

      callback(response as TResponse | undefined);
    });
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      callback(undefined);
      return;
    }

    throw error;
  }
};

const showBrowserNotification = async (
  title: string,
  body: string,
): Promise<void> => {
  const response = await safeSendRuntimeMessage<{ ok?: boolean }>({
    type: "SHOW_EXTENSION_NOTIFICATION",
    title,
    message: body,
  });

  if (response?.ok) {
    return;
  }

  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    new Notification(title, { body });
  } catch {
    // Ignore if browser blocks page-level notifications.
  }
};

const DEFAULT_AUTO_HOLY_SCAN_REGION: NormalizedRect = {
  x: 0,
  y: 0,
  width: AUTO_HOLY_SCAN_REGION_WIDTH_RATIO,
  height: AUTO_HOLY_SCAN_REGION_HEIGHT_RATIO,
};

const DEFAULT_AUTO_PILLS_SCAN_REGION: NormalizedRect = {
  x: 0,
  y: 0,
  width: HP_SCAN_REGION_WIDTH_RATIO,
  height: HP_SCAN_REGION_HEIGHT_RATIO,
};

type ViewportRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type AutomationRegionCaptureTarget = "autoHoly" | "autoPills" | "autoAwaken";

type SharedAutoStopState = {
  lastActivityAt: number;
  stopSignalId: string;
  stopSignalAt: number;
  stopSignalBy: string;
  notifiedSignalId: string;
  notifiedAt: number;
  notifiedBy: string;
};

type SharedRecaptchaSignal = {
  signalId: string;
  detectedAt: number;
  detectedBy: string;
  stopRequested: boolean;
  notifiedSignalId: string;
  notifiedAt: number;
  notifiedBy: string;
};

const getDefaultSharedAutoStopState = (): SharedAutoStopState => ({
  lastActivityAt: 0,
  stopSignalId: "",
  stopSignalAt: 0,
  stopSignalBy: "",
  notifiedSignalId: "",
  notifiedAt: 0,
  notifiedBy: "",
});

const readSharedAutoStopState = (): SharedAutoStopState => {
  try {
    const raw = localStorage.getItem(AUTO_STOP_SHARED_STATE_KEY);
    if (!raw) {
      return getDefaultSharedAutoStopState();
    }

    const parsed = JSON.parse(raw) as Partial<SharedAutoStopState>;
    return {
      lastActivityAt:
        typeof parsed.lastActivityAt === "number" &&
        Number.isFinite(parsed.lastActivityAt)
          ? parsed.lastActivityAt
          : 0,
      stopSignalId:
        typeof parsed.stopSignalId === "string" ? parsed.stopSignalId : "",
      stopSignalAt:
        typeof parsed.stopSignalAt === "number" &&
        Number.isFinite(parsed.stopSignalAt)
          ? parsed.stopSignalAt
          : 0,
      stopSignalBy:
        typeof parsed.stopSignalBy === "string" ? parsed.stopSignalBy : "",
      notifiedSignalId:
        typeof parsed.notifiedSignalId === "string"
          ? parsed.notifiedSignalId
          : "",
      notifiedAt:
        typeof parsed.notifiedAt === "number" &&
        Number.isFinite(parsed.notifiedAt)
          ? parsed.notifiedAt
          : 0,
      notifiedBy:
        typeof parsed.notifiedBy === "string" ? parsed.notifiedBy : "",
    };
  } catch {
    return getDefaultSharedAutoStopState();
  }
};

const writeSharedAutoStopState = (state: SharedAutoStopState) => {
  try {
    localStorage.setItem(AUTO_STOP_SHARED_STATE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
};

const getDefaultSharedRecaptchaSignal = (): SharedRecaptchaSignal => ({
  signalId: "",
  detectedAt: 0,
  detectedBy: "",
  stopRequested: false,
  notifiedSignalId: "",
  notifiedAt: 0,
  notifiedBy: "",
});

const readSharedRecaptchaSignal = (): SharedRecaptchaSignal => {
  try {
    const raw = localStorage.getItem(RECAPTCHA_SHARED_SIGNAL_KEY);
    if (!raw) {
      return getDefaultSharedRecaptchaSignal();
    }

    const parsed = JSON.parse(raw) as Partial<SharedRecaptchaSignal>;
    return {
      signalId: typeof parsed.signalId === "string" ? parsed.signalId : "",
      detectedAt:
        typeof parsed.detectedAt === "number" &&
        Number.isFinite(parsed.detectedAt)
          ? parsed.detectedAt
          : 0,
      detectedBy:
        typeof parsed.detectedBy === "string" ? parsed.detectedBy : "",
      stopRequested: Boolean(parsed.stopRequested),
      notifiedSignalId:
        typeof parsed.notifiedSignalId === "string"
          ? parsed.notifiedSignalId
          : "",
      notifiedAt:
        typeof parsed.notifiedAt === "number" &&
        Number.isFinite(parsed.notifiedAt)
          ? parsed.notifiedAt
          : 0,
      notifiedBy:
        typeof parsed.notifiedBy === "string" ? parsed.notifiedBy : "",
    };
  } catch {
    return getDefaultSharedRecaptchaSignal();
  }
};

const writeSharedRecaptchaSignal = (signal: SharedRecaptchaSignal) => {
  try {
    localStorage.setItem(RECAPTCHA_SHARED_SIGNAL_KEY, JSON.stringify(signal));
  } catch {
    return;
  }
};

const cloneDefaultSettings = (): MapperSettings => ({
  ...DEFAULT_SETTINGS,
  autoHoly: { ...DEFAULT_SETTINGS.autoHoly },
  autoPills: { ...DEFAULT_SETTINGS.autoPills },
});

type RgbImageData = {
  width: number;
  height: number;
  rgb: Uint8ClampedArray;
};

type HpDisplayMode = "text-current-max" | "text-percent" | "bar-geometry";
type HpTemplateState = "full" | "not-full";

type HpTemplateVariant = {
  image: RgbImageData;
  state: HpTemplateState;
  displayMode: HpDisplayMode;
  label: string;
};

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });

const loadRgbImageDataFromSrc = async (
  src: string,
  targetWidth?: number,
): Promise<RgbImageData> => {
  const image = await loadImageElement(src);
  const width = targetWidth && targetWidth > 0 ? targetWidth : image.width;
  const scale = width / image.width;
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create 2D canvas context");
  }
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return {
    width,
    height,
    rgb: data,
  };
};

const loadRgbImageDataFromDataUrl = async (
  dataUrl: string,
  targetWidth: number,
): Promise<RgbImageData> => {
  return loadRgbImageDataFromSrc(dataUrl, targetWidth);
};

const resizeRgbImageData = (
  image: RgbImageData,
  targetWidth: number,
  targetHeight: number,
): RgbImageData | null => {
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round(targetHeight));
  if (width < 2 || height < 2) {
    return null;
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) {
    return null;
  }

  sourceCtx.putImageData(
    new ImageData(new Uint8ClampedArray(image.rgb), image.width, image.height),
    0,
    0,
  );

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = width;
  targetCanvas.height = height;
  const targetCtx = targetCanvas.getContext("2d");
  if (!targetCtx) {
    return null;
  }

  targetCtx.imageSmoothingEnabled = true;
  targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
  const data = targetCtx.getImageData(0, 0, width, height).data;
  return {
    width,
    height,
    rgb: data,
  };
};

const cropRgbImageData = (
  image: RgbImageData,
  rect: { x: number; y: number; width: number; height: number },
): RgbImageData | null => {
  const startX = Math.max(0, Math.floor(rect.x));
  const startY = Math.max(0, Math.floor(rect.y));
  const endX = Math.min(image.width, Math.ceil(rect.x + rect.width));
  const endY = Math.min(image.height, Math.ceil(rect.y + rect.height));

  const width = endX - startX;
  const height = endY - startY;
  if (width < 2 || height < 2) {
    return null;
  }

  const rgb = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = ((startY + y) * image.width + startX) * 4;
    const targetOffset = y * width * 4;
    rgb.set(
      image.rgb.subarray(sourceOffset, sourceOffset + width * 4),
      targetOffset,
    );
  }

  return {
    width,
    height,
    rgb,
  };
};

const clampNormalizedRect = (region: NormalizedRect): NormalizedRect | null => {
  const x = Math.max(0, Math.min(region.x, 1));
  const y = Math.max(0, Math.min(region.y, 1));
  const width = Math.max(0, Math.min(region.width, 1 - x));
  const height = Math.max(0, Math.min(region.height, 1 - y));

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
};

const viewportRectToNormalizedRect = (
  rect: ViewportRect,
  viewportWidth: number,
  viewportHeight: number,
): NormalizedRect | null => {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    return null;
  }

  return clampNormalizedRect({
    x: rect.x / viewportWidth,
    y: rect.y / viewportHeight,
    width: rect.width / viewportWidth,
    height: rect.height / viewportHeight,
  });
};

const normalizedRectToImageRect = (
  region: NormalizedRect,
  width: number,
  height: number,
): ViewportRect => ({
  x: region.x * width,
  y: region.y * height,
  width: region.width * width,
  height: region.height * height,
});

const buildViewportSelectionRect = (
  startX: number,
  startY: number,
  clientX: number,
  clientY: number,
): ViewportRect => ({
  x: Math.min(startX, clientX),
  y: Math.min(startY, clientY),
  width: Math.abs(clientX - startX),
  height: Math.abs(clientY - startY),
});

const samplePixel = (
  rgb: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
): [number, number, number] => {
  const index = (y * width + x) * 4;
  return [rgb[index], rgb[index + 1], rgb[index + 2]];
};

const toBlurredGrayWithJsFeat = (image: RgbImageData): Uint8Array => {
  const jf = jsfeat as any;
  const src = new jf.matrix_t(image.width, image.height, jf.U8_t | jf.C1_t);
  jf.imgproc.grayscale(image.rgb, image.width, image.height, src);

  const blurred = new jf.matrix_t(image.width, image.height, jf.U8_t | jf.C1_t);
  jf.imgproc.gaussian_blur(src, blurred, 3, 0);

  return Uint8Array.from(blurred.data as Uint8Array);
};

const findTemplateLocationWithRgb = (
  source: RgbImageData,
  template: RgbImageData,
  minScore: number,
): { x: number; y: number } | null => {
  if (
    template.width > source.width ||
    template.height > source.height ||
    template.width < 2 ||
    template.height < 2
  ) {
    return null;
  }

  const tw = template.width;
  const th = template.height;
  const sw = source.width;
  const sh = source.height;
  const sourceGray = toBlurredGrayWithJsFeat(source);
  const templateGray = toBlurredGrayWithJsFeat(template);

  const area = tw * th;
  const pixelStep = area >= 7000 ? 3 : area >= 2600 ? 2 : 1;
  const searchStep = area >= 7000 ? 3 : area >= 2000 ? 2 : 1;

  const scoreAt = (startX: number, startY: number): number => {
    let diff = 0;
    let samples = 0;

    for (let ty = 0; ty < th; ty += pixelStep) {
      for (let tx = 0; tx < tw; tx += pixelStep) {
        const srcIndex = (startY + ty) * sw + startX + tx;
        const tplIndex = ty * tw + tx;
        diff += Math.abs(sourceGray[srcIndex] - templateGray[tplIndex]);
        samples += 1;
      }
    }

    if (samples === 0) {
      return 0;
    }

    return 1 - diff / (samples * 255);
  };

  const requiredScore = minScore;
  const bestPossibleScore = 0.995;

  let bestScore = -1;
  let bestX = 0;
  let bestY = 0;
  let shouldStopSearch = false;

  for (let y = 0; y <= sh - th && !shouldStopSearch; y += searchStep) {
    for (let x = 0; x <= sw - tw; x += searchStep) {
      const score = scoreAt(x, y);
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
        if (bestScore >= bestPossibleScore) {
          shouldStopSearch = true;
          break;
        }
      }
    }
  }

  if (searchStep > 1) {
    const fromX = Math.max(0, bestX - searchStep);
    const toX = Math.min(sw - tw, bestX + searchStep);
    const fromY = Math.max(0, bestY - searchStep);
    const toY = Math.min(sh - th, bestY + searchStep);

    for (let y = fromY; y <= toY; y += 1) {
      for (let x = fromX; x <= toX; x += 1) {
        const score = scoreAt(x, y);
        if (score > bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }
  }

  if (bestScore < requiredScore) {
    return null;
  }

  return {
    x: Math.round(bestX + tw / 2),
    y: Math.round(bestY + th / 2),
  };
};

const matchTemplateWithMatcher = (
  source: RgbImageData,
  template: RgbImageData,
  minScore: number,
): boolean => {
  if (
    template.width > source.width ||
    template.height > source.height ||
    template.width < 2 ||
    template.height < 2
  ) {
    return false;
  }

  return findTemplateLocationWithRgb(source, template, minScore) !== null;
};

/**
 * Returns the top-left pixel position of
 * the best match inside `source`, or null when the score is below `minScore`.
 */
const findTemplateLocationWithMatcher = (
  source: RgbImageData,
  template: RgbImageData,
  minScore: number,
): { x: number; y: number } | null => {
  if (
    template.width > source.width ||
    template.height > source.height ||
    template.width < 2 ||
    template.height < 2
  ) {
    return null;
  }

  return findTemplateLocationWithRgb(source, template, minScore);
};

type AwakenButtonMatch = {
  x: number;
  y: number;
  regionLabel: "full" | "bottom" | "bottom-center";
  scale: number;
  templateLabel: "button_image.png" | "button_image2.png";
};

const findAwakenButtonMatch = (
  regionImg: RgbImageData,
  buttonTemplate: RgbImageData,
  templateLabel: "button_image.png" | "button_image2.png",
): AwakenButtonMatch | null => {
  const bottomY = Math.round(regionImg.height * 0.5);
  const bottomImage =
    cropRgbImageData(regionImg, {
      x: 0,
      y: bottomY,
      width: regionImg.width,
      height: regionImg.height - bottomY,
    }) ?? regionImg;

  const centerWidth = Math.round(regionImg.width * 0.66);
  const centerX = Math.round((regionImg.width - centerWidth) / 2);
  const bottomCenterImage =
    cropRgbImageData(regionImg, {
      x: centerX,
      y: bottomY,
      width: centerWidth,
      height: regionImg.height - bottomY,
    }) ?? bottomImage;

  const searchRegions: Array<{
    label: "bottom-center" | "bottom" | "full";
    image: RgbImageData;
    offsetX: number;
    offsetY: number;
  }> = [
    {
      label: "bottom-center",
      image: bottomCenterImage,
      offsetX: centerX,
      offsetY: bottomY,
    },
    {
      label: "bottom",
      image: bottomImage,
      offsetX: 0,
      offsetY: bottomY,
    },
    {
      label: "full",
      image: regionImg,
      offsetX: 0,
      offsetY: 0,
    },
  ];

  const scales = [0.8, 0.9, 0.96, 1, 1.08, 1.16, 1.24];

  for (const searchRegion of searchRegions) {
    for (const scale of scales) {
      const scaledTemplate =
        scale === 1
          ? buttonTemplate
          : resizeRgbImageData(
              buttonTemplate,
              buttonTemplate.width * scale,
              buttonTemplate.height * scale,
            );

      if (!scaledTemplate) {
        continue;
      }

      const matcherThreshold = searchRegion.label === "full" ? 0.66 : 0.6;
      const cvLoc = findTemplateLocationWithMatcher(
        searchRegion.image,
        scaledTemplate,
        matcherThreshold,
      );

      if (cvLoc) {
        return {
          x: cvLoc.x + searchRegion.offsetX,
          y: cvLoc.y + searchRegion.offsetY,
          regionLabel: searchRegion.label,
          scale,
          templateLabel,
        };
      }
    }
  }

  return null;
};

/**
 * Locate the HP bar row in a scan image by finding the topmost band of rows
 * that contain a sufficiently wide span of red-ish pixels.
 *
 * The HP bar is the only red bar in the character status window (MP is
 * blue/teal, FP is green/orange), so this approach reliably identifies the
 * HP row regardless of:
 *  - which HP display mode is active (raw values / percentage / clean)
 *  - the current HP level
 *  - the character window size (window is resizable)
 */
const locateHpBarRowByColor = (
  image: RgbImageData,
  minSpanFraction = 0.03,
): { y: number; height: number } | null => {
  const minSpan = Math.max(8, Math.round(image.width * minSpanFraction));
  const rowSpans = new Array<number>(image.height).fill(0);
  let strongestY = -1;
  let strongestSpan = 0;

  for (let y = 0; y < image.height; y += 1) {
    let spanLen = 0;
    let maxSpan = 0;
    for (let x = 0; x < image.width; x += 1) {
      const [r, g, b] = samplePixel(image.rgb, image.width, x, y);
      if (r > 40 && g < 90 && b < 90) {
        spanLen += 1;
        if (spanLen > maxSpan) maxSpan = spanLen;
      } else {
        spanLen = 0;
      }
    }

    rowSpans[y] = maxSpan;
    if (maxSpan > strongestSpan) {
      strongestSpan = maxSpan;
      strongestY = y;
    }
  }

  if (strongestY < 0 || strongestSpan < minSpan) {
    return null;
  }

  const bandThreshold = Math.max(minSpan, Math.round(strongestSpan * 0.6));
  let topY = strongestY;
  let bottomY = strongestY;

  while (topY > 0 && rowSpans[topY - 1] >= bandThreshold) {
    topY -= 1;
  }
  while (bottomY + 1 < image.height && rowSpans[bottomY + 1] >= bandThreshold) {
    bottomY += 1;
  }

  const currentHeight = bottomY - topY + 1;
  if (currentHeight < MIN_HP_ROW_BAND_HEIGHT_PX) {
    const needed = MIN_HP_ROW_BAND_HEIGHT_PX - currentHeight;
    const growUp = Math.min(topY, Math.floor(needed / 2));
    const growDown = Math.min(image.height - 1 - bottomY, needed - growUp);
    topY -= growUp;
    bottomY += growDown;
  }

  return { y: topY, height: Math.max(1, bottomY - topY + 1) };
};

const estimateHpPercentByColor = (
  image: RgbImageData,
): {
  hpPercent: number | null;
  trackWidth: number | null;
  filledWidth: number | null;
  trackStartX: number | null;
  trackEndX: number | null;
  displayMode: HpDisplayMode;
  bridgedGapCount: number;
  largestBridgedGap: number;
} => {
  const classifyHpDisplayMode = (src: RgbImageData): HpDisplayMode => {
    const minX = Math.floor(src.width * 0.18);
    const maxX = Math.ceil(src.width * 0.92);
    const minY = 0;
    const maxY = Math.max(1, src.height - 1);
    const centerWidth = Math.max(1, maxX - minX + 1);
    const centerHeight = Math.max(1, maxY - minY + 1);
    const mask = new Array<boolean>(centerWidth * centerHeight).fill(false);

    let textPixelCount = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const [r, g, b] = samplePixel(src.rgb, src.width, x, y);
        const brightWhite = r > 158 && g > 158 && b > 158;
        const brightRed = r > 148 && r - g > 26 && r - b > 26;
        const brightText = brightWhite || brightRed;
        if (!brightText) {
          continue;
        }

        const localX = x - minX;
        const localY = y - minY;
        mask[localY * centerWidth + localX] = true;
        textPixelCount += 1;
      }
    }

    const minTextPixels = Math.max(
      10,
      Math.round(centerWidth * centerHeight * 0.02),
    );
    if (textPixelCount < minTextPixels) {
      return "bar-geometry";
    }

    const visited = new Array<boolean>(mask.length).fill(false);
    let hasSlashLikeGlyph = false;

    for (let y = 0; y < centerHeight; y += 1) {
      for (let x = 0; x < centerWidth; x += 1) {
        const idx = y * centerWidth + x;
        if (!mask[idx] || visited[idx]) {
          continue;
        }

        const queue: Array<[number, number]> = [[x, y]];
        visited[idx] = true;
        let qIndex = 0;
        let componentPixels = 0;
        let minCx = x;
        let maxCx = x;
        let minCy = y;
        let maxCy = y;
        const topRows = new Array<number>();
        const bottomRows = new Array<number>();

        while (qIndex < queue.length) {
          const [cx, cy] = queue[qIndex++];
          componentPixels += 1;
          if (cx < minCx) minCx = cx;
          if (cx > maxCx) maxCx = cx;
          if (cy < minCy) minCy = cy;
          if (cy > maxCy) maxCy = cy;

          if (cy <= minCy + 1) {
            topRows.push(cx);
          }
          if (cy >= maxCy - 1) {
            bottomRows.push(cx);
          }

          for (
            let ny = Math.max(0, cy - 1);
            ny <= Math.min(centerHeight - 1, cy + 1);
            ny += 1
          ) {
            for (
              let nx = Math.max(0, cx - 1);
              nx <= Math.min(centerWidth - 1, cx + 1);
              nx += 1
            ) {
              const nIdx = ny * centerWidth + nx;
              if (!mask[nIdx] || visited[nIdx]) {
                continue;
              }
              visited[nIdx] = true;
              queue.push([nx, ny]);
            }
          }
        }

        const compWidth = maxCx - minCx + 1;
        const compHeight = maxCy - minCy + 1;
        if (componentPixels < 3) {
          continue;
        }

        const topAvgX =
          topRows.length > 0
            ? topRows.reduce((sum, value) => sum + value, 0) / topRows.length
            : minCx;
        const bottomAvgX =
          bottomRows.length > 0
            ? bottomRows.reduce((sum, value) => sum + value, 0) /
              bottomRows.length
            : maxCx;
        const slant = Math.abs(bottomAvgX - topAvgX);

        if (
          compHeight >= Math.max(2, Math.round(centerHeight * 0.65)) &&
          compWidth <= Math.max(4, Math.round(centerWidth * 0.08)) &&
          componentPixels <= compHeight * 2 &&
          slant >= 0.8
        ) {
          hasSlashLikeGlyph = true;
          break;
        }
      }
      if (hasSlashLikeGlyph) {
        break;
      }
    }

    return hasSlashLikeGlyph ? "text-current-max" : "text-percent";
  };

  const minColumnHits = Math.max(1, Math.floor(image.height * 0.35));
  const redHits = new Array<number>(image.width).fill(0);
  const blueBorderHits = new Array<number>(image.width).fill(0);

  for (let x = 0; x < image.width; x += 1) {
    for (let y = 0; y < image.height; y += 1) {
      const [r, g, b] = samplePixel(image.rgb, image.width, x, y);
      const isRedFill = r > 45 && r - g > 14 && r - b > 14;
      const isBlueBorder = b > 60 && b - r > 20 && b - g > 10;

      if (isRedFill) {
        redHits[x] += 1;
      }
      if (isBlueBorder) {
        blueBorderHits[x] += 1;
      }
    }
  }

  const firstRedX = redHits.findIndex((count) => count >= minColumnHits);
  if (firstRedX < 0) {
    return {
      hpPercent: null,
      trackWidth: null,
      filledWidth: null,
      trackStartX: null,
      trackEndX: null,
      displayMode: classifyHpDisplayMode(image),
      bridgedGapCount: 0,
      largestBridgedGap: 0,
    };
  }

  const rightSearchLimit = Math.min(
    image.width - 1,
    firstRedX + Math.round(image.width * 0.75),
  );
  let rightBorderX = -1;
  for (let x = firstRedX + 4; x <= rightSearchLimit; x += 1) {
    if (blueBorderHits[x] >= minColumnHits) {
      rightBorderX = x;
    }
  }

  let trackMaxX = rightBorderX > firstRedX ? rightBorderX - 1 : -1;
  if (trackMaxX < firstRedX) {
    for (let x = image.width - 1; x >= firstRedX; x -= 1) {
      if (redHits[x] >= 1) {
        trackMaxX = x;
        break;
      }
    }
  }

  if (trackMaxX < firstRedX) {
    return {
      hpPercent: null,
      trackWidth: null,
      filledWidth: null,
      trackStartX: firstRedX,
      trackEndX: null,
      displayMode: classifyHpDisplayMode(image),
      bridgedGapCount: 0,
      largestBridgedGap: 0,
    };
  }

  const filledMask = new Array<boolean>(image.width).fill(false);
  for (let x = firstRedX; x <= trackMaxX; x += 1) {
    filledMask[x] = redHits[x] >= 1;
  }

  // Bridge gaps caused by overlaid HP text (current/max or percentage) so
  // these characters do not collapse detected HP. Real missing-HP gap remains
  // unfilled because it is not enclosed by red on both sides.
  const maxBridgeGapPx = Math.max(
    6,
    Math.round((trackMaxX - firstRedX + 1) * 0.18),
  );
  let x = firstRedX;
  let bridgedGapCount = 0;
  let largestBridgedGap = 0;
  while (x <= trackMaxX) {
    if (filledMask[x]) {
      x += 1;
      continue;
    }

    const gapStart = x;
    while (x <= trackMaxX && !filledMask[x]) {
      x += 1;
    }
    const gapEnd = x - 1;
    const gapLength = gapEnd - gapStart + 1;
    const hasLeftFill = gapStart > firstRedX && filledMask[gapStart - 1];
    const hasRightFill = x <= trackMaxX && filledMask[x];

    if (hasLeftFill && hasRightFill && gapLength <= maxBridgeGapPx) {
      for (let gx = gapStart; gx <= gapEnd; gx += 1) {
        filledMask[gx] = true;
      }
      bridgedGapCount += 1;
      if (gapLength > largestBridgedGap) {
        largestBridgedGap = gapLength;
      }
    }
  }

  let filledMaxX = firstRedX;
  for (let col = firstRedX; col <= trackMaxX; col += 1) {
    if (filledMask[col]) {
      filledMaxX = col;
    }
  }

  const totalWidth = Math.max(1, trackMaxX - firstRedX + 1);
  const filledWidth = Math.max(0, filledMaxX - firstRedX + 1);
  const hpPercent = Math.max(
    0,
    Math.min(100, Math.round((filledWidth / totalWidth) * 100)),
  );
  const displayMode = classifyHpDisplayMode(image);

  return {
    hpPercent,
    trackWidth: totalWidth,
    filledWidth,
    trackStartX: firstRedX,
    trackEndX: trackMaxX,
    displayMode,
    bridgedGapCount,
    largestBridgedGap,
  };
};

const parseHpPercentFromOcrText = (
  text: string,
): { hpPercent: number | null; mode: HpDisplayMode | null } => {
  const normalized = text
    .replace(/[Oo]/g, "0")
    .replace(/[lI|]/g, "1")
    .replace(/,/g, ".")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return { hpPercent: null, mode: null };
  }

  const currentMaxMatch = normalized.match(/(\d{1,6})\s*\/\s*(\d{1,6})/);
  if (currentMaxMatch) {
    const current = Number(currentMaxMatch[1]);
    const max = Number(currentMaxMatch[2]);
    if (Number.isFinite(current) && Number.isFinite(max) && max > 0) {
      const hpPercent = Math.max(
        0,
        Math.min(100, Math.round((Math.max(0, current) / max) * 100)),
      );
      return { hpPercent, mode: "text-current-max" };
    }
  }

  const percentMatch = normalized.match(/(\d{1,3}(?:\.\d{1,2})?)\s*%/);
  if (percentMatch) {
    const percent = Number(percentMatch[1]);
    if (Number.isFinite(percent)) {
      const hpPercent = Math.max(0, Math.min(100, Math.round(percent)));
      return { hpPercent, mode: "text-percent" };
    }
  }

  return { hpPercent: null, mode: null };
};

const buildHpOcrCanvas = (image: RgbImageData): HTMLCanvasElement | null => {
  if (typeof document === "undefined") {
    return null;
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceCtx = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sourceCtx) {
    return null;
  }

  const sourceImageData = sourceCtx.createImageData(image.width, image.height);
  for (
    let srcOffset = 0, rgbaOffset = 0;
    srcOffset < image.rgb.length;
    srcOffset += 3, rgbaOffset += 4
  ) {
    sourceImageData.data[rgbaOffset] = image.rgb[srcOffset];
    sourceImageData.data[rgbaOffset + 1] = image.rgb[srcOffset + 1];
    sourceImageData.data[rgbaOffset + 2] = image.rgb[srcOffset + 2];
    sourceImageData.data[rgbaOffset + 3] = 255;
  }
  sourceCtx.putImageData(sourceImageData, 0, 0);

  const scale = 4;
  const ocrCanvas = document.createElement("canvas");
  ocrCanvas.width = Math.max(1, image.width * scale);
  ocrCanvas.height = Math.max(1, image.height * scale);
  const ocrCtx = ocrCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!ocrCtx) {
    return null;
  }

  ocrCtx.imageSmoothingEnabled = false;
  ocrCtx.drawImage(sourceCanvas, 0, 0, ocrCanvas.width, ocrCanvas.height);

  const roiMinX = Math.floor(ocrCanvas.width * 0.15);
  const roiMaxX = Math.ceil(ocrCanvas.width * 0.95);
  const pixels = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);

  for (let y = 0; y < ocrCanvas.height; y += 1) {
    for (let x = 0; x < ocrCanvas.width; x += 1) {
      const idx = (y * ocrCanvas.width + x) * 4;
      const r = pixels.data[idx];
      const g = pixels.data[idx + 1];
      const b = pixels.data[idx + 2];

      const inTextRoi = x >= roiMinX && x <= roiMaxX;
      const brightWhite = r > 150 && g > 150 && b > 150;
      const brightRed = r > 150 && r - g > 30 && r - b > 30;
      const isTextLike = inTextRoi && (brightWhite || brightRed);
      const out = isTextLike ? 0 : 255;

      pixels.data[idx] = out;
      pixels.data[idx + 1] = out;
      pixels.data[idx + 2] = out;
      pixels.data[idx + 3] = 255;
    }
  }

  ocrCtx.putImageData(pixels, 0, 0);
  return ocrCanvas;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildDuplicateProfileName = (
  existingProfiles: MappingProfile[],
  profileName: string,
): string => {
  const base = profileName.trim() || "Profile";
  const numberedPattern = new RegExp(
    `^${escapeRegExp(base)}\\s*\\((\\d+)\\)$`,
    "i",
  );

  const existingNumbers = existingProfiles
    .map((profile) => profile.name.trim())
    .map((name) => {
      const matched = numberedPattern.exec(name);
      return matched ? Number(matched[1]) : null;
    })
    .filter((value): value is number => value !== null);

  const nextNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

  return `${base} (${nextNumber})`;
};

const GLOBAL_SHORTCUT_FIELDS: GlobalShortcutField[] = [
  "addKeyMapShortcut",
  "toggleModeShortcut",
  "focusCanvasShortcut",
  "toggleShapesShortcut",
  "setZeroOpacityShortcut",
  "toggleDialogShortcut",
];

const GLOBAL_SHORTCUT_LABELS: Record<GlobalShortcutField, string> = {
  addKeyMapShortcut: "Add Key Map",
  toggleModeShortcut: "Start/Stop Mode",
  focusCanvasShortcut: "Focus Canvas",
  toggleShapesShortcut: "Show/Hide Shapes",
  setZeroOpacityShortcut: "Opacity 0/100",
  toggleDialogShortcut: "Toggle Dialog",
};

type MouseSyncEventPayload = {
  eventType:
    | "pointermove"
    | "pointerdown"
    | "pointerup"
    | "mousemove"
    | "mousedown"
    | "mouseup"
    | "click"
    | "contextmenu"
    | "wheel";
  clientX: number;
  clientY: number;
  button: number;
  buttons: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  ratioX?: number;
  ratioY?: number;
  sourceViewportWidth?: number;
  sourceViewportHeight?: number;
  deltaX?: number;
  deltaY?: number;
  pointerType?: string;
  isCanvasInteraction?: boolean;
};

type KeyboardSyncEventPayload = {
  eventType: "keydown" | "keyup";
  key: string;
  code: string;
  repeat: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

type AutoPillsDebugInfo = {
  hpPercent: number | null;
  hpSource: "ocr" | "bar-geometry" | "template" | "unknown";
  modeSource: "template" | "ocr" | "bar-geometry" | "unknown";
  decisionPath:
    | "text-mode-ocr"
    | "bar-geometry-color"
    | "template-full-confirm"
    | "unresolved";
  colorEstimatedHp: number | null;
  ocrEstimatedHp: number | null;
  ocrMode: HpDisplayMode | null;
  ocrConfidence: number | null;
  ocrRawText: string | null;
  templateEstimatedHp: number | null;
  templateState: HpTemplateState | null;
  templateMatchedVariant: string | null;
  displayMode: HpDisplayMode;
  bridgedGapCount: number;
  largestBridgedGap: number;
  trackWidth: number | null;
  filledWidth: number | null;
  trackStartX: number | null;
  trackEndX: number | null;
  threshold: number;
  triggerState: "safe" | "trigger" | "unknown";
  rowY: number | null;
  rowHeight: number | null;
  updatedAt: number;
};

type AutoHolyDebugInfo = {
  hasDebuff: boolean;
  detectedType: "root" | "stun" | "none";
  mode: "jsfeat";
  regionSource: "captured" | "default";
  consecutiveDetections: number;
  requiredConsecutive: number;
  triggered: boolean;
  updatedAt: number;
};

const MOUSE_SYNC_MOVE_INTERVAL_MS = 16;
const REMOTE_CURSOR_HIDE_DELAY_MS = 900;
const MIN_HP_ROW_BAND_HEIGHT_PX = 4;
const CHARACTER_TITLE_PATTERN = /^(.+?)\s*-\s*Flyff Universe$/i;

const getCharacterNameFromTitle = (title: string): string | null => {
  const trimmed = title.trim();
  const match = trimmed.match(CHARACTER_TITLE_PATTERN);
  const candidate = match?.[1]?.trim();
  return candidate ? candidate : null;
};

function MapperApp() {
  const [modal, modalContextHolder] = Modal.useModal();
  const initialProfilesState = useMemo(() => storage.loadProfiles(), []);
  const initialUiState = useMemo(() => storage.loadUiState(), []);
  const [settings, setSettings] = useState<MapperSettings>(() => {
    const activeProfile = initialProfilesState.profiles.find(
      (profile) => profile.id === initialProfilesState.activeProfileId,
    );

    return (
      activeProfile?.settings ??
      initialProfilesState.profiles[0]?.settings ??
      storage.loadSettings()
    );
  });
  const [profiles, setProfiles] = useState<MappingProfile[]>(
    initialProfilesState.profiles,
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initialProfilesState.activeProfileId,
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    initialProfilesState.activeProfileId,
  );
  const [shapes, setShapesState] = useState<ShapeMapping[]>(() => {
    const activeProfile = initialProfilesState.profiles.find(
      (profile) => profile.id === initialProfilesState.activeProfileId,
    );
    return (
      activeProfile?.shapes ?? initialProfilesState.profiles[0]?.shapes ?? []
    );
  });
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [draftShape, setDraftShape] = useState<ShapeMapping>(() =>
    normalizeShape({
      ...createShape("rectangle"),
      opacity: shapes[0]?.opacity ?? 1,
    }),
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [pendingImportText, setPendingImportText] = useState("");
  const [profileNameDialogOpen, setProfileNameDialogOpen] = useState(false);
  const [profileNameDialogMode, setProfileNameDialogMode] = useState<
    "create" | "rename" | "import"
  >("rename");
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileNameError, setProfileNameError] = useState("");
  const [activeProfileName, setActiveProfileName] = useState(() => {
    const activeProfile = initialProfilesState.profiles.find(
      (profile) => profile.id === initialProfilesState.activeProfileId,
    );
    return activeProfile?.name ?? "";
  });
  const [copiedShapes, setCopiedShapes] = useState<ShapeMapping[]>([]);
  const [isTransformingShape, setIsTransformingShape] = useState(false);
  const [shapesVisible, setShapesVisible] = useState(true);
  const [runningTooltip, setRunningTooltip] = useState<{
    x: number;
    y: number;
    keyBinding: string;
  } | null>(null);
  const [selectedPaletteShape, setSelectedPaletteShape] = useState<ShapeType>(
    initialUiState.selectedPaletteShape,
  );
  const [activeUtilityTab, setActiveUtilityTab] = useState<UtilityTab>(
    initialUiState.selectedUtilityTab,
  );
  const [dialogRect, setDialogRect] = useState<DialogRect>(
    initialUiState.dialogRect,
  );
  const [globalShortcutErrors, setGlobalShortcutErrors] = useState<
    Partial<Record<GlobalShortcutField, string>>
  >({});
  const [keyTriggerProfiles, setKeyTriggerProfiles] = useState<
    KeyTriggerProfile[]
  >(() => storage.loadKeyTriggerState().profiles);
  const [keyTriggerCharacters, setKeyTriggerCharacters] = useState<
    CharacterTabInfo[]
  >([]);
  const [selectedKeyTriggerTabIds, setSelectedKeyTriggerTabIds] = useState<
    number[]
  >(() => storage.loadKeyTriggerTargetTabIds());
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [
    keyTriggerCharacterProfileMapping,
    setKeyTriggerCharacterProfileMapping,
  ] = useState<Record<string, string>>(() =>
    storage.loadKeyTriggerCharacterProfileMapping(),
  );
  const [automationRegionCaptureTarget, setAutomationRegionCaptureTarget] =
    useState<AutomationRegionCaptureTarget | null>(null);
  const [automationRegionCaptureRect, setAutomationRegionCaptureRect] =
    useState<ViewportRect | null>(null);

  const rotateIdRef = useRef<string | null>(null);
  const previousBodyCursorRef = useRef<string | null>(null);
  const previousCanvasPointerEventsRef = useRef<string | null>(null);
  const latestShapesRef = useRef<ShapeMapping[]>(shapes);
  const latestSettingsRef = useRef<MapperSettings>(settings);
  const latestProfilesRef = useRef<MappingProfile[]>(profiles);
  const previousActiveProfileIdRef = useRef(activeProfileId);
  const isSwitchingProfileRef = useRef(false);
  const previousShapeIdsRef = useRef<Set<string>>(new Set());
  const shapeBindingHistoryRef = useRef<
    Array<{ token: string; timestamp: number }>
  >([]);
  const rightClickTrackerRef = useRef(0);
  const selectedPaletteShapeRef = useRef<ShapeType>(selectedPaletteShape);
  const shapeUndoStackRef = useRef<ShapeMapping[][]>([]);
  const shapeRedoStackRef = useRef<ShapeMapping[][]>([]);
  const rotateStartShapesRef = useRef<ShapeMapping[] | null>(null);
  const activeKeyTriggerTimersRef = useRef<Map<string, number[]>>(new Map());
  const lastActivityRef = useRef<number>(Date.now());
  const remoteCursorRef = useRef<HTMLDivElement | null>(null);
  const remoteCursorHideTimerRef = useRef<number | null>(null);
  const localMouseDownRef = useRef(false);
  const lastMouseMoveSyncTimeRef = useRef(0);
  const isDispatchingKeyTriggerRef = useRef(false);
  const isApplyingRemoteKeyboardSyncRef = useRef(false);
  const previousEditModeRef = useRef(settings.editMode);
  const autoHolyLastTriggerRef = useRef(0);
  const autoHolyConsecutiveDetectionsRef = useRef(0);
  const autoPillsLastTriggerRef = useRef(0);
  const autoPillsLastDebugSignatureRef = useRef<string>("");
  const hpOcrWorkerRef = useRef<any | null>(null);
  const awakenOcrWorkerRef = useRef<any | null>(null);
  const awakenOcrWorkerInitRef = useRef<Promise<any | null> | null>(null);
  const autoAwakenRunningRef = useRef(false);
  const awakenButtonTemplateRef = useRef<RgbImageData | null>(null);
  const [autoAwakenRunning, setAutoAwakenRunning] = useState(false);
  const [autoAwakenStatus, setAutoAwakenStatus] = useState("");
  const [autoAwakenLogs, setAutoAwakenLogs] = useState<string[]>([]);
  const hpOcrWorkerInitRef = useRef<Promise<any | null> | null>(null);
  const hpOcrBusyRef = useRef(false);
  const hpOcrLastResultRef = useRef<{
    hpPercent: number | null;
    mode: HpDisplayMode | null;
    confidence: number | null;
    rawText: string | null;
    updatedAt: number;
  } | null>(null);
  const autoStopTabIdRef = useRef(
    `auto-stop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const autoStopLastHandledSignalRef = useRef("");
  const autoStopLastNotifiedSignalRef = useRef("");
  const recaptchaLastHandledSignalRef = useRef("");
  const automationRegionCaptureStartRef = useRef<{
    x: number;
    y: number;
    pointerId: number;
  } | null>(null);
  const [autoStopCountdown, setAutoStopCountdown] = useState<number | null>(
    null,
  );
  const [autoPillsDebugInfo, setAutoPillsDebugInfo] =
    useState<AutoPillsDebugInfo | null>(null);
  const [autoPillsDebugPanelPos, setAutoPillsDebugPanelPos] = useState(() => ({
    x: Math.max(10, window.innerWidth - 300),
    y: 14,
  }));
  const [autoHolyDebugInfo, setAutoHolyDebugInfo] =
    useState<AutoHolyDebugInfo | null>(null);
  const [autoHolyDebugPanelPos, setAutoHolyDebugPanelPos] = useState(() => ({
    x: Math.max(10, window.innerWidth - 600),
    y: 14,
  }));

  const cloneShapesSnapshot = useCallback(
    (source: ShapeMapping[]): ShapeMapping[] =>
      source.map((shape) => ({ ...shape })),
    [],
  );

  const areShapesEqual = useCallback(
    (left: ShapeMapping[], right: ShapeMapping[]) => {
      if (left.length !== right.length) {
        return false;
      }

      return JSON.stringify(left) === JSON.stringify(right);
    },
    [],
  );

  const resetShapeHistory = useCallback(() => {
    shapeUndoStackRef.current = [];
    shapeRedoStackRef.current = [];
  }, []);

  const pushShapeUndoSnapshot = useCallback(
    (snapshot: ShapeMapping[]) => {
      shapeUndoStackRef.current.push(cloneShapesSnapshot(snapshot));
      if (shapeUndoStackRef.current.length > MAX_SHAPE_HISTORY_ENTRIES) {
        shapeUndoStackRef.current.shift();
      }
    },
    [cloneShapesSnapshot],
  );

  const updateShapes = useCallback(
    (
      updater: SetStateAction<ShapeMapping[]>,
      options?: { recordHistory?: boolean; clearRedo?: boolean },
    ) => {
      const { recordHistory = true, clearRedo = true } = options ?? {};

      setShapesState((prev) => {
        const nextRaw =
          typeof updater === "function"
            ? (updater as (prevState: ShapeMapping[]) => ShapeMapping[])(prev)
            : updater;
        const next = cloneShapesSnapshot(nextRaw);

        if (areShapesEqual(prev, next)) {
          return prev;
        }

        if (recordHistory) {
          pushShapeUndoSnapshot(prev);
          if (clearRedo) {
            shapeRedoStackRef.current = [];
          }
        }

        return next;
      });
    },
    [areShapesEqual, cloneShapesSnapshot, pushShapeUndoSnapshot],
  );

  const setShapes = useCallback(
    (updater: SetStateAction<ShapeMapping[]>) => {
      updateShapes(updater, { recordHistory: true, clearRedo: true });
    },
    [updateShapes],
  );

  const setShapesWithoutHistory = useCallback(
    (updater: SetStateAction<ShapeMapping[]>) => {
      updateShapes(updater, { recordHistory: false, clearRedo: false });
    },
    [updateShapes],
  );

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );

  const selectedShape = useMemo(
    () => shapes.find((shape) => shape.id === selectedId) ?? null,
    [selectedId, shapes],
  );

  const selectSingleShape = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  }, []);

  const toggleShapeSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((item) => item !== id) : [...prev, id];
      setSelectedId(next.length > 0 ? next[next.length - 1] : null);
      return next;
    });
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const keyTriggerCurrentCharacterSelectedProfileId = useMemo(() => {
    const currentCharacterNameFromTitle = getCharacterNameFromTitle(
      document.title,
    );
    const currentCharacterName =
      currentCharacterNameFromTitle ??
      keyTriggerCharacters.find(
      (tab) => tab.id === currentTabId,
      )?.name;

    if (!currentCharacterName) {
      return null;
    }

    const savedProfileId =
      keyTriggerCharacterProfileMapping[currentCharacterName];
    if (
      savedProfileId &&
      keyTriggerProfiles.some((profile) => profile.id === savedProfileId)
    ) {
      return savedProfileId;
    }

    return null;
  }, [
    currentTabId,
    keyTriggerCharacters,
    keyTriggerCharacterProfileMapping,
    keyTriggerProfiles,
  ]);

  const appliedTheme = useMemo(() => {
    if (settings.theme === "system") return getSystemDark() ? "dark" : "light";
    return settings.theme;
  }, [settings.theme]);

  const importAnalysis = useMemo(() => {
    const raw = importText.trim();
    if (!raw) {
      return {
        isValidJson: false,
        hasImportData: false,
        profileCount: 0,
        keyTriggerProfileCount: 0,
        missingNameCount: 0,
        parseError: "Paste mapping JSON to import.",
      };
    }

    try {
      const parsed = JSON.parse(raw) as {
        profileName?: string;
        shapes?: ShapeMapping[];
        profiles?: Array<{ name?: string; shapes?: ShapeMapping[] }>;
        keyTriggerProfiles?: unknown[];
      };

      let profileCount = 0;
      let missingNameCount = 0;

      if (Array.isArray(parsed.profiles)) {
        parsed.profiles.forEach((profile) => {
          if (!Array.isArray(profile.shapes)) {
            return;
          }
          profileCount += 1;
          if (
            !(
              typeof profile.name === "string" && profile.name.trim().length > 0
            )
          ) {
            missingNameCount += 1;
          }
        });
      }

      if (Array.isArray(parsed.shapes)) {
        profileCount += 1;
        if (
          !(
            typeof parsed.profileName === "string" &&
            parsed.profileName.trim().length > 0
          )
        ) {
          missingNameCount += 1;
        }
      }

      const keyTriggerProfileCount = Array.isArray(parsed.keyTriggerProfiles)
        ? parsed.keyTriggerProfiles.length
        : 0;

      return {
        isValidJson: true,
        hasImportData: profileCount > 0 || keyTriggerProfileCount > 0,
        profileCount,
        keyTriggerProfileCount,
        missingNameCount,
        parseError: "",
      };
    } catch {
      return {
        isValidJson: false,
        hasImportData: false,
        profileCount: 0,
        keyTriggerProfileCount: 0,
        missingNameCount: 0,
        parseError: "Invalid JSON format.",
      };
    }
  }, [importText]);

  const canImportNow =
    importAnalysis.isValidJson && importAnalysis.hasImportData;

  useEffect(() => {
    latestShapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    const currentShapeIds = new Set(shapes.map((shape) => shape.id));
    previousShapeIdsRef.current.forEach((shapeId) => {
      if (!currentShapeIds.has(shapeId)) {
        stopToggleShapeArea(shapeId);
      }
    });
    previousShapeIdsRef.current = currentShapeIds;
  }, [shapes]);

  useEffect(() => {
    return () => {
      stopAllToggleShapeAreas();
    };
  }, []);

  useEffect(() => {
    if (!activeProfileId || isSwitchingProfileRef.current) {
      return;
    }

    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== activeProfileId) {
          return profile;
        }

        const nextName = activeProfileName.trim() || profile.name;
        const sameName = profile.name === nextName;
        const sameShapes =
          JSON.stringify(profile.shapes) === JSON.stringify(shapes);
        const sameSettings =
          JSON.stringify(profile.settings) === JSON.stringify(settings);

        if (sameName && sameShapes && sameSettings) {
          return profile;
        }

        return {
          ...profile,
          name: nextName,
          shapes,
          settings,
        };
      }),
    );
  }, [activeProfileId, activeProfileName, settings, shapes]);

  useEffect(() => {
    latestProfilesRef.current = profiles;
    storage.saveProfiles({
      activeProfileId,
      profiles,
    });
  }, [activeProfileId, profiles]);

  useEffect(() => {
    if (profiles.length === 0) {
      if (activeProfileId !== "") {
        setActiveProfileId("");
      }
      if (selectedProfileId !== "") {
        setSelectedProfileId("");
      }
      return;
    }

    if (!profiles.some((profile) => profile.id === activeProfileId)) {
      setActiveProfileId(profiles[0].id);
    }

    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [activeProfileId, profiles, selectedProfileId, settings]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (selectedId === null) {
        return prev.length === 0 ? prev : [];
      }

      if (prev.includes(selectedId)) {
        return prev;
      }

      return [selectedId];
    });
  }, [selectedId]);

  useEffect(() => {
    const shapeIdSet = new Set(shapes.map((shape) => shape.id));
    setSelectedIds((prev) => prev.filter((id) => shapeIdSet.has(id)));
  }, [shapes]);

  useEffect(() => {
    if (selectedId && !selectedIds.includes(selectedId)) {
      setSelectedId(
        selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null,
      );
    }
  }, [selectedId, selectedIds]);

  useEffect(() => {
    if (previousActiveProfileIdRef.current === activeProfileId) {
      return;
    }

    previousActiveProfileIdRef.current = activeProfileId;
    const nextActiveProfile =
      profiles.find((profile) => profile.id === activeProfileId) ?? null;
    if (!nextActiveProfile) {
      isSwitchingProfileRef.current = false;
      return;
    }

    setShapesWithoutHistory(nextActiveProfile.shapes);
    resetShapeHistory();
    setSettings(nextActiveProfile.settings);
    setActiveProfileName(nextActiveProfile.name);
    selectSingleShape(null);
    setCopiedShapes([]);
    setIsTransformingShape(false);
    setSelectedProfileId(activeProfileId);
    isSwitchingProfileRef.current = false;
  }, [
    activeProfileId,
    profiles,
    resetShapeHistory,
    selectSingleShape,
    setShapesWithoutHistory,
  ]);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    selectedPaletteShapeRef.current = selectedPaletteShape;
  }, [selectedPaletteShape]);

  useEffect(() => {
    storage.saveUiState({
      selectedPaletteShape,
      dialogRect,
      selectedUtilityTab: activeUtilityTab,
    });
  }, [activeUtilityTab, dialogRect, selectedPaletteShape]);

  useEffect(() => {
    try {
      localStorage.setItem(
        RUN_STATE_STORAGE_KEY,
        JSON.stringify({
          editMode: settings.editMode,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [settings.editMode]);

  useEffect(() => {
    storage.saveKeyTriggerState({
      profiles: keyTriggerProfiles,
    });
  }, [keyTriggerProfiles]);

  useEffect(() => {
    storage.saveKeyTriggerTargetTabIds(selectedKeyTriggerTabIds);
    const selectedNames = keyTriggerCharacters
      .filter((tab) => selectedKeyTriggerTabIds.includes(tab.id))
      .map((tab) => tab.name);
    storage.saveKeyTriggerTargetTabNames(selectedNames);
  }, [selectedKeyTriggerTabIds, keyTriggerCharacters]);

  useEffect(() => {
    storage.saveKeyTriggerCharacterProfileMapping(
      keyTriggerCharacterProfileMapping,
    );
  }, [keyTriggerCharacterProfileMapping]);

  useEffect(() => {
    // Validate that all stored profiles still exist
    const validatedMapping: Record<string, string> = {};
    for (const [charName, profileId] of Object.entries(
      keyTriggerCharacterProfileMapping,
    )) {
      if (keyTriggerProfiles.some((profile) => profile.id === profileId)) {
        validatedMapping[charName] = profileId;
      }
    }

    if (
      Object.keys(validatedMapping).length !==
      Object.keys(keyTriggerCharacterProfileMapping).length
    ) {
      setKeyTriggerCharacterProfileMapping(validatedMapping);
    }
  }, [keyTriggerProfiles, keyTriggerCharacterProfileMapping]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key) {
        return;
      }

      if (event.key === "flyff-mapper-profiles-v1") {
        // Keep mapper profiles and shapes tab-local at runtime.
        // Ignoring storage updates prevents live cross-tab shape sync.
        return;
      }

      if (event.key === "flyff-mapper-key-trigger-v1") {
        const nextKeyTriggerState = storage.loadKeyTriggerState();
        setKeyTriggerProfiles(nextKeyTriggerState.profiles);
        return;
      }

      if (event.key === "flyff-mapper-key-trigger-character-profiles-v1") {
        setKeyTriggerCharacterProfileMapping(
          storage.loadKeyTriggerCharacterProfileMapping(),
        );
        return;
      }

      if (event.key === RUN_STATE_STORAGE_KEY) {
        if (!event.newValue) {
          return;
        }

        try {
          const parsed = JSON.parse(event.newValue) as { editMode?: unknown };
          if (typeof parsed.editMode !== "boolean") {
            return;
          }

          const nextEditMode = parsed.editMode;

          setSettings((prev) =>
            prev.editMode === nextEditMode
              ? prev
              : {
                  ...prev,
                  editMode: nextEditMode,
                },
          );
        } catch {
          // Ignore malformed sync payload.
        }
        return;
      }

      if (event.key === "flyff-mapper-key-trigger-target-tabs-v1") {
        setSelectedKeyTriggerTabIds(storage.loadKeyTriggerTargetTabIds());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [resetShapeHistory, selectSingleShape, setShapesWithoutHistory]);

  const reloadKeyTriggerCharacters = useCallback(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      setKeyTriggerCharacters([]);
      setSelectedKeyTriggerTabIds([]);
      return;
    }

    safeSendRuntimeMessageWithCallback<{ tabs?: unknown[] }>(
      { type: "KEY_TRIGGER_GET_TABS" },
      (response) => {
        const tabList: unknown[] = Array.isArray(response?.tabs)
          ? response.tabs
          : [];

        const tabs = tabList
          .filter((tab: unknown): tab is CharacterTabInfo => {
            return (
              typeof tab === "object" &&
              tab !== null &&
              Number.isFinite((tab as CharacterTabInfo).id) &&
              typeof (tab as CharacterTabInfo).name === "string" &&
              typeof (tab as CharacterTabInfo).title === "string"
            );
          })
          .map((tab: CharacterTabInfo) => ({
            id: tab.id,
            name: tab.name,
            title: tab.title,
          }));

        setKeyTriggerCharacters(tabs);
        const tabIdSet = new Set(tabs.map((tab: CharacterTabInfo) => tab.id));
        setSelectedKeyTriggerTabIds((prev) => {
          const preselected = prev.filter((id) => tabIdSet.has(id));
          const loadedSelected = storage.loadKeyTriggerTargetTabIds();
          const toRestore = loadedSelected.filter((id) => tabIdSet.has(id));
          const savedNames = new Set(storage.loadKeyTriggerTargetTabNames());
          const nameMatched = tabs
            .filter((tab: CharacterTabInfo) => savedNames.has(tab.name))
            .map((tab: CharacterTabInfo) => tab.id);
          const merged = Array.from(
            new Set([...preselected, ...toRestore, ...nameMatched]),
          );
          return merged.length > 0 ? merged : preselected;
        });
      },
    );
  }, []);

  const syncReloadKeyTriggerCharacters = useCallback(() => {
    reloadKeyTriggerCharacters();

    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return;
    }

    void safeSendRuntimeMessage({ type: "KEY_TRIGGER_REQUEST_TABS_RELOAD" });
  }, [reloadKeyTriggerCharacters]);

  const clearAllKeyTriggerTimers = useCallback(() => {
    activeKeyTriggerTimersRef.current.forEach((timerIds) => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
    });
    activeKeyTriggerTimersRef.current.clear();
  }, []);

  useEffect(() => {
    reloadKeyTriggerCharacters();
  }, [reloadKeyTriggerCharacters]);

  useEffect(() => {
    if (activeUtilityTab === "key-trigger") {
      reloadKeyTriggerCharacters();
    }
  }, [activeUtilityTab, reloadKeyTriggerCharacters]);

  useEffect(() => {
    if (!dialogVisible || activeUtilityTab !== "key-trigger") {
      return;
    }

    // Refresh tab list on open so persisted ids/names can be re-applied immediately.
    reloadKeyTriggerCharacters();
  }, [activeUtilityTab, dialogVisible, reloadKeyTriggerCharacters]);

  useEffect(() => {
    if (activeUtilityTab !== "key-trigger") {
      return;
    }

    const KEY_TRIGGER_AUTO_FETCH_INTERVAL_MS = 3000;
    const intervalId = window.setInterval(() => {
      reloadKeyTriggerCharacters();
    }, KEY_TRIGGER_AUTO_FETCH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeUtilityTab, reloadKeyTriggerCharacters]);

  useEffect(() => {
    return () => {
      clearAllKeyTriggerTimers();
    };
  }, [clearAllKeyTriggerTimers]);

  useEffect(() => {
    return () => {
      if (remoteCursorHideTimerRef.current !== null) {
        window.clearTimeout(remoteCursorHideTimerRef.current);
      }

      if (
        remoteCursorRef.current &&
        document.body.contains(remoteCursorRef.current)
      ) {
        document.body.removeChild(remoteCursorRef.current);
      }

      remoteCursorRef.current = null;
      remoteCursorHideTimerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSettings((prev) => ({ ...prev }));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (settings.editMode) return;
    selectSingleShape(null);
  }, [settings.editMode, selectSingleShape]);

  useEffect(() => {
    const wasEditMode = previousEditModeRef.current;
    previousEditModeRef.current = settings.editMode;

    if (!settings.editMode) {
      return;
    }

    stopAllToggleShapeAreas();

    if (!wasEditMode) {
      clearAllKeyTriggerTimers();
      if (typeof chrome !== "undefined" && chrome.runtime) {
        void safeSendRuntimeMessage({ type: "KEY_TRIGGER_STOP_ALL" });
      }
    }
  }, [clearAllKeyTriggerTimers, settings.editMode]);

  // Auto-stop: use one shared inactivity timer across running Flyff tabs.
  useEffect(() => {
    const autoStopSec = settings.autoStopSeconds;

    setAutoStopCountdown(null);

    if (settings.editMode || !autoStopSec || autoStopSec < 30) {
      return;
    }

    const tabId = autoStopTabIdRef.current;

    const requestNotificationPermission = () => {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        void Notification.requestPermission();
      }
    };

    const stopScriptLocally = () => {
      setAutoStopCountdown(null);
      setSettings((prev) =>
        prev.editMode
          ? prev
          : {
              ...prev,
              editMode: true,
            },
      );
    };

    const notifyAutoStopOnce = (signalId: string) => {
      if (autoStopLastNotifiedSignalRef.current === signalId) {
        return;
      }

      const current = readSharedAutoStopState();
      if (current.notifiedSignalId === signalId) {
        return;
      }

      writeSharedAutoStopState({
        ...current,
        notifiedSignalId: signalId,
        notifiedAt: Date.now(),
        notifiedBy: tabId,
      });

      const confirmed = readSharedAutoStopState();
      if (
        confirmed.notifiedSignalId !== signalId ||
        confirmed.notifiedBy !== tabId
      ) {
        return;
      }

      autoStopLastNotifiedSignalRef.current = signalId;
      void showBrowserNotification(
        "Flyff Utility - Script stopped",
        "Script has been stopped due to inactivity.",
      );
    };

    const recordSharedActivity = (force = false) => {
      const now = Date.now();
      if (!force && now - lastActivityRef.current < 120) {
        return;
      }

      lastActivityRef.current = now;
      const current = readSharedAutoStopState();
      writeSharedAutoStopState({
        ...current,
        lastActivityAt: now,
        stopSignalId: "",
        stopSignalAt: 0,
        stopSignalBy: "",
      });
    };

    const checkSharedTimeout = () => {
      const current = readSharedAutoStopState();

      if (
        current.stopSignalId &&
        current.stopSignalId !== autoStopLastHandledSignalRef.current
      ) {
        autoStopLastHandledSignalRef.current = current.stopSignalId;
        notifyAutoStopOnce(current.stopSignalId); // Deduplicate notification here
        stopScriptLocally();
        return;
      }

      const lastActivityAt = current.lastActivityAt || Date.now();
      const elapsed = (Date.now() - lastActivityAt) / 1000;
      const remaining = autoStopSec - elapsed;

      if (remaining <= 0) {
        if (!current.stopSignalId) {
          const signalId = `${tabId}-${Date.now()}`;
          writeSharedAutoStopState({
            ...current,
            stopSignalId: signalId,
            stopSignalAt: Date.now(),
            stopSignalBy: tabId,
          });

          const confirmed = readSharedAutoStopState();
          if (confirmed.stopSignalId === signalId) {
            autoStopLastHandledSignalRef.current = signalId;
            notifyAutoStopOnce(signalId);
          }
        } else {
          // If already stopped, ensure notification is only shown once
          notifyAutoStopOnce(current.stopSignalId);
        }

        stopScriptLocally();
        return;
      }

      if (remaining <= 10) {
        setAutoStopCountdown(Math.ceil(remaining));
      } else {
        setAutoStopCountdown(null);
      }
    };

    const onSharedStateChanged = (event: StorageEvent) => {
      if (event.key !== AUTO_STOP_SHARED_STATE_KEY) {
        return;
      }

      checkSharedTimeout();
    };

    const onKeyActivity = () => recordSharedActivity();
    const onPointerActivity = () => recordSharedActivity();
    const onMouseActivity = () => recordSharedActivity();

    recordSharedActivity(true);
    requestNotificationPermission();

    window.addEventListener("keydown", onKeyActivity, { capture: true });
    window.addEventListener("pointerdown", onPointerActivity, {
      capture: true,
    });
    window.addEventListener("mousemove", onMouseActivity, {
      capture: true,
    });
    window.addEventListener("storage", onSharedStateChanged);

    const intervalId = window.setInterval(() => {
      checkSharedTimeout();
    }, 500);
    checkSharedTimeout();

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("keydown", onKeyActivity, { capture: true });
      window.removeEventListener("pointerdown", onPointerActivity, {
        capture: true,
      });
      window.removeEventListener("mousemove", onMouseActivity, {
        capture: true,
      });
      window.removeEventListener("storage", onSharedStateChanged);
    };
  }, [settings.editMode, settings.autoStopSeconds]);

  // Notify on reCAPTCHA detection
  useEffect(() => {
    if (!settings.notifyOnRecaptcha && !settings.stopOnRecaptcha) return;

    const isFlyffPlayPage =
      window.location.hostname === "universe.flyff.com" &&
      window.location.pathname.startsWith("/play");
    if (!isFlyffPlayPage) {
      return;
    }

    const RECAPTCHA_SELECTORS = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      ".g-recaptcha",
      ".h-captcha",
      "#recaptcha",
    ];

    const isRecaptchaPresent = () =>
      RECAPTCHA_SELECTORS.some((sel) => document.querySelector(sel) !== null);

    const tabId = autoStopTabIdRef.current;
    let signalRaised = false;

    const requestNotificationPermission = () => {
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "default"
      ) {
        void Notification.requestPermission();
      }
    };

    const applyRecaptchaSignal = (signal: SharedRecaptchaSignal) => {
      if (!signal.signalId) {
        return;
      }

      if (signal.signalId === recaptchaLastHandledSignalRef.current) {
        return;
      }

      recaptchaLastHandledSignalRef.current = signal.signalId;

      if (signal.stopRequested) {
        setSettings((prev) =>
          prev.editMode
            ? prev
            : {
                ...prev,
                editMode: true,
              },
        );
      }

      if (!settings.notifyOnRecaptcha) {
        return;
      }

      const current = readSharedRecaptchaSignal();
      if (current.notifiedSignalId === signal.signalId) {
        return;
      }

      writeSharedRecaptchaSignal({
        ...current,
        notifiedSignalId: signal.signalId,
        notifiedAt: Date.now(),
        notifiedBy: tabId,
      });

      const confirmed = readSharedRecaptchaSignal();
      if (confirmed.notifiedSignalId !== signal.signalId) {
        return;
      }

      if (RECAPTCHA_DEBUG_LOG) {
        console.debug("[reCAPTCHA][shared] notification claimed", {
          signalId: signal.signalId,
          claimedBy: tabId,
          detectedBy: signal.detectedBy,
          stopRequested: signal.stopRequested,
        });
      }

      if (signal.stopRequested) {
        void showBrowserNotification(
          "Flyff Utility - Script stopped",
          "Script was stopped because a CAPTCHA was detected.",
        );
        return;
      }

      void showBrowserNotification(
        "Flyff Utility - CAPTCHA detected",
        "A reCAPTCHA or hCaptcha element was found on the page.",
      );
    };

    const raiseRecaptchaSignal = () => {
      if (signalRaised) {
        return;
      }

      signalRaised = true;
      const signalId = `${tabId}-${Date.now()}`;
      const signal: SharedRecaptchaSignal = {
        signalId,
        detectedAt: Date.now(),
        detectedBy: tabId,
        stopRequested: settings.stopOnRecaptcha && !settings.editMode,
        notifiedSignalId: "",
        notifiedAt: 0,
        notifiedBy: "",
      };

      if (RECAPTCHA_DEBUG_LOG) {
        console.debug("[reCAPTCHA][shared] signal raised", {
          signalId,
          raisedBy: tabId,
          stopRequested: signal.stopRequested,
        });
      }

      writeSharedRecaptchaSignal(signal);
      applyRecaptchaSignal(signal);
    };

    const onSharedRecaptchaSignal = (event: StorageEvent) => {
      if (event.key !== RECAPTCHA_SHARED_SIGNAL_KEY) {
        return;
      }

      applyRecaptchaSignal(readSharedRecaptchaSignal());
    };

    if (isRecaptchaPresent()) {
      raiseRecaptchaSignal();
    }

    const observer = new MutationObserver(() => {
      if (isRecaptchaPresent()) {
        raiseRecaptchaSignal();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    requestNotificationPermission();
    window.addEventListener("storage", onSharedRecaptchaSignal);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onSharedRecaptchaSignal);
    };
  }, [settings.notifyOnRecaptcha, settings.stopOnRecaptcha, settings.editMode]);

  useEffect(() => {
    const blockMetaKey = (event: KeyboardEvent) => {
      if (
        event.key === "Meta" ||
        event.code === "MetaLeft" ||
        event.code === "MetaRight"
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", blockMetaKey, { capture: true });
    window.addEventListener("keyup", blockMetaKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", blockMetaKey, { capture: true });
      window.removeEventListener("keyup", blockMetaKey, { capture: true });
    };
  }, []);

  const focusGameCanvas = useCallback(() => {
    const canvas = document.querySelector("canvas") as HTMLElement | null;
    if (!canvas) return;

    const active = document.activeElement as HTMLElement | null;
    if (active === canvas) {
      return;
    }

    active?.blur();

    if (canvas.tabIndex < 0) {
      canvas.tabIndex = -1;
    }

    canvas.focus({ preventScroll: true });
  }, []);

  const getKeyTriggerTargetTabIds = useCallback((): number[] => {
    return Array.from(new Set(selectedKeyTriggerTabIds));
  }, [selectedKeyTriggerTabIds]);

  const getTabIdsForAction = useCallback(
    (
      action: KeyTriggerAction,
      profileCurrentTabOnly?: boolean,
      profileOtherTabsOnly?: boolean,
    ): number[] => {
      const allTargetTabIds = getKeyTriggerTargetTabIds();

      if (action.otherTabsOnly === true) {
        // Return all selected tabs except the current one
        if (currentTabId === null) {
          return allTargetTabIds;
        }
        return allTargetTabIds.filter((tabId) => tabId !== currentTabId);
      }

      if (action.currentTabOnly === true) {
        // Return only the current tab if it's in the selected tabs
        if (currentTabId === null) {
          return [];
        }
        return allTargetTabIds.includes(currentTabId) ? [currentTabId] : [];
      }

      // If action doesn't specify scope, fall back to profile scope
      if (profileOtherTabsOnly === true) {
        if (currentTabId === null) {
          return allTargetTabIds;
        }
        return allTargetTabIds.filter((tabId) => tabId !== currentTabId);
      }

      // If action doesn't specify scope, fall back to profile scope
      if (profileCurrentTabOnly === true) {
        if (currentTabId === null) {
          return [];
        }
        return allTargetTabIds.includes(currentTabId) ? [currentTabId] : [];
      }

      // Default: return all selected tabs
      return allTargetTabIds;
    },
    [currentTabId, getKeyTriggerTargetTabIds],
  );

  const getKeyTriggerTabIdsForProfile = useCallback(
    (profile: KeyTriggerProfile): number[] => {
      const targetTabIds = getKeyTriggerTargetTabIds();
      // Keep backward compatibility: if profile has currentTabOnly, use it
      if (profile.currentTabOnly) {
        if (currentTabId === null) {
          return [];
        }

        return targetTabIds.includes(currentTabId) ? [currentTabId] : [];
      }
      return targetTabIds;
    },
    [currentTabId, getKeyTriggerTargetTabIds],
  );

  const handleKeyTriggerSelectedProfileIdChange = useCallback(
    (profileId: string | null) => {
      const currentCharacterNameFromTitle = getCharacterNameFromTitle(
        document.title,
      );
      const currentCharacterName =
        currentCharacterNameFromTitle ??
        keyTriggerCharacters.find((tab) => tab.id === currentTabId)?.name;

      if (!currentCharacterName) {
        return;
      }

      setKeyTriggerCharacterProfileMapping((prev) => {
        if (profileId === null) {
          const next = { ...prev };
          delete next[currentCharacterName];
          return next;
        }
        return { ...prev, [currentCharacterName]: profileId };
      });
    },
    [currentTabId, keyTriggerCharacters],
  );

  const applyRemoteCursorBodyStyle = useCallback((cursor: HTMLDivElement) => {
    const bodyCursor = window.getComputedStyle(document.body).cursor;
    const cursorUrlMatch = /url\((['"]?)(.*?)\1\)/i.exec(bodyCursor);
    const cursorUrl = cursorUrlMatch?.[2]?.trim();

    if (!cursorUrl) {
      cursor.classList.remove("fm-remote-sync-cursor-body");
      cursor.style.backgroundImage = "";
      return;
    }

    cursor.classList.add("fm-remote-sync-cursor-body");
    cursor.style.backgroundImage = `url(${JSON.stringify(cursorUrl)})`;
  }, []);

  const ensureRemoteCursor = useCallback((): HTMLDivElement => {
    if (
      remoteCursorRef.current &&
      document.body.contains(remoteCursorRef.current)
    ) {
      return remoteCursorRef.current;
    }

    const cursor = document.createElement("div");
    cursor.className = "fm-remote-sync-cursor";
    cursor.setAttribute("aria-hidden", "true");
    document.body.appendChild(cursor);
    remoteCursorRef.current = cursor;
    return cursor;
  }, []);

  const showRemoteCursor = useCallback(
    (
      clientX: number,
      clientY: number,
      isPressed: boolean,
      isUnavailable = false,
    ) => {
      const cursor = ensureRemoteCursor();
      applyRemoteCursorBodyStyle(cursor);
      cursor.style.left = `${clientX}px`;
      cursor.style.top = `${clientY}px`;
      cursor.classList.toggle("fm-remote-sync-cursor-pressed", isPressed);
      cursor.classList.toggle(
        "fm-remote-sync-cursor-unavailable",
        isUnavailable,
      );
      cursor.classList.add("fm-remote-sync-cursor-visible");

      if (remoteCursorHideTimerRef.current !== null) {
        window.clearTimeout(remoteCursorHideTimerRef.current);
      }

      remoteCursorHideTimerRef.current = window.setTimeout(() => {
        if (!remoteCursorRef.current) {
          return;
        }

        remoteCursorRef.current.classList.remove(
          "fm-remote-sync-cursor-visible",
        );
      }, REMOTE_CURSOR_HIDE_DELAY_MS);
    },
    [applyRemoteCursorBodyStyle, ensureRemoteCursor],
  );

  const dispatchRemoteMouseSyncEvent = useCallback(
    (payload: MouseSyncEventPayload) => {
      const sourceClientX = Number(payload.clientX);
      const sourceClientY = Number(payload.clientY);
      const ratioX = Number(payload.ratioX);
      const ratioY = Number(payload.ratioY);

      const hasRatio = Number.isFinite(ratioX) && Number.isFinite(ratioY);
      const mode = settings.mouseSyncPositionMode;

      const mappedX =
        mode === "ratio" && hasRatio
          ? ratioX * Math.max(1, window.innerWidth - 1)
          : sourceClientX;
      const mappedY =
        mode === "ratio" && hasRatio
          ? ratioY * Math.max(1, window.innerHeight - 1)
          : sourceClientY;

      const clientX = Math.max(
        0,
        Math.min(Math.round(mappedX), Math.max(0, window.innerWidth - 1)),
      );
      const clientY = Math.max(
        0,
        Math.min(Math.round(mappedY), Math.max(0, window.innerHeight - 1)),
      );

      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
      }

      const isCanvasInteraction = payload.isCanvasInteraction !== false;
      if (!isCanvasInteraction) {
        showRemoteCursor(clientX, clientY, false, true);
        return;
      }

      const overlayRoot = document.getElementById(ROOT_ID);
      const previousOverlayPointerEvents = overlayRoot?.style.pointerEvents;
      if (overlayRoot) {
        overlayRoot.style.pointerEvents = "none";
      }

      const hit = document.elementFromPoint(
        clientX,
        clientY,
      ) as HTMLElement | null;

      if (overlayRoot) {
        overlayRoot.style.pointerEvents = previousOverlayPointerEvents ?? "";
      }

      const target =
        (hit && !hit.closest(`#${ROOT_ID}`) ? hit : null) ??
        (document.querySelector("canvas") as HTMLElement | null) ??
        document.body;

      const commonInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        button: Number.isFinite(payload.button) ? payload.button : 0,
        buttons: Number.isFinite(payload.buttons) ? payload.buttons : 0,
        ctrlKey: Boolean(payload.ctrlKey),
        altKey: Boolean(payload.altKey),
        shiftKey: Boolean(payload.shiftKey),
        metaKey: Boolean(payload.metaKey),
      };

      if (payload.eventType === "wheel") {
        target.dispatchEvent(
          new WheelEvent("wheel", {
            ...commonInit,
            deltaX: Number(payload.deltaX) || 0,
            deltaY: Number(payload.deltaY) || 0,
          }),
        );
      } else if (
        payload.eventType.startsWith("pointer") &&
        typeof PointerEvent !== "undefined"
      ) {
        target.dispatchEvent(
          new PointerEvent(payload.eventType, {
            ...commonInit,
            pointerType:
              typeof payload.pointerType === "string" &&
              payload.pointerType.length > 0
                ? payload.pointerType
                : "mouse",
          }),
        );
      } else {
        target.dispatchEvent(new MouseEvent(payload.eventType, commonInit));
      }

      showRemoteCursor(clientX, clientY, (Number(payload.buttons) || 0) > 0);
    },
    [settings.mouseSyncPositionMode, showRemoteCursor],
  );

  const dispatchRemoteKeyboardSyncEvent = useCallback(
    (payload: KeyboardSyncEventPayload) => {
      const eventType = payload.eventType;
      if (eventType !== "keydown" && eventType !== "keyup") {
        return;
      }

      const key = typeof payload.key === "string" ? payload.key : "";
      const code = typeof payload.code === "string" ? payload.code : "";
      if (!key || !code) {
        return;
      }

      const target =
        (document.querySelector("canvas") as HTMLElement | null) ??
        (document.activeElement as HTMLElement | null) ??
        window;

      const eventInit: KeyboardEventInit = {
        key,
        code,
        bubbles: true,
        cancelable: true,
        repeat: Boolean(payload.repeat),
        ctrlKey: Boolean(payload.ctrlKey),
        altKey: Boolean(payload.altKey),
        shiftKey: Boolean(payload.shiftKey),
        metaKey: Boolean(payload.metaKey),
      };

      isApplyingRemoteKeyboardSyncRef.current = true;
      try {
        target.dispatchEvent(new KeyboardEvent(eventType, eventInit));
      } finally {
        isApplyingRemoteKeyboardSyncRef.current = false;
      }
    },
    [],
  );

  const resolveDispatchKey = useCallback(
    (
      rawToken: string,
      shiftPressed: boolean,
    ): { key: string; code: string } | null => {
      const token = rawToken.trim();
      if (!token) {
        return null;
      }

      const lowerToken = token.toLowerCase();

      const namedKeyMap: Record<string, { key: string; code: string }> = {
        esc: { key: "Escape", code: "Escape" },
        escape: { key: "Escape", code: "Escape" },
        enter: { key: "Enter", code: "Enter" },
        tab: { key: "Tab", code: "Tab" },
        space: { key: " ", code: "Space" },
        arrowup: { key: "ArrowUp", code: "ArrowUp" },
        arrowdown: { key: "ArrowDown", code: "ArrowDown" },
        arrowleft: { key: "ArrowLeft", code: "ArrowLeft" },
        arrowright: { key: "ArrowRight", code: "ArrowRight" },
      };

      const symbolCodeMap: Record<string, string> = {
        "-": "Minus",
        "=": "Equal",
        "[": "BracketLeft",
        "]": "BracketRight",
        "\\": "Backslash",
        ";": "Semicolon",
        "'": "Quote",
        ",": "Comma",
        ".": "Period",
        "/": "Slash",
        "`": "Backquote",
      };

      if (namedKeyMap[lowerToken]) {
        return namedKeyMap[lowerToken];
      }

      const numpadMatch = /^numpad\s*([0-9])$/i.exec(token);
      if (numpadMatch) {
        return {
          key: numpadMatch[1],
          code: `Numpad${numpadMatch[1]}`,
        };
      }

      const functionMatch = /^f([1-9]|1[0-2])$/i.exec(token);
      if (functionMatch) {
        const fn = `F${functionMatch[1]}`;
        return { key: fn, code: fn };
      }

      if (/^[0-9]$/.test(token)) {
        return {
          key: token,
          code: `Digit${token}`,
        };
      }

      if (/^[a-z]$/i.test(token)) {
        const upper = token.toUpperCase();
        return {
          key: shiftPressed ? upper : upper.toLowerCase(),
          code: `Key${upper}`,
        };
      }

      if (symbolCodeMap[token]) {
        return {
          key: token,
          code: symbolCodeMap[token],
        };
      }

      return {
        key: token,
        code: token,
      };
    },
    [],
  );

  const dispatchKeyboardEventToCanvas = useCallback(
    (
      eventInit: KeyboardEventInit,
      options?: { emitModifierKeyEvents?: boolean },
    ) => {
      const canvas = document.querySelector("canvas") as HTMLElement | null;
      const target =
        canvas ?? (document.activeElement as HTMLElement | null) ?? window;

      if (canvas && document.activeElement !== canvas) {
        if (canvas.tabIndex < 0) {
          canvas.tabIndex = -1;
        }
        canvas.focus({ preventScroll: true });
      }

      const shouldEmitModifierKeyEvents = Boolean(
        options?.emitModifierKeyEvents,
      );

      if (!shouldEmitModifierKeyEvents) {
        target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
        target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
        return;
      }

      type ModifierKey = "ctrlKey" | "altKey" | "shiftKey" | "metaKey";

      const modifierOrder: Array<{
        keyFlag: ModifierKey;
        key: string;
        code: string;
        location: number;
      }> = [
        {
          keyFlag: "ctrlKey",
          key: "Control",
          code: "ControlLeft",
          location: 1,
        },
        { keyFlag: "altKey", key: "Alt", code: "AltLeft", location: 1 },
        {
          keyFlag: "shiftKey",
          key: "Shift",
          code: "ShiftLeft",
          location: 1,
        },
        {
          keyFlag: "metaKey",
          key: "Meta",
          code: "MetaLeft",
          location: 1,
        },
      ];

      const required = {
        ctrlKey: Boolean(eventInit.ctrlKey),
        altKey: Boolean(eventInit.altKey),
        shiftKey: Boolean(eventInit.shiftKey),
        metaKey: Boolean(eventInit.metaKey),
      };
      const active = {
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
      };

      const buildModifierState = () => ({
        ctrlKey: active.ctrlKey,
        altKey: active.altKey,
        shiftKey: active.shiftKey,
        metaKey: active.metaKey,
      });

      modifierOrder.forEach((modifier) => {
        if (!required[modifier.keyFlag]) {
          return;
        }

        active[modifier.keyFlag] = true;
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: modifier.key,
            code: modifier.code,
            location: modifier.location,
            bubbles: true,
            cancelable: true,
            repeat: false,
            ...buildModifierState(),
          }),
        );
      });

      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          ...eventInit,
          bubbles: true,
          cancelable: true,
          repeat: false,
          ...required,
        }),
      );
      target.dispatchEvent(
        new KeyboardEvent("keyup", {
          ...eventInit,
          bubbles: true,
          cancelable: true,
          repeat: false,
          ...required,
        }),
      );

      [...modifierOrder].reverse().forEach((modifier) => {
        if (!required[modifier.keyFlag]) {
          return;
        }

        target.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: modifier.key,
            code: modifier.code,
            location: modifier.location,
            bubbles: true,
            cancelable: true,
            repeat: false,
            ...buildModifierState(),
          }),
        );
        active[modifier.keyFlag] = false;
      });
    },
    [],
  );

  const dispatchBindingToCanvas = useCallback(
    (binding: string): boolean => {
      const parts = binding
        .split("+")
        .map((part) => part.trim())
        .filter(Boolean);

      if (parts.length === 0) {
        return false;
      }

      const modifiers = {
        ctrlKey: parts.some((part) => /^(ctrl|control)$/i.test(part)),
        altKey: parts.some((part) => /^alt$/i.test(part)),
        shiftKey: parts.some((part) => /^shift$/i.test(part)),
        metaKey: parts.some((part) => /^(meta|cmd|command)$/i.test(part)),
      };

      const key =
        parts.find(
          (part) => !/^(ctrl|control|alt|shift|meta|cmd|command)$/i.test(part),
        ) ?? "";

      if (!key || isMouseWheelShortcutToken(key)) {
        return false;
      }

      const resolved = resolveDispatchKey(key, modifiers.shiftKey);
      if (!resolved) {
        return false;
      }

      dispatchKeyboardEventToCanvas(
        {
          key: resolved.key,
          code: resolved.code,
          bubbles: true,
          cancelable: true,
          ...modifiers,
        },
        { emitModifierKeyEvents: true },
      );
      return true;
    },
    [dispatchKeyboardEventToCanvas, resolveDispatchKey],
  );

  const dispatchKeyTriggerKey = useCallback(
    (binding: string) => {
      const normalizeShortcutBinding = (rawBinding: string): string => {
        const modifierRank: Record<string, number> = {
          ctrl: 0,
          alt: 1,
          shift: 2,
          meta: 3,
        };

        const modifiers = new Set<string>();
        const keys: string[] = [];

        rawBinding
          .split("+")
          .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
          .filter(Boolean)
          .forEach((token) => {
            if (token === "control" || token === "ctrl") {
              modifiers.add("ctrl");
              return;
            }

            if (token === "alt") {
              modifiers.add("alt");
              return;
            }

            if (token === "shift") {
              modifiers.add("shift");
              return;
            }

            if (token === "meta" || token === "cmd" || token === "command") {
              modifiers.add("meta");
              return;
            }

            keys.push(token);
          });

        const orderedModifiers = Array.from(modifiers).sort(
          (left, right) => modifierRank[left] - modifierRank[right],
        );

        return [...orderedModifiers, ...keys].join("+");
      };

      const normalizedBinding = normalizeShortcutBinding(binding);

      if (normalizedBinding.length > 0) {
        const matchedShapes = shapes.filter((shape) => {
          if (!shape.keyBinding) {
            return false;
          }

          if (getReservedShapeShortcutUsage(shape.keyBinding, settings)) {
            return false;
          }

          const normalizedShapeBinding = normalizeShortcutBinding(
            shape.keyBinding,
          );

          return normalizedShapeBinding === normalizedBinding;
        });

        if (matchedShapes.length > 0) {
          matchedShapes.forEach((shape) => {
            triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
          });
          return;
        }
      }

      isDispatchingKeyTriggerRef.current = true;
      try {
        dispatchBindingToCanvas(binding);
      } finally {
        isDispatchingKeyTriggerRef.current = false;
      }
    },
    [dispatchBindingToCanvas, settings, shapes],
  );

  const captureGameplayScreenshot = useCallback(async (): Promise<
    string | null
  > => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return null;
    }

    try {
      const response = await safeSendRuntimeMessage<{
        ok?: boolean;
        dataUrl?: string;
      }>({
        type: "CAPTURE_SCREENSHOT",
      });
      if (!response?.ok || typeof response.dataUrl !== "string") {
        return null;
      }
      return response.dataUrl;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      setCurrentTabId(null);
      return;
    }

    let cancelled = false;

    try {
      safeSendRuntimeMessageWithCallback<{ tabId?: number }>(
        { type: "GET_CURRENT_TAB_ID" },
        (response) => {
          if (cancelled) {
            return;
          }

          const tabId = Number(response?.tabId);
          setCurrentTabId(Number.isFinite(tabId) ? tabId : null);
        },
      );
    } catch {
      if (!cancelled) {
        setCurrentTabId(null);
      }
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const isAutomationExecutionAllowed = useCallback((): boolean => {
    if (document.visibilityState !== "visible") {
      return false;
    }

    if (!document.hasFocus()) {
      return false;
    }

    return true;
  }, []);

  const startAutomationRegionCapture = useCallback(
    (target: AutomationRegionCaptureTarget) => {
      setAutomationRegionCaptureTarget(target);
      setAutomationRegionCaptureRect(null);
      automationRegionCaptureStartRef.current = null;
    },
    [],
  );

  const cancelAutomationRegionCapture = useCallback(() => {
    automationRegionCaptureStartRef.current = null;
    setAutomationRegionCaptureRect(null);
    setAutomationRegionCaptureTarget(null);
  }, []);

  const clearAutomationRegionCapture = useCallback(
    (target: AutomationRegionCaptureTarget) => {
      setSettings((prev) =>
        target === "autoHoly"
          ? {
              ...prev,
              autoHoly: {
                ...prev.autoHoly,
                scanRegion: null,
              },
            }
          : target === "autoPills"
            ? {
                ...prev,
                autoPills: {
                  ...prev.autoPills,
                  scanRegion: null,
                },
              }
            : {
                ...prev,
                autoAwaken: {
                  ...prev.autoAwaken,
                  scanRegion: null,
                },
              },
      );
    },
    [],
  );

  useEffect(() => {
    if (!automationRegionCaptureTarget) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      cancelAutomationRegionCapture();
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [automationRegionCaptureTarget, cancelAutomationRegionCapture]);

  const autoHolyTemplateRef = useRef<{
    root: RgbImageData[];
    stun: RgbImageData[];
    loaded: boolean;
  }>({ root: [], stun: [], loaded: false });

  const hpTemplateRef = useRef<{
    variants: HpTemplateVariant[];
    loaded: boolean;
  }>({ variants: [], loaded: false });

  useEffect(() => {
    const shouldLoadHolyTemplates = settings.autoHoly.enabled;
    const shouldLoadHpTemplates = settings.autoPills.enabled;
    if (!shouldLoadHolyTemplates && !shouldLoadHpTemplates) {
      return;
    }

    if (
      (!shouldLoadHolyTemplates || autoHolyTemplateRef.current.loaded) &&
      (!shouldLoadHpTemplates || hpTemplateRef.current.loaded)
    ) {
      return;
    }

    let cancelled = false;

    const loadAutoTemplates = async () => {
      try {
        const holyPromise = shouldLoadHolyTemplates
          ? Promise.all([
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL("root.png"),
                AUTO_IMAGE_SCALE_WIDTH,
              ),
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL("stun.png"),
                AUTO_IMAGE_SCALE_WIDTH,
              ),
            ])
          : Promise.resolve(null);
        const hpPromise = shouldLoadHpTemplates
          ? Promise.all([
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL(
                  "full-hp-character-window-no-text-hp-bar.png",
                ),
              ),
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL(
                  "full-hp-character-window-percentage-hp-bar.png",
                ),
              ),
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL(
                  "full-hp-character-window-raw-hp-values-in-hp-bar.png",
                ),
              ),
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL(
                  "not-full-hp-character-window-no-text-hp-bar.png",
                ),
              ),
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL(
                  "not-full-hp-character-window-percentage-hp-bar.png",
                ),
              ),
              loadRgbImageDataFromSrc(
                chrome.runtime.getURL(
                  "not-full-hp-character-window-raw-hp-values-in-hp-bar.png",
                ),
              ),
            ])
          : Promise.resolve(null);

        const [holyImages, hpImages] = await Promise.all([
          holyPromise,
          hpPromise,
        ]);
        if (cancelled) {
          return;
        }

        if (holyImages) {
          const [rootImage, stunImage] = holyImages;
          autoHolyTemplateRef.current = {
            root: [rootImage],
            stun: [stunImage],
            loaded: true,
          };
        }

        if (hpImages) {
          const [
            fullNoText,
            fullPercent,
            fullRaw,
            notFullNoText,
            notFullPercent,
            notFullRaw,
          ] = hpImages;
          hpTemplateRef.current = {
            variants: [
              {
                image: fullNoText,
                state: "full",
                displayMode: "bar-geometry",
                label: "full/no-text",
              },
              {
                image: fullPercent,
                state: "full",
                displayMode: "text-percent",
                label: "full/percent",
              },
              {
                image: fullRaw,
                state: "full",
                displayMode: "text-current-max",
                label: "full/raw",
              },
              {
                image: notFullNoText,
                state: "not-full",
                displayMode: "bar-geometry",
                label: "not-full/no-text",
              },
              {
                image: notFullPercent,
                state: "not-full",
                displayMode: "text-percent",
                label: "not-full/percent",
              },
              {
                image: notFullRaw,
                state: "not-full",
                displayMode: "text-current-max",
                label: "not-full/raw",
              },
            ],
            loaded: true,
          };
        }
      } catch {
        if (!cancelled) {
          if (shouldLoadHolyTemplates) {
            autoHolyTemplateRef.current = {
              root: [],
              stun: [],
              loaded: false,
            };
          }
          if (shouldLoadHpTemplates) {
            hpTemplateRef.current = {
              variants: [],
              loaded: false,
            };
          }
        }
      }
    };

    void loadAutoTemplates();

    return () => {
      cancelled = true;
    };
  }, [settings.autoHoly.enabled, settings.autoPills.enabled]);

  useEffect(() => {
    if (settings.autoHoly.enabled) {
      return;
    }

    autoHolyTemplateRef.current = {
      root: [],
      stun: [],
      loaded: false,
    };
  }, [settings.autoHoly.enabled]);

  useEffect(() => {
    if (settings.autoPills.enabled) {
      return;
    }

    hpTemplateRef.current = {
      variants: [],
      loaded: false,
    };
  }, [settings.autoPills.enabled]);

  const ensureHpOcrWorker = useCallback(async (): Promise<any | null> => {
    if (hpOcrWorkerRef.current) {
      return hpOcrWorkerRef.current;
    }
    if (hpOcrWorkerInitRef.current) {
      return hpOcrWorkerInitRef.current;
    }

    hpOcrWorkerInitRef.current = (async () => {
      try {
        const module = await import("tesseract.js");
        const worker = await module.createWorker("eng", undefined, {
          workerPath: chrome.runtime.getURL("tesseract-worker.min.js"),
          workerBlobURL: false,
        });
        if (typeof worker.setParameters === "function") {
          await worker.setParameters({
            tessedit_char_whitelist: "0123456789/%.",
            preserve_interword_spaces: "1",
          });
        }
        hpOcrWorkerRef.current = worker;
        return worker;
      } catch {
        return null;
      } finally {
        hpOcrWorkerInitRef.current = null;
      }
    })();

    return hpOcrWorkerInitRef.current;
  }, []);

  const recognizeHpText = useCallback(
    async (image: RgbImageData) => {
      const now = Date.now();
      const cached = hpOcrLastResultRef.current;
      if (cached && now - cached.updatedAt < AUTO_PILLS_OCR_INTERVAL_MS) {
        return cached;
      }
      if (hpOcrBusyRef.current) {
        return cached;
      }

      hpOcrBusyRef.current = true;
      try {
        const worker = await ensureHpOcrWorker();
        if (!worker) {
          return cached;
        }

        const ocrCanvas = buildHpOcrCanvas(image);
        if (!ocrCanvas) {
          return cached;
        }

        const result = await worker.recognize(ocrCanvas);
        const rawText =
          typeof result?.data?.text === "string"
            ? result.data.text.replace(/\s+/g, " ").trim()
            : "";
        const confidence =
          typeof result?.data?.confidence === "number" &&
          Number.isFinite(result.data.confidence)
            ? result.data.confidence
            : null;

        const parsed = parseHpPercentFromOcrText(rawText);
        const next = {
          hpPercent: parsed.hpPercent,
          mode: parsed.mode,
          confidence,
          rawText: rawText || null,
          updatedAt: Date.now(),
        };
        hpOcrLastResultRef.current = next;
        return next;
      } catch {
        return cached;
      } finally {
        hpOcrBusyRef.current = false;
      }
    },
    [ensureHpOcrWorker],
  );

  useEffect(() => {
    if (settings.autoPills.enabled) {
      return;
    }

    hpOcrLastResultRef.current = null;
    hpOcrBusyRef.current = false;

    const worker = hpOcrWorkerRef.current;
    hpOcrWorkerRef.current = null;
    hpOcrWorkerInitRef.current = null;

    if (worker && typeof worker.terminate === "function") {
      void worker.terminate();
    }
  }, [settings.autoPills.enabled]);

  useEffect(() => {
    return () => {
      const worker = hpOcrWorkerRef.current;
      hpOcrWorkerRef.current = null;
      hpOcrWorkerInitRef.current = null;
      hpOcrBusyRef.current = false;
      hpOcrLastResultRef.current = null;

      if (worker && typeof worker.terminate === "function") {
        void worker.terminate();
      }
    };
  }, []);

  // ── Auto-Awaken OCR worker ──────────────────────────────────────────────────

  const ensureAwakenOcrWorker = useCallback(async (): Promise<any | null> => {
    if (awakenOcrWorkerRef.current) {
      return awakenOcrWorkerRef.current;
    }
    if (awakenOcrWorkerInitRef.current) {
      return awakenOcrWorkerInitRef.current;
    }

    awakenOcrWorkerInitRef.current = (async () => {
      try {
        const module = await import("tesseract.js");
        const worker = await module.createWorker("eng", undefined, {
          workerPath: chrome.runtime.getURL("tesseract-worker.min.js"),
          workerBlobURL: false,
        });
        if (typeof worker.setParameters === "function") {
          await worker.setParameters({
            tessedit_pageseg_mode: module.PSM.SINGLE_BLOCK,
            tessedit_char_whitelist:
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+.% ",
          });
        }
        awakenOcrWorkerRef.current = worker;
        return worker;
      } catch {
        return null;
      } finally {
        awakenOcrWorkerInitRef.current = null;
      }
    })();

    return awakenOcrWorkerInitRef.current;
  }, []);

  const stopAutoAwakenLoop = useCallback(() => {
    autoAwakenRunningRef.current = false;
    setAutoAwakenRunning(false);
    setAutoAwakenStatus("⏸️ Ready to start");
  }, []);

  useEffect(() => {
    if (!settings.experimentalFeaturesEnabled && autoAwakenRunningRef.current) {
      stopAutoAwakenLoop();
    }
  }, [settings.experimentalFeaturesEnabled, stopAutoAwakenLoop]);

  const startAutoAwakenLoop = useCallback(
    async (mode?: "reawaken") => {
      if (autoAwakenRunningRef.current) return;

      autoAwakenRunningRef.current = true;
      setAutoAwakenRunning(true);
      setAutoAwakenStatus(
        mode === "reawaken"
          ? "🔄 Re-awakening..."
          : "🔍 Searching for button...",
      );
      setAutoAwakenLogs([]);

      const MAX_LOG = 200;
      const addLog = (line: string) => {
        const ts = new Date().toLocaleTimeString();
        setAutoAwakenLogs((prev) => [
          ...prev.slice(-(MAX_LOG - 1)),
          `[${ts}] ${line}`,
        ]);
      };

      const worker = await ensureAwakenOcrWorker();
      if (!worker) {
        setAutoAwakenStatus("OCR worker failed to init.");
        autoAwakenRunningRef.current = false;
        setAutoAwakenRunning(false);
        return;
      }

      setAutoAwakenStatus("🔍 Searching for button...");

      // Load only the initial button template at startup.
      const buttonTemplates: Array<{
        label: "button_image.png" | "button_image2.png";
        image: RgbImageData;
      }> = [];
      try {
        const buttonSrc = chrome.runtime.getURL("button_image.png");
        const template = await loadRgbImageDataFromSrc(buttonSrc);
        buttonTemplates.push({ label: "button_image.png", image: template });
      } catch {
        addLog(
          "Warning: could not load button_image.png \u2013 button click disabled.",
        );
      }

      if (buttonTemplates.length === 0) {
        addLog(
          "Warning: no button templates loaded \u2013 button click disabled.",
        );
      }

      addLog("Automation started.");
      let waitingForButtonReappear = false;
      let expectedReappearTemplate:
        | "button_image.png"
        | "button_image2.png"
        | null = null;
      let buttonTemplate2: RgbImageData | null = null;
      let attemptedButtonTemplate2Load = false;

      const ensureButtonTemplate2 = async (): Promise<boolean> => {
        if (buttonTemplate2) {
          return true;
        }
        if (attemptedButtonTemplate2Load) {
          return false;
        }
        attemptedButtonTemplate2Load = true;
        try {
          const buttonSrc2 = chrome.runtime.getURL("button_image2.png");
          buttonTemplate2 = await loadRgbImageDataFromSrc(buttonSrc2);
          addLog("Loaded button_image2.png for post-reroll detection.");
          return true;
        } catch {
          addLog("Warning: could not load button_image2.png for reroll cycle.");
          return false;
        }
      };

      /**
       * Dispatch a left-click at viewport coordinates onto the game canvas,
       * bypassing the extension overlay.
       */
      const clickViewport = (vx: number, vy: number) => {
        const overlayRoot = document.getElementById(ROOT_ID);
        const prev = overlayRoot?.style.pointerEvents;
        if (overlayRoot) overlayRoot.style.pointerEvents = "none";

        const target =
          (document.elementFromPoint(vx, vy) as HTMLElement | null) ??
          (document.querySelector("canvas") as HTMLElement | null) ??
          document.body;

        if (overlayRoot) overlayRoot.style.pointerEvents = prev ?? "";

        const commonInit = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: vx,
          clientY: vy,
          button: 0,
          buttons: 1,
        };
        target.dispatchEvent(new MouseEvent("mousedown", commonInit));
        target.dispatchEvent(
          new MouseEvent("mouseup", { ...commonInit, buttons: 0 }),
        );
        target.dispatchEvent(
          new MouseEvent("click", { ...commonInit, buttons: 0 }),
        );
      };

      const normalizeStatName = (name: string): string =>
        name.replace(/[^A-Za-z]/g, "").toLowerCase();

      type DetectedTextBlock = {
        rawValue?: string;
        cornerPoints?: Array<{ x: number; y: number }>;
      };

      const NativeTextDetector = (
        globalThis as {
          TextDetector?: new () => {
            detect: (source: ImageBitmapSource) => Promise<DetectedTextBlock[]>;
          };
        }
      ).TextDetector;
      const nativeTextDetector = NativeTextDetector
        ? new NativeTextDetector()
        : null;

      const detectTextWithNativeApi = async (
        source: ImageBitmapSource,
      ): Promise<string | null> => {
        if (!nativeTextDetector) {
          return null;
        }

        try {
          const blocks = await nativeTextDetector.detect(source);
          const text = blocks
            .map((block) =>
              typeof block.rawValue === "string" ? block.rawValue.trim() : "",
            )
            .filter(Boolean)
            .join("\n")
            .trim();
          return text || null;
        } catch {
          return null;
        }
      };

      const scorePanelOcrCandidate = (
        text: string,
        hintNames: string[],
      ): number => {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (!normalized) {
          return -1;
        }

        const compact = normalizeStatName(normalized).replace(/\s+/g, "");
        let score = 0;

        if (/[A-Za-z]{2,}/.test(normalized)) score += 1;
        if (/\d/.test(normalized)) score += 1;
        if (/[+]/.test(normalized)) score += 2;
        if (/%/.test(normalized)) score += 0.5;
        if (compact.length >= 3 && compact.length <= 40) score += 0.5;
        if (compact.length <= 12) score += 0.75;
        if (/^[A-Za-z ]+[+#]\d+%?$/.test(normalized.replace(/\s+/g, ""))) {
          score += 2;
        }

        for (const hint of hintNames) {
          const hintCompact = normalizeStatName(hint).replace(/\s+/g, "");
          if (!hintCompact) continue;
          if (compact.includes(hintCompact) || hintCompact.includes(compact)) {
            score += 3;
          }

          const overlapLength = Math.min(compact.length, hintCompact.length);
          if (
            overlapLength >= 3 &&
            (compact.includes(hintCompact.slice(0, overlapLength)) ||
              hintCompact.includes(compact.slice(0, overlapLength)))
          ) {
            score += 1.5;
          }
        }

        if (/([A-Za-z][A-Za-z ]{1,30})\s*[+#]\s*\d/.test(normalized)) {
          score += 3;
        }

        return score;
      };

      const recognizeAwakenPanelText = async (
        image: RgbImageData,
        hintNames: string[],
      ): Promise<string> => {
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = image.width * 4;
        cropCanvas.height = image.height * 4;
        const ctx = cropCanvas.getContext("2d");

        const nativeCanvas = document.createElement("canvas");
        nativeCanvas.width = image.width * 4;
        nativeCanvas.height = image.height * 4;
        const nativeCtx = nativeCanvas.getContext("2d");

        if (!ctx || !nativeCtx) {
          return "";
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        nativeCtx.imageSmoothingEnabled = true;
        nativeCtx.imageSmoothingQuality = "high";

        const imgBitmap = await createImageBitmap(
          new ImageData(
            new Uint8ClampedArray(image.rgb),
            image.width,
            image.height,
          ),
        );
        ctx.drawImage(
          imgBitmap,
          0,
          0,
          image.width,
          image.height,
          0,
          0,
          cropCanvas.width,
          cropCanvas.height,
        );
        nativeCtx.drawImage(
          imgBitmap,
          0,
          0,
          image.width,
          image.height,
          0,
          0,
          nativeCanvas.width,
          nativeCanvas.height,
        );
        imgBitmap.close();

        const base = ctx.getImageData(
          0,
          0,
          cropCanvas.width,
          cropCanvas.height,
        );

        const buildBinaryVariant = (
          threshold: number | null,
          _brightTextMask: boolean,
        ): ImageData => {
          const thr = threshold ?? 150;
          const w = base.width;
          const h = base.height;
          const data = base.data;

          // Grayscale
          const gray = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) {
            gray[i] =
              (0.299 * data[i * 4] +
                0.587 * data[i * 4 + 1] +
                0.114 * data[i * 4 + 2] +
                0.5) |
              0;
          }

          // Threshold BINARY_INV: gray > thr → 0, else → 255
          const thresh = new Uint8Array(w * h);
          for (let i = 0; i < gray.length; i++) {
            thresh[i] = gray[i] > thr ? 0 : 255;
          }

          // Median blur 3x3
          const median = new Uint8Array(w * h);
          const nb = new Uint8Array(9);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let k = 0;
              for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                  const ny = Math.max(0, Math.min(h - 1, y + dy));
                  const nx = Math.max(0, Math.min(w - 1, x + dx));
                  nb[k++] = thresh[ny * w + nx];
                }
              }
              nb.sort((a, b) => a - b);
              median[y * w + x] = nb[4];
            }
          }

          // Erosion: 2x2 ones kernel, anchor (0,0)
          // output(x,y) = min of (x,y),(x+1,y),(x,y+1),(x+1,y+1)
          const eroded = new Uint8Array(w * h);
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              let minVal = 255;
              for (let dy = 0; dy <= 1; dy++) {
                for (let dx = 0; dx <= 1; dx++) {
                  const ny = Math.min(h - 1, y + dy);
                  const nx = Math.min(w - 1, x + dx);
                  const v = median[ny * w + nx];
                  if (v < minVal) minVal = v;
                }
              }
              eroded[y * w + x] = minVal;
            }
          }

          const rgba = new Uint8ClampedArray(w * h * 4);
          for (let i = 0; i < eroded.length; i++) {
            const v = eroded[i];
            rgba[i * 4] = v;
            rgba[i * 4 + 1] = v;
            rgba[i * 4 + 2] = v;
            rgba[i * 4 + 3] = 255;
          }

          return new ImageData(rgba, w, h);
        };

        const candidates: string[] = [];
        const nativeText = await detectTextWithNativeApi(nativeCanvas);
        if (nativeText) {
          candidates.push(nativeText);
        }

        const variants: Array<{
          threshold: number | null;
          brightTextMask: boolean;
        }> = [
          { threshold: 150, brightTextMask: false },
          { threshold: 132, brightTextMask: false },
          { threshold: 168, brightTextMask: false },
          { threshold: null, brightTextMask: true },
        ];

        let bestText = "";
        let bestScore = -1;

        for (const candidate of candidates) {
          const score = scorePanelOcrCandidate(candidate, hintNames);
          if (score > bestScore) {
            bestText = candidate;
            bestScore = score;
          }
        }

        for (const variant of variants) {
          const processed = buildBinaryVariant(
            variant.threshold,
            variant.brightTextMask,
          );
          ctx.putImageData(processed, 0, 0);
          const result = await worker.recognize(cropCanvas);
          const text =
            typeof result?.data?.text === "string" ? result.data.text : "";
          const score = scorePanelOcrCandidate(text, hintNames);
          if (score > bestScore) {
            bestText = text;
            bestScore = score;
          }
          if (score >= 7) {
            break;
          }
        }

        return bestText;
      };

      const recognizeAwakenResultText = async (
        regionImage: RgbImageData,
        side: "left" | "right",
        hintNames: string[],
      ): Promise<string> => {
        const baseX = side === "left" ? 0.028 : 0.526;
        const cropVariants = [
          { x: baseX, y: 0.796, width: 0.448, height: 0.088 },
          { x: baseX + 0.008, y: 0.812, width: 0.428, height: 0.068 },
          { x: baseX + 0.014, y: 0.822, width: 0.412, height: 0.056 },
        ];

        let bestText = "";
        let bestScore = -1;

        for (const variant of cropVariants) {
          const crop = cropRgbImageData(regionImage, {
            x: Math.max(0, Math.round(regionImage.width * variant.x)),
            y: Math.max(0, Math.round(regionImage.height * variant.y)),
            width: Math.max(1, Math.round(regionImage.width * variant.width)),
            height: Math.max(
              1,
              Math.round(regionImage.height * variant.height),
            ),
          });
          if (!crop) {
            continue;
          }

          const text = await recognizeAwakenPanelText(crop, hintNames);
          const score = scorePanelOcrCandidate(text, hintNames);
          if (score > bestScore) {
            bestText = text;
            bestScore = score;
          }
          if (score >= 8) {
            break;
          }
        }

        return bestText;
      };

      type AwakenRegionSnapshot = {
        fullImg: RgbImageData;
        cropRect: { x: number; y: number; width: number; height: number };
        regionImg: RgbImageData;
        buttonMatch: AwakenButtonMatch | null;
      };

      const captureAwakenRegionSnapshot = async (
        cfg: typeof latestSettingsRef.current.autoAwaken,
      ): Promise<AwakenRegionSnapshot | null> => {
        const scanRegion = cfg.scanRegion;
        if (!scanRegion) {
          return null;
        }

        const screenshot = await captureGameplayScreenshot();
        if (!screenshot) {
          return null;
        }

        const fullImg = await loadRgbImageDataFromDataUrl(
          screenshot,
          AUTO_IMAGE_SCALE_WIDTH,
        );
        const cropRect = {
          x: Math.round(scanRegion.x * fullImg.width),
          y: Math.round(scanRegion.y * fullImg.height),
          width: Math.round(scanRegion.width * fullImg.width),
          height: Math.round(scanRegion.height * fullImg.height),
        };
        const regionImg = cropRgbImageData(fullImg, cropRect) ?? fullImg;
        let buttonMatch: AwakenButtonMatch | null = null;
        for (const template of buttonTemplates) {
          const match = findAwakenButtonMatch(
            regionImg,
            template.image,
            template.label,
          );
          if (match) {
            buttonMatch = match;
            break;
          }
        }

        return {
          fullImg,
          cropRect,
          regionImg,
          buttonMatch,
        };
      };

      const waitForAwakenReadyState = async (
        cfg: typeof latestSettingsRef.current.autoAwaken,
      ): Promise<AwakenRegionSnapshot | null> => {
        let phase: "disappear" | "reappear" | "idle" = waitingForButtonReappear
          ? "disappear"
          : "idle";

        while (autoAwakenRunningRef.current) {
          const snapshot = await captureAwakenRegionSnapshot(cfg);
          if (!snapshot) {
            if (phase === "disappear") {
              setAutoAwakenStatus("⏳ Waiting for reroll...");
            } else if (phase === "reappear") {
              setAutoAwakenStatus("⏳ Waiting for button to reappear...");
            } else {
              setAutoAwakenStatus("🔍 Waiting for button...");
            }
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }

          if (buttonTemplates.length === 0) {
            return snapshot;
          }

          const buttonVisible = Boolean(snapshot.buttonMatch);

          if (phase === "idle") {
            if (buttonVisible) {
              addLog("Button visible – reading current result.");
              return snapshot;
            }
            addLog("Button not visible. Waiting for it to appear...");
            phase = "reappear";
            setAutoAwakenStatus("🔍 Waiting for button...");
            await new Promise((r) => setTimeout(r, 250));
            continue;
          }

          if (phase === "disappear") {
            if (!buttonVisible) {
              addLog("Button disappeared – reroll in progress.");
              setAutoAwakenStatus("⏳ Waiting for reroll...");
              phase = "reappear";
              await new Promise((r) => setTimeout(r, 250));
              continue;
            }
            // Button still visible – not gone yet, keep polling
            setAutoAwakenStatus("⏳ Waiting for reroll...");
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }

          // phase === "reappear"
          if (buttonVisible) {
            if (
              expectedReappearTemplate &&
              snapshot.buttonMatch?.templateLabel !== expectedReappearTemplate
            ) {
              setAutoAwakenStatus("⏳ Waiting for button to reappear...");
              await new Promise((r) => setTimeout(r, 250));
              continue;
            }
            addLog(
              "Button reappeared – reroll finished. Reading settled result.",
            );
            waitingForButtonReappear = false;
            expectedReappearTemplate = null;
            return snapshot;
          }

          setAutoAwakenStatus("⏳ Waiting for button to reappear...");
          await new Promise((r) => setTimeout(r, 250));
        }

        return null;
      };

      const clickAwakenButtonFromSnapshot = (
        snapshot: AwakenRegionSnapshot,
        match: AwakenButtonMatch,
        reason: "initial" | "reroll",
      ) => {
        const { fullImg, cropRect } = snapshot;
        const scaleX = window.innerWidth / fullImg.width;
        const scaleY = window.innerHeight / fullImg.height;
        const vx = Math.round((cropRect.x + match.x) * scaleX);
        const vy = Math.round((cropRect.y + match.y) * scaleY);
        setAutoAwakenStatus("🔄 Re-awakening...");
        if (reason === "initial") {
          addLog(
            `Initial start: clicking reroll at (${vx}, ${vy}) via ${match.templateLabel}/jsfeat/${match.regionLabel} (scale ${match.scale.toFixed(2)}) and skipping pre-existing result.`,
          );
        } else {
          addLog(
            `Stats did not match – clicking reroll at (${vx}, ${vy}) via ${match.templateLabel}/jsfeat/${match.regionLabel} (scale ${match.scale.toFixed(2)}).`,
          );
        }
        clickViewport(vx, vy);
        waitingForButtonReappear = true;
        addLog("Waiting for button to disappear and reappear after click...");
      };

      let initialRerollTriggered = false;

      while (autoAwakenRunningRef.current) {
        const currentSettings = latestSettingsRef.current;
        const cfg = currentSettings.autoAwaken;

        if (!cfg.scanRegion) {
          setAutoAwakenStatus("No scan region set.");
          addLog("No scan region \u2013 stopping.");
          break;
        }

        const snapshot = await waitForAwakenReadyState(cfg);
        if (!snapshot) {
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }

        const { regionImg, buttonMatch } = snapshot;
        if (!buttonMatch && buttonTemplates.length > 0) {
          addLog(
            "Button not found in region. Tried button_image.png/button_image2.png over bottom-center, bottom, and full-region search at multiple scales.",
          );
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }

        if (
          !initialRerollTriggered &&
          buttonTemplates.length > 0 &&
          buttonMatch
        ) {
          clickAwakenButtonFromSnapshot(snapshot, buttonMatch, "initial");
          if (await ensureButtonTemplate2()) {
            const hasTemplate2 = buttonTemplates.some(
              (t) => t.label === "button_image2.png",
            );
            if (!hasTemplate2 && buttonTemplate2) {
              buttonTemplates.push({
                label: "button_image2.png",
                image: buttonTemplate2,
              });
            }
            expectedReappearTemplate = "button_image2.png";
            addLog(
              "Initial reroll will wait for button_image2.png, then succeeding rerolls accept either button template.",
            );
          } else {
            expectedReappearTemplate = "button_image.png";
            addLog("Falling back to button_image.png for reappear detection.");
          }
          initialRerollTriggered = true;
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        // ── OCR – read the bottom result box of each panel ───────────────
        addLog("Reading stats from settled result...");
        let stat1OcrText = "";
        let stat2OcrText = "";
        try {
          setAutoAwakenStatus("🔍 Analyzing stats...");

          const stat1HintNames = cfg.stat1Criteria.flatMap((criterion) => {
            const stat = AWAKEN_STAT_BY_ID[criterion.statId];
            return stat?.ocrNames ?? [];
          });
          const stat2HintNames = cfg.stat2Criteria.flatMap((criterion) => {
            const stat = AWAKEN_STAT_BY_ID[criterion.statId];
            return stat?.ocrNames ?? [];
          });

          const fallbackHintNames = [
            ...cfg.stat1Criteria,
            ...cfg.stat2Criteria,
          ].flatMap((criterion) => {
            const stat = AWAKEN_STAT_BY_ID[criterion.statId];
            return stat?.ocrNames ?? [];
          });

          [stat1OcrText, stat2OcrText] = await Promise.all([
            recognizeAwakenResultText(
              regionImg,
              "left",
              stat1HintNames.length > 0 ? stat1HintNames : fallbackHintNames,
            ),
            recognizeAwakenResultText(
              regionImg,
              "right",
              stat2HintNames.length > 0 ? stat2HintNames : fallbackHintNames,
            ),
          ]);
        } catch {
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }

        const normalizedStat1OcrText = stat1OcrText.replace(/\s+/g, " ").trim();
        const normalizedStat2OcrText = stat2OcrText.replace(/\s+/g, " ").trim();
        const normalizedOcrText = [
          normalizedStat1OcrText,
          normalizedStat2OcrText,
        ]
          .filter(Boolean)
          .join(" | ");
        addLog(
          `OCR Stat 1: ${normalizedStat1OcrText ? `${normalizedStat1OcrText.slice(0, 80)}${normalizedStat1OcrText.length > 80 ? "..." : ""}` : "(empty)"}`,
        );
        addLog(
          `OCR Stat 2: ${normalizedStat2OcrText ? `${normalizedStat2OcrText.slice(0, 80)}${normalizedStat2OcrText.length > 80 ? "..." : ""}` : "(empty)"}`,
        );

        if (!normalizedOcrText) {
          addLog(
            "No readable text while button is visible. Waiting before retry...",
          );
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }

        // ── Parse detected stats (panel-first, fuzzy stat matching) ───────
        type DetectedStat = { statId: string; value: number };
        const detected: DetectedStat[] = [];
        const configuredCriteria = [...cfg.stat1Criteria, ...cfg.stat2Criteria];

        const targetStatIdByNormalizedLabel = new Map<string, string>();
        for (const criterion of configuredCriteria) {
          const stat = AWAKEN_STAT_BY_ID[criterion.statId];
          if (!stat) continue;
          targetStatIdByNormalizedLabel.set(
            normalizeStatName(stat.label),
            criterion.statId,
          );
        }

        if (targetStatIdByNormalizedLabel.size === 0) {
          addLog("No configured target stats – stopping.");
          break;
        }

        const normalizeAwakenResultLabel = (value: string): string =>
          value
            .replace(/[|!]/g, "I")
            .replace(/0/g, "O")
            .replace(/5/g, "S")
            .replace(/[^A-Za-z ]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

        const levenshtein = (a: string, b: string): number => {
          if (a === b) return 0;
          if (a.length === 0) return b.length;
          if (b.length === 0) return a.length;

          const dp = Array.from({ length: a.length + 1 }, () =>
            new Array<number>(b.length + 1).fill(0),
          );
          for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
          for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;

          for (let i = 1; i <= a.length; i += 1) {
            for (let j = 1; j <= b.length; j += 1) {
              const cost = a[i - 1] === b[j - 1] ? 0 : 1;
              dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost,
              );
            }
          }
          return dp[a.length][b.length];
        };

        const findBestConfiguredStatId = (label: string): string | null => {
          const normalizedLabel = normalizeAwakenResultLabel(label).replace(
            /\s+/g,
            "",
          );
          if (!normalizedLabel) {
            return null;
          }

          let best: { statId: string; score: number } | null = null;
          for (const criterion of configuredCriteria) {
            const stat = AWAKEN_STAT_BY_ID[criterion.statId];
            if (!stat) continue;

            for (const name of stat.ocrNames) {
              const candidate = normalizeAwakenResultLabel(name).replace(
                /\s+/g,
                "",
              );
              if (!candidate) continue;

              let score = 0;
              if (normalizedLabel === candidate) {
                score = 1;
              } else if (normalizedLabel.includes(candidate)) {
                score = candidate.length / normalizedLabel.length;
              } else {
                const dist = levenshtein(normalizedLabel, candidate);
                score =
                  1 - dist / Math.max(normalizedLabel.length, candidate.length);
              }

              if (!best || score > best.score) {
                best = { statId: criterion.statId, score };
              }
            }
          }

          return best && best.score >= 0.58 ? best.statId : null;
        };

        const parsePanelResult = (panelText: string): DetectedStat | null => {
          const normalized = panelText.replace(/\s+/g, " ").trim();
          if (!normalized) {
            return null;
          }

          const valueMatch = normalized.match(/([+\-]?\d+(?:\.\d+)?)(%?)/);
          if (!valueMatch) {
            return null;
          }
          const value = Number.parseFloat(valueMatch[1]);
          if (!Number.isFinite(value) || value < 0) {
            return null;
          }

          const labelPart = normalized
            .slice(0, Math.max(0, valueMatch.index ?? 0))
            .replace(/[+#]+$/g, "")
            .trim();
          const statId = findBestConfiguredStatId(labelPart || normalized);
          if (!statId) {
            return null;
          }

          return { statId, value };
        };

        const stat1Parsed = parsePanelResult(stat1OcrText);
        const stat2Parsed = parsePanelResult(stat2OcrText);
        if (stat1Parsed) {
          detected.push(stat1Parsed);
        }
        if (stat2Parsed) {
          detected.push(stat2Parsed);
        }

        const fallbackPanelTexts: string[] = [];
        if (!stat1Parsed) {
          fallbackPanelTexts.push(stat1OcrText);
        }
        if (!stat2Parsed) {
          fallbackPanelTexts.push(stat2OcrText);
        }

        const panelCombinedText = fallbackPanelTexts.join("\n");
        const pattern =
          /([A-Za-z][A-Za-z ]{0,40}?)\s*[+#]\s*(\d+(?:\.\d+)?)(%?)/gi;
        for (const match of panelCombinedText.matchAll(pattern)) {
          const detectedLabel = match[1] ?? "";
          const numStr = match[2] ?? "";
          const statId = targetStatIdByNormalizedLabel.get(
            normalizeStatName(detectedLabel),
          );
          if (!statId) continue;

          const value = Number.parseFloat(numStr);
          if (!Number.isFinite(value) || value <= 0) continue;
          detected.push({ statId, value });
        }

        const occurrencesByStat = new Map<string, number[]>();
        for (const entry of detected) {
          const existing = occurrencesByStat.get(entry.statId) ?? [];
          existing.push(entry.value);
          occurrencesByStat.set(entry.statId, existing);
        }

        // ── Evaluate criteria ──────────────────────────────────────────────
        // OR logic: stop if ANY configured Stat Name + Value is found.
        // Cross-panel: stats from either panel are pooled into occurrencesByStat,
        // so Stat 1 criteria can match the right panel and vice versa.
        // Sum mode: when only ONE section is configured, occurrences of the same
        // stat on both panels are summed before comparing against statValue.
        const hasStat1Section = cfg.stat1Criteria.length > 0;
        const hasStat2Section = cfg.stat2Criteria.length > 0;
        const singleSectionMode = hasStat1Section !== hasStat2Section;

        const allCriteria = [...cfg.stat1Criteria, ...cfg.stat2Criteria];
        const matched =
          allCriteria.length > 0 &&
          allCriteria.some((criterion) => {
            const occurrences = occurrencesByStat.get(criterion.statId) ?? [];
            if (occurrences.length === 0) return false;
            if (singleSectionMode && occurrences.length >= 2) {
              const sum = occurrences.reduce((a, b) => a + b, 0);
              return sum >= criterion.statValue;
            }
            return occurrences.some((value) => value >= criterion.statValue);
          });

        const detectedSummary = detected
          .map((d) => {
            const stat = AWAKEN_STAT_BY_ID[d.statId];
            if (!stat) return null;
            return `${stat.label}+${d.value}`;
          })
          .filter((entry): entry is string => Boolean(entry));
        if (detectedSummary.length > 0) {
          addLog(`Detected in region: ${detectedSummary.join(", ")}`);
        } else {
          addLog("Detected in region: none");
        }

        for (const criterion of configuredCriteria) {
          const occurrences = occurrencesByStat.get(criterion.statId) ?? [];
          const stat = AWAKEN_STAT_BY_ID[criterion.statId];
          const statLabel = stat?.label ?? criterion.statId;
          if (occurrences.length === 0) {
            addLog(`${statLabel} not detected (target ${criterion.statValue})`);
            continue;
          }

          let observed = Math.max(...occurrences);
          let observedExpr = `${observed}`;

          if (singleSectionMode && occurrences.length >= 2) {
            observed = occurrences[0] + occurrences[1];
            observedExpr = `${occurrences[0]}+${occurrences[1]}=${observed}`;
          }

          const cmp =
            observed < criterion.statValue
              ? "<"
              : observed > criterion.statValue
                ? ">"
                : "=";
          addLog(
            `${statLabel} found (${observedExpr}) ${cmp} target ${criterion.statValue}`,
          );
        }

        if (matched) {
          addLog("\u2713 MATCH FOUND! Stopping.");
          setAutoAwakenStatus("🎉 Target found! Awaiting decision...");
          autoAwakenRunningRef.current = false;
          setAutoAwakenRunning(false);
          break;
        }

        if (buttonTemplates.length > 0 && buttonMatch) {
          clickAwakenButtonFromSnapshot(snapshot, buttonMatch, "reroll");
          // After the initial cycle, treat either button image as valid reappearance.
          expectedReappearTemplate = null;
        }

        await new Promise((r) => setTimeout(r, 200));
      }

      if (autoAwakenRunningRef.current) {
        autoAwakenRunningRef.current = false;
        setAutoAwakenRunning(false);
      }
    },
    [captureGameplayScreenshot, ensureAwakenOcrWorker],
  );

  // Cleanup awaken worker on unmount
  useEffect(() => {
    return () => {
      autoAwakenRunningRef.current = false;
      awakenButtonTemplateRef.current = null;
      const w = awakenOcrWorkerRef.current;
      awakenOcrWorkerRef.current = null;
      awakenOcrWorkerInitRef.current = null;
      if (w && typeof w.terminate === "function") void w.terminate();
    };
  }, []);

  useEffect(() => {
    if (!settings.autoHoly.enabled || settings.editMode) {
      return;
    }

    const holyKey = settings.autoHoly.holyKey.trim();

    let stopped = false;

    const checkDebuff = async () => {
      if (stopped) {
        return;
      }

      if (!isAutomationExecutionAllowed()) {
        return;
      }

      const templates = autoHolyTemplateRef.current;
      if (!templates.loaded) {
        return;
      }

      const now = Date.now();
      if (now - autoHolyLastTriggerRef.current < AUTO_HOLY_COOLDOWN_MS) {
        return;
      }

      const screenshot = await captureGameplayScreenshot();
      if (!screenshot || stopped) {
        return;
      }

      const scaled = await loadRgbImageDataFromDataUrl(
        screenshot,
        AUTO_IMAGE_SCALE_WIDTH,
      );

      const holyScanImage =
        cropRgbImageData(scaled, {
          ...normalizedRectToImageRect(
            settings.autoHoly.scanRegion ?? DEFAULT_AUTO_HOLY_SCAN_REGION,
            scaled.width,
            scaled.height,
          ),
        }) ?? scaled;
      const regionSource = settings.autoHoly.scanRegion
        ? "captured"
        : "default";

      const matchTemplates = (templateSet: RgbImageData[]): boolean => {
        return templateSet.some((template) =>
          matchTemplateWithMatcher(holyScanImage, template, 0.81),
        );
      };

      const rootMatched =
        settings.autoHoly.debuffType !== "stun" &&
        templates.root.length > 0 &&
        matchTemplates(templates.root);
      const stunMatched =
        settings.autoHoly.debuffType !== "root" &&
        templates.stun.length > 0 &&
        matchTemplates(templates.stun);

      const hasDebuff =
        settings.autoHoly.debuffType === "all"
          ? rootMatched || stunMatched
          : settings.autoHoly.debuffType === "stun"
            ? stunMatched
            : rootMatched;
      const detectedType: "root" | "stun" | "none" = rootMatched
        ? "root"
        : stunMatched
          ? "stun"
          : "none";

      if (!hasDebuff) {
        autoHolyConsecutiveDetectionsRef.current = 0;
        if (settings.autoHoly.debugOverlayEnabled) {
          setAutoHolyDebugInfo({
            hasDebuff: false,
            detectedType,
            mode: "jsfeat",
            regionSource,
            consecutiveDetections: 0,
            requiredConsecutive: AUTO_HOLY_REQUIRED_CONSECUTIVE_DETECTIONS,
            triggered: false,
            updatedAt: Date.now(),
          });
        }
        return;
      }

      autoHolyConsecutiveDetectionsRef.current += 1;
      if (settings.autoHoly.debugOverlayEnabled) {
        setAutoHolyDebugInfo({
          hasDebuff: true,
          detectedType,
          mode: "jsfeat",
          regionSource,
          consecutiveDetections: autoHolyConsecutiveDetectionsRef.current,
          requiredConsecutive: AUTO_HOLY_REQUIRED_CONSECUTIVE_DETECTIONS,
          triggered: false,
          updatedAt: Date.now(),
        });
      }
      if (
        autoHolyConsecutiveDetectionsRef.current <
        AUTO_HOLY_REQUIRED_CONSECUTIVE_DETECTIONS
      ) {
        return;
      }

      const canTrigger = holyKey.length > 0;
      if (canTrigger) {
        autoHolyConsecutiveDetectionsRef.current = 0;
        autoHolyLastTriggerRef.current = now;
      }
      if (settings.autoHoly.debugOverlayEnabled) {
        setAutoHolyDebugInfo({
          hasDebuff: true,
          detectedType,
          mode: "jsfeat",
          regionSource,
          consecutiveDetections: AUTO_HOLY_REQUIRED_CONSECUTIVE_DETECTIONS,
          requiredConsecutive: AUTO_HOLY_REQUIRED_CONSECUTIVE_DETECTIONS,
          triggered: canTrigger,
          updatedAt: Date.now(),
        });
      }
      if (canTrigger) {
        dispatchKeyTriggerKey(holyKey);
      }
    };

    const intervalId = window.setInterval(() => {
      void checkDebuff();
    }, 260);
    void checkDebuff();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [
    captureGameplayScreenshot,
    dispatchKeyTriggerKey,
    isAutomationExecutionAllowed,
    settings.autoHoly.debugOverlayEnabled,
    settings.autoHoly.debuffType,
    settings.autoHoly.enabled,
    settings.autoHoly.holyKey,
    settings.autoHoly.scanRegion,
    settings.editMode,
  ]);
  useEffect(() => {
    if (
      !settings.autoHoly.enabled ||
      !settings.autoHoly.debugOverlayEnabled ||
      settings.editMode
    ) {
      setAutoHolyDebugInfo(null);
    }
  }, [
    settings.autoHoly.debugOverlayEnabled,
    settings.autoHoly.enabled,
    settings.editMode,
  ]);

  useEffect(() => {
    if (!settings.autoPills.enabled || settings.editMode) {
      return;
    }

    const pillKey = settings.autoPills.pillKey.trim();
    if (!pillKey) {
      return;
    }

    let stopped = false;

    const estimateHpFromTemplates = (
      image: RgbImageData,
    ): {
      templateEstimatedHp: number | null;
      templateState: HpTemplateState | null;
      templateDisplayMode: HpDisplayMode | null;
      templateMatchedVariant: string | null;
    } => {
      const templates = hpTemplateRef.current;
      if (!templates.loaded || templates.variants.length === 0) {
        return {
          templateEstimatedHp: null,
          templateState: null,
          templateDisplayMode: null,
          templateMatchedVariant: null,
        };
      }

      let bestMatch: {
        variant: HpTemplateVariant;
        confidence: number;
      } | null = null;

      for (const variant of templates.variants) {
        const matchedStrict = matchTemplateWithMatcher(
          image,
          variant.image,
          0.84,
        );
        const matchedRelaxed =
          !matchedStrict &&
          matchTemplateWithMatcher(image, variant.image, 0.76);

        if (!matchedStrict && !matchedRelaxed) {
          continue;
        }

        const confidence = matchedStrict ? 2 : 1;
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            variant,
            confidence,
          };
        }
      }

      if (!bestMatch) {
        return {
          templateEstimatedHp: null,
          templateState: null,
          templateDisplayMode: null,
          templateMatchedVariant: null,
        };
      }

      const templateEstimatedHp =
        bestMatch.variant.state === "full" ? 100 : null;

      return {
        templateEstimatedHp,
        templateState: bestMatch.variant.state,
        templateDisplayMode: bestMatch.variant.displayMode,
        templateMatchedVariant: bestMatch.variant.label,
      };
    };

    const checkHp = async () => {
      if (stopped) {
        return;
      }

      if (!isAutomationExecutionAllowed()) {
        return;
      }

      const now = Date.now();
      if (now - autoPillsLastTriggerRef.current < AUTO_PILLS_COOLDOWN_MS) {
        return;
      }

      try {
        const screenshot = await captureGameplayScreenshot();
        if (!screenshot || stopped) {
          return;
        }

        const scaled = await loadRgbImageDataFromDataUrl(
          screenshot,
          AUTO_IMAGE_SCALE_WIDTH,
        );
        const hpScanImage =
          cropRgbImageData(scaled, {
            ...normalizedRectToImageRect(
              settings.autoPills.scanRegion ?? DEFAULT_AUTO_PILLS_SCAN_REGION,
              scaled.width,
              scaled.height,
            ),
          }) ?? scaled;

        // Locate the HP bar row within the scan region by finding the topmost
        // band of rows containing a sufficiently wide red pixel span.  This is
        // display-mode-agnostic (raw values / percentage / clean bar) and
        // window-size-agnostic — HP is always the only red bar.
        const hpRowLoc = locateHpBarRowByColor(hpScanImage);
        const hpRowImage = hpRowLoc
          ? (cropRgbImageData(hpScanImage, {
              x: 0,
              y: hpRowLoc.y,
              width: hpScanImage.width,
              height: hpRowLoc.height,
            }) ?? hpScanImage)
          : hpScanImage;

        const threshold = Number(settings.autoPills.hpThreshold);
        if (!Number.isFinite(threshold)) {
          return;
        }

        const colorMetrics = estimateHpPercentByColor(hpRowImage);
        const colorEstimatedHp = colorMetrics.hpPercent;
        const {
          templateEstimatedHp,
          templateState,
          templateDisplayMode,
          templateMatchedVariant,
        } = estimateHpFromTemplates(hpScanImage);
        const ocrResult = await recognizeHpText(hpRowImage);
        const ocrEstimatedHp = ocrResult?.hpPercent ?? null;
        const ocrConfidence = ocrResult?.confidence ?? null;
        const ocrMode = ocrResult?.mode ?? null;
        const ocrRawText = ocrResult?.rawText ?? null;
        const ocrEligible =
          ocrEstimatedHp !== null &&
          (ocrConfidence ?? 0) >= AUTO_PILLS_OCR_MIN_CONFIDENCE &&
          ocrMode !== null;

        const modeSource: AutoPillsDebugInfo["modeSource"] = templateDisplayMode
          ? "template"
          : ocrEligible && ocrMode
            ? "ocr"
            : colorMetrics.hpPercent !== null
              ? "bar-geometry"
              : "unknown";

        const resolvedMode: HpDisplayMode =
          templateDisplayMode ??
          (ocrEligible ? ocrMode : null) ??
          colorMetrics.displayMode;

        const textModeExpected =
          resolvedMode === "text-current-max" ||
          resolvedMode === "text-percent";
        const ocrMatchesTextMode =
          ocrEligible &&
          ocrMode !== null &&
          ocrMode !== "bar-geometry" &&
          (!textModeExpected || ocrMode === resolvedMode);

        let hpPercent: number | null = null;
        let hpSource: AutoPillsDebugInfo["hpSource"] = "unknown";
        let decisionPath: AutoPillsDebugInfo["decisionPath"] = "unresolved";

        if (resolvedMode === "bar-geometry") {
          if (colorEstimatedHp !== null) {
            hpPercent = colorEstimatedHp;
            hpSource = "bar-geometry";
            decisionPath = "bar-geometry-color";
          } else if (templateEstimatedHp !== null) {
            hpPercent = templateEstimatedHp;
            hpSource = "template";
            decisionPath = "template-full-confirm";
          }
        } else if (ocrMatchesTextMode) {
          hpPercent = ocrEstimatedHp;
          hpSource = "ocr";
          decisionPath = "text-mode-ocr";
        } else if (templateEstimatedHp !== null) {
          hpPercent = templateEstimatedHp;
          hpSource = "template";
          decisionPath = "template-full-confirm";
        }

        if (settings.autoPills.debugOverlayEnabled) {
          const triggerState =
            hpPercent === null
              ? "unknown"
              : hpPercent <= threshold
                ? "trigger"
                : "safe";

          setAutoPillsDebugInfo({
            hpPercent,
            hpSource,
            modeSource,
            decisionPath,
            colorEstimatedHp,
            ocrEstimatedHp,
            ocrMode,
            ocrConfidence,
            ocrRawText,
            templateEstimatedHp,
            templateState,
            templateMatchedVariant,
            displayMode: resolvedMode,
            bridgedGapCount: colorMetrics.bridgedGapCount,
            largestBridgedGap: colorMetrics.largestBridgedGap,
            trackWidth: colorMetrics.trackWidth,
            filledWidth: colorMetrics.filledWidth,
            trackStartX: colorMetrics.trackStartX,
            trackEndX: colorMetrics.trackEndX,
            threshold,
            triggerState,
            rowY: hpRowLoc?.y ?? null,
            rowHeight: hpRowLoc?.height ?? null,
            updatedAt: Date.now(),
          });
        }

        if (hpPercent === null) {
          return;
        }

        if (AUTO_PILLS_DEBUG_LOG) {
          const debugSignature = `${hpPercent}:${threshold}`;
          if (autoPillsLastDebugSignatureRef.current !== debugSignature) {
            autoPillsLastDebugSignatureRef.current = debugSignature;
            console.debug("[Auto-Pills] HP detected", {
              hpPercent,
              threshold,
              hpSource,
              modeSource,
              decisionPath,
              displayMode: resolvedMode,
              bridgedGapCount: colorMetrics.bridgedGapCount,
              ocrEstimatedHp,
              ocrMode,
              ocrConfidence,
              ocrRawText,
              templateEstimatedHp,
              templateState,
              templateMatchedVariant,
              colorEstimatedHp,
              currentTabId,
            });
          }
        }

        if (hpPercent <= threshold) {
          autoPillsLastTriggerRef.current = now;
          dispatchKeyTriggerKey(pillKey);
          return;
        }
      } catch {
        return;
      }
    };

    const intervalId = window.setInterval(() => {
      void checkHp();
    }, 200);
    void checkHp();

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [
    captureGameplayScreenshot,
    currentTabId,
    dispatchKeyTriggerKey,
    isAutomationExecutionAllowed,
    settings.autoPills.enabled,
    settings.autoPills.debugOverlayEnabled,
    settings.autoPills.hpThreshold,
    settings.autoPills.pillKey,
    settings.autoPills.scanRegion,
    settings.editMode,
    recognizeHpText,
  ]);

  useEffect(() => {
    if (
      !settings.autoPills.debugOverlayEnabled ||
      !settings.autoPills.enabled
    ) {
      setAutoPillsDebugInfo(null);
    }
  }, [settings.autoPills.debugOverlayEnabled, settings.autoPills.enabled]);

  /**
   * Schedule key trigger actions with delay mode.
   * @param profileId Profile identifier
   * @param actions List of actions
   * @param delayMode 'sequential' (default) or 'synchronous'
   */
  const scheduleKeyTriggerActions = useCallback(
    (
      profileId: string,
      actions: KeyTriggerAction[],
      delayMode: "sequential" | "synchronous" = "sequential",
    ) => {
      let timerIds: number[] = [];
      if (delayMode === "sequential") {
        let accumulatedDelayMs = 0;
        timerIds = actions
          .map((action) => ({
            ...action,
            key: action.key.trim(),
            delayMs: Math.max(0, Math.round(action.delayMs || 0)),
          }))
          .filter((action) => action.key.length > 0)
          .map((action) => {
            accumulatedDelayMs += action.delayMs;
            return window.setTimeout(() => {
              dispatchKeyTriggerKey(action.key);
            }, accumulatedDelayMs);
          });
      } else {
        // synchronous: each action triggers once at its individual delay
        timerIds = actions
          .map((action) => ({
            ...action,
            key: action.key.trim(),
            delayMs: Math.max(0, Math.round(action.delayMs || 0)),
          }))
          .filter((action) => action.key.length > 0)
          .map((action) => {
            return window.setTimeout(() => {
              dispatchKeyTriggerKey(action.key);
            }, action.delayMs);
          });
      }

      if (timerIds.length === 0) {
        return;
      }

      const existing = activeKeyTriggerTimersRef.current.get(profileId) ?? [];
      activeKeyTriggerTimersRef.current.set(profileId, [
        ...existing,
        ...timerIds,
      ]);
    },
    [dispatchKeyTriggerKey],
  );

  const clearKeyTriggerProfileTimers = useCallback((profileId: string) => {
    const timerIds = activeKeyTriggerTimersRef.current.get(profileId);
    if (!timerIds) {
      return;
    }

    timerIds.forEach((timerId) => {
      window.clearTimeout(timerId);
      window.clearInterval(timerId);
    });
    activeKeyTriggerTimersRef.current.delete(profileId);
  }, []);

  const toggleOverlay = () => {
    setIsTransformingShape(false);
    setOverlayVisible(true);
    setDialogVisible((prev) => {
      const next = !prev;
      if (!next) {
        setImportOpen(false);
        window.setTimeout(() => {
          focusGameCanvas();
        }, 0);
      }
      return next;
    });
  };

  const toggleMode = () => {
    setSettings((prev) => {
      const nextEditMode = !prev.editMode;
      if (nextEditMode) {
        window.setTimeout(() => {
          focusGameCanvas();
        }, 0);
      }
      return { ...prev, editMode: nextEditMode };
    });
  };

  useEffect(() => {
    const onRuntimeMessage = (message: unknown) => {
      if (typeof message === "object" && message && "type" in message) {
        const msg = message as {
          type?: string;
          profileId?: string;
          actions?: KeyTriggerAction[];
          event?: MouseSyncEventPayload;
          keyEvent?: KeyboardSyncEventPayload;
        };
        if (msg.type === "TOGGLE_OVERLAY") {
          toggleOverlay();
          return;
        }

        if (msg.type === "KEY_TRIGGER_EXECUTE_ONCE") {
          const profileId = msg.profileId ?? `once-${Date.now()}`;
          clearKeyTriggerProfileTimers(profileId);
          // Find delayMode from profile if available, default to sequential
          let delayMode: "sequential" | "synchronous" = "sequential";
          if (msg.profileId) {
            const profile = keyTriggerProfiles.find(
              (p) => p.id === msg.profileId,
            );
            if (profile && profile.delayMode === "synchronous") {
              delayMode = "synchronous";
            }
          }
          scheduleKeyTriggerActions(
            profileId,
            Array.isArray(msg.actions) ? msg.actions : [],
            delayMode,
          );
          return;
        }

        if (msg.type === "KEY_TRIGGER_START_TOGGLE") {
          if (!msg.profileId) {
            return;
          }

          clearKeyTriggerProfileTimers(msg.profileId);
          const actions = Array.isArray(msg.actions) ? msg.actions : [];
          // Find delayMode from profile if available, default to sequential
          // profileId may be scoped as "originalId::tabIds", extract original to look up
          let delayMode: "sequential" | "synchronous" = "sequential";
          const originalProfileId = msg.profileId.split("::")[0];
          const profile = keyTriggerProfiles.find(
            (p) => p.id === originalProfileId,
          );
          if (profile && profile.delayMode === "synchronous") {
            delayMode = "synchronous";
          }

          if (delayMode === "synchronous") {
            // For synchronous toggle: each action repeats independently at its own interval
            const timerIds: number[] = [];
            actions.forEach((action) => {
              const cleanKey = action.key.trim();
              const delayMs = Math.max(0, Math.round(action.delayMs || 0));

              if (cleanKey.length > 0) {
                // Fire immediately first
                dispatchKeyTriggerKey(cleanKey);

                // Then repeat at the specified interval
                if (delayMs > 0) {
                  const intervalId = window.setInterval(() => {
                    dispatchKeyTriggerKey(cleanKey);
                  }, delayMs);
                  timerIds.push(intervalId);
                }
              }
            });

            if (timerIds.length > 0) {
              activeKeyTriggerTimersRef.current.set(msg.profileId, timerIds);
            }
          } else {
            // For sequential toggle: cycle through all actions in sequence and repeat the cycle
            const totalSequenceDelay = actions.reduce((totalDelay, action) => {
              return totalDelay + Math.max(0, Math.round(action.delayMs || 0));
            }, 0);
            const cycleMs = Math.max(250, totalSequenceDelay + 120);

            const intervalId = window.setInterval(() => {
              scheduleKeyTriggerActions(
                msg.profileId ?? "",
                actions,
                delayMode,
              );
            }, cycleMs);

            activeKeyTriggerTimersRef.current.set(msg.profileId, [intervalId]);
            scheduleKeyTriggerActions(msg.profileId, actions, delayMode);
          }
          return;
        }

        if (msg.type === "KEY_TRIGGER_STOP_TOGGLE") {
          if (!msg.profileId) {
            return;
          }

          clearKeyTriggerProfileTimers(msg.profileId);
          return;
        }

        if (msg.type === "KEY_TRIGGER_STOP_ALL") {
          clearAllKeyTriggerTimers();
          return;
        }

        if (msg.type === "KEY_TRIGGER_RELOAD_TABS") {
          reloadKeyTriggerCharacters();
          return;
        }

        if (msg.type === "MOUSE_SYNC_APPLY") {
          if (!msg.event) {
            return;
          }

          dispatchRemoteMouseSyncEvent(msg.event);
          return;
        }

        if (msg.type === "KEYBOARD_SYNC_APPLY") {
          if (!msg.keyEvent) {
            return;
          }

          dispatchRemoteKeyboardSyncEvent(msg.keyEvent);
        }
      }
    };

    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    return () => chrome.runtime.onMessage.removeListener(onRuntimeMessage);
  }, [
    clearAllKeyTriggerTimers,
    clearKeyTriggerProfileTimers,
    dispatchRemoteKeyboardSyncEvent,
    dispatchRemoteMouseSyncEvent,
    reloadKeyTriggerCharacters,
    scheduleKeyTriggerActions,
    focusGameCanvas,
    selectSingleShape,
    selectedIds.length,
    settings.editMode,
  ]);

  useEffect(() => {
    if (!settings.syncMouseEvents || settings.editMode) {
      return;
    }

    const isEventInsideOverlay = (target: EventTarget | null): boolean => {
      return (
        target instanceof HTMLElement &&
        (target.id === ROOT_ID || target.closest(`#${ROOT_ID}`) !== null)
      );
    };

    const sendMouseSyncPayload = (payload: MouseSyncEventPayload) => {
      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        return;
      }

      const tabIds = getKeyTriggerTargetTabIds();
      if (tabIds.length === 0) {
        return;
      }

      void safeSendRuntimeMessage({
        type: "MOUSE_SYNC_BROADCAST",
        tabIds,
        event: {
          ...payload,
          ratioX: payload.clientX / Math.max(1, window.innerWidth - 1),
          ratioY: payload.clientY / Math.max(1, window.innerHeight - 1),
          sourceViewportWidth: window.innerWidth,
          sourceViewportHeight: window.innerHeight,
        },
      });
    };

    const isEventOnGameplayCanvas = (target: EventTarget | null): boolean => {
      const canvas = document.querySelector("canvas");
      if (!canvas || !(target instanceof Element)) {
        return false;
      }

      return target === canvas || target.closest("canvas") === canvas;
    };

    const SYNCED_GAMEPLAY_KEY_CODES = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]);

    const sendKeyboardSyncPayload = (event: KeyboardEvent) => {
      if (!event.isTrusted || isEventInsideOverlay(event.target)) {
        return;
      }

      if (!SYNCED_GAMEPLAY_KEY_CODES.has(event.code)) {
        return;
      }

      const tabIds = getKeyTriggerTargetTabIds();
      if (tabIds.length === 0) {
        return;
      }

      void safeSendRuntimeMessage({
        type: "KEYBOARD_SYNC_BROADCAST",
        tabIds,
        keyEvent: {
          eventType: event.type === "keyup" ? "keyup" : "keydown",
          key: event.key,
          code: event.code,
          repeat: event.repeat,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
        },
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isTrusted || isEventInsideOverlay(event.target)) {
        return;
      }

      localMouseDownRef.current = true;
      sendMouseSyncPayload({
        eventType: "pointerdown",
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        pointerType: event.pointerType,
        isCanvasInteraction: isEventOnGameplayCanvas(event.target),
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!event.isTrusted || isEventInsideOverlay(event.target)) {
        return;
      }

      localMouseDownRef.current = false;
      sendMouseSyncPayload({
        eventType: "pointerup",
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        pointerType: event.pointerType,
        isCanvasInteraction: isEventOnGameplayCanvas(event.target),
      });
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!event.isTrusted || isEventInsideOverlay(event.target)) {
        return;
      }

      const now = Date.now();
      if (
        now - lastMouseMoveSyncTimeRef.current <
        MOUSE_SYNC_MOVE_INTERVAL_MS
      ) {
        return;
      }

      lastMouseMoveSyncTimeRef.current = now;
      sendMouseSyncPayload({
        eventType: "pointermove",
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        pointerType: event.pointerType,
        isCanvasInteraction: isEventOnGameplayCanvas(event.target),
      });
    };

    const onMouseEvent = (event: MouseEvent) => {
      if (!event.isTrusted || isEventInsideOverlay(event.target)) {
        return;
      }

      if (
        event.type === "mousemove" &&
        !localMouseDownRef.current &&
        Date.now() - lastMouseMoveSyncTimeRef.current <
          MOUSE_SYNC_MOVE_INTERVAL_MS
      ) {
        return;
      }

      if (event.type === "mousemove") {
        lastMouseMoveSyncTimeRef.current = Date.now();
      }

      const eventType = event.type as MouseSyncEventPayload["eventType"];
      sendMouseSyncPayload({
        eventType,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        isCanvasInteraction: isEventOnGameplayCanvas(event.target),
      });
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.isTrusted || isEventInsideOverlay(event.target)) {
        return;
      }

      sendMouseSyncPayload({
        eventType: "wheel",
        clientX: event.clientX,
        clientY: event.clientY,
        button: 0,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        isCanvasInteraction: isEventOnGameplayCanvas(event.target),
      });
    };

    const onKeySync = (event: KeyboardEvent) => {
      sendKeyboardSyncPayload(event);
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("mousedown", onMouseEvent, { capture: true });
    window.addEventListener("mouseup", onMouseEvent, { capture: true });
    window.addEventListener("mousemove", onMouseEvent, { capture: true });
    window.addEventListener("click", onMouseEvent, { capture: true });
    window.addEventListener("contextmenu", onMouseEvent, { capture: true });
    window.addEventListener("wheel", onWheel, {
      capture: true,
      passive: true,
    });
    window.addEventListener("keydown", onKeySync, { capture: true });
    window.addEventListener("keyup", onKeySync, { capture: true });

    return () => {
      localMouseDownRef.current = false;
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, {
        capture: true,
      });
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("mousedown", onMouseEvent, {
        capture: true,
      });
      window.removeEventListener("mouseup", onMouseEvent, {
        capture: true,
      });
      window.removeEventListener("mousemove", onMouseEvent, {
        capture: true,
      });
      window.removeEventListener("click", onMouseEvent, {
        capture: true,
      });
      window.removeEventListener("contextmenu", onMouseEvent, {
        capture: true,
      });
      window.removeEventListener("wheel", onWheel, {
        capture: true,
      });
      window.removeEventListener("keydown", onKeySync, { capture: true });
      window.removeEventListener("keyup", onKeySync, { capture: true });
    };
  }, [getKeyTriggerTargetTabIds, settings.editMode, settings.syncMouseEvents]);

  useEffect(() => {
    const SEQUENCE_COMPLETION_WINDOW_MS = 350;

    let pendingSequencePassThrough: {
      timerId: number;
      token: string;
      key: string;
      code: string;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
      timestamp: number;
    } | null = null;

    const dispatchPendingKeyToCanvas = () => {
      if (!pendingSequencePassThrough) {
        return;
      }

      const pending = pendingSequencePassThrough;
      pendingSequencePassThrough = null;

      for (
        let index = shapeBindingHistoryRef.current.length - 1;
        index >= 0;
        index -= 1
      ) {
        const item = shapeBindingHistoryRef.current[index];
        if (
          item.token === pending.token &&
          Math.abs(item.timestamp - pending.timestamp) <= 1000
        ) {
          shapeBindingHistoryRef.current.splice(index, 1);
          break;
        }
      }

      const target =
        (document.querySelector("canvas") as HTMLElement | null) ??
        (document.activeElement as HTMLElement | null) ??
        window;

      const eventInit: KeyboardEventInit = {
        key: pending.key,
        code: pending.code,
        ctrlKey: pending.ctrlKey,
        altKey: pending.altKey,
        shiftKey: pending.shiftKey,
        metaKey: pending.metaKey,
        bubbles: true,
        cancelable: true,
      };

      target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
      target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    };

    const clearPendingSequencePassThrough = () => {
      if (!pendingSequencePassThrough) {
        return;
      }

      window.clearTimeout(pendingSequencePassThrough.timerId);
      pendingSequencePassThrough = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.isTrusted) {
        return;
      }

      const isInputTarget =
        (event.target as HTMLElement | null)?.tagName === "INPUT";
      const isToggleDialogShortcutFieldFocused =
        (document.activeElement as HTMLElement | null)?.classList.contains(
          "fm-toggle-dialog-shortcut-input",
        ) ?? false;
      const canHandleGlobalDialogShortcut = shouldHandleGlobalDialogShortcut({
        isInputTarget,
        isToggleDialogShortcutFieldFocused,
      });

      const keyToken = getKeyboardBindingToken(event);
      const hasPotentialMovementBinding = shapes.some((shape) => {
        if (!shape.keyBinding) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);
        const hasModifier = bindingParts.some((part) =>
          [
            "ctrl",
            "control",
            "alt",
            "shift",
            "meta",
            "cmd",
            "command",
          ].includes(part),
        );

        if (hasModifier) {
          return false;
        }

        return bindingParts.includes(keyToken);
      });

      const hasPotentialSingleStepBinding = shapes.some((shape) => {
        if (
          !shape.keyBinding ||
          getReservedShapeShortcutUsage(shape.keyBinding, settings)
        ) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);

        const modifiers = {
          ctrl:
            bindingParts.includes("ctrl") || bindingParts.includes("control"),
          alt: bindingParts.includes("alt"),
          shift: bindingParts.includes("shift"),
          meta:
            bindingParts.includes("meta") ||
            bindingParts.includes("cmd") ||
            bindingParts.includes("command"),
        };

        const steps = bindingParts.filter(
          (part) =>
            ![
              "ctrl",
              "control",
              "alt",
              "shift",
              "meta",
              "cmd",
              "command",
            ].includes(part),
        );

        return (
          steps.length === 1 &&
          steps[0] === keyToken &&
          event.ctrlKey === modifiers.ctrl &&
          event.altKey === modifiers.alt &&
          event.shiftKey === modifiers.shift &&
          event.metaKey === modifiers.meta
        );
      });

      const hasPotentialSequenceStartBinding = shapes.some((shape) => {
        if (
          !shape.keyBinding ||
          getReservedShapeShortcutUsage(shape.keyBinding, settings)
        ) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);

        const modifiers = {
          ctrl:
            bindingParts.includes("ctrl") || bindingParts.includes("control"),
          alt: bindingParts.includes("alt"),
          shift: bindingParts.includes("shift"),
          meta:
            bindingParts.includes("meta") ||
            bindingParts.includes("cmd") ||
            bindingParts.includes("command"),
        };

        const steps = bindingParts.filter(
          (part) =>
            ![
              "ctrl",
              "control",
              "alt",
              "shift",
              "meta",
              "cmd",
              "command",
            ].includes(part),
        );

        return (
          steps.length > 1 &&
          steps[0] === keyToken &&
          event.ctrlKey === modifiers.ctrl &&
          event.altKey === modifiers.alt &&
          event.shiftKey === modifiers.shift &&
          event.metaKey === modifiers.meta
        );
      });

      const hasPotentialKeyTriggerBinding = keyTriggerProfiles.some(
        (profile) =>
          profile.enabled !== false &&
          profile.triggerKey &&
          matchesBinding(event, profile.triggerKey),
      );

      const shouldPassThroughGameplayMovement =
        !settings.editMode &&
        !isInputTarget &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey &&
        isGameplayMovementKey(event.key);

      if (
        shouldPassThroughGameplayMovement &&
        !hasPotentialMovementBinding &&
        !hasPotentialKeyTriggerBinding
      ) {
        return;
      }

      if (shouldPassThroughGameplayMovement && hasPotentialMovementBinding) {
        event.preventDefault();
        event.stopPropagation();
      }

      const shouldDelaySequenceStartKey =
        !settings.editMode &&
        !isInputTarget &&
        !event.repeat &&
        hasPotentialSequenceStartBinding &&
        !hasPotentialSingleStepBinding;

      if (shouldDelaySequenceStartKey && !pendingSequencePassThrough) {
        event.preventDefault();
        event.stopPropagation();

        const timestamp = Date.now();
        pendingSequencePassThrough = {
          timerId: window.setTimeout(() => {
            dispatchPendingKeyToCanvas();
          }, SEQUENCE_COMPLETION_WINDOW_MS),
          token: keyToken,
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          timestamp,
        };
      }

      const isToggleOverlay = matchesBinding(event, OVERLAY_SHORTCUT);
      const isToggleDialog = matchesBinding(
        event,
        settings.toggleDialogShortcut,
      );
      const isToggleMode = matchesBinding(event, settings.toggleModeShortcut);
      const isFocusCanvas = matchesBinding(event, settings.focusCanvasShortcut);
      const isToggleShapes = matchesBinding(
        event,
        settings.toggleShapesShortcut,
      );
      const isSetZeroOpacity = matchesBinding(
        event,
        settings.setZeroOpacityShortcut,
      );
      const isAddKeyMapShortcut = matchesBinding(
        event,
        settings.addKeyMapShortcut,
      );

      if (!isInputTarget && isToggleOverlay && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        toggleOverlay();
        return;
      }

      if (canHandleGlobalDialogShortcut && isToggleDialog && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        toggleOverlay();
        return;
      }

      if (!isInputTarget && isToggleMode && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        toggleMode();
        return;
      }

      if (!isInputTarget && isFocusCanvas && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        focusGameCanvas();
        return;
      }

      if (!isInputTarget && isToggleShapes && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        setShapesVisible((prev) => {
          const next = !prev;
          if (!next) {
            setRunningTooltip(null);
          }
          return next;
        });
        return;
      }

      if (!isInputTarget && isSetZeroOpacity && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();

        const allAtZero = shapes.every((shape) => shape.opacity <= 0.05);
        const nextOpacity = allAtZero ? 1 : 0;

        setDraftShape((prev) => ({
          ...prev,
          opacity: nextOpacity,
        }));
        setShapes((prev) =>
          prev.map((shape) =>
            normalizeShape({
              ...shape,
              opacity: nextOpacity,
            }),
          ),
        );
        return;
      }

      if (!isInputTarget && isAddKeyMapShortcut && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        const base = createShape(selectedPaletteShapeRef.current);
        const newShape = normalizeShape({
          ...base,
          opacity: draftShape.opacity,
        });
        setShapes((prev) => [...prev, newShape]);
        setSelectedId(newShape.id);
        return;
      }

      if (!settings.editMode && !isInputTarget && !event.repeat) {
        const triggeredProfiles = keyTriggerProfiles.filter((profile) => {
          return (
            profile.enabled !== false &&
            profile.triggerKey &&
            matchesBinding(event, profile.triggerKey)
          );
        });

        if (triggeredProfiles.length > 0) {
          event.preventDefault();
          event.stopPropagation();

          isDispatchingKeyTriggerRef.current = true;
          try {
            dispatchKeyboardEventToCanvas({
              key: event.key,
              code: event.code,
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
              bubbles: true,
              cancelable: true,
              repeat: false,
            });
          } finally {
            isDispatchingKeyTriggerRef.current = false;
          }

          if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
            return;
          }

          const toggleProfiles = triggeredProfiles.filter(
            (profile) => profile.triggerType === "toggle",
          );
          const onceProfiles = triggeredProfiles.filter(
            (profile) => profile.triggerType !== "toggle",
          );

          toggleProfiles.forEach((profile) => {
            // Group actions by their target tabs
            const actionsByTabIds = new Map<string, KeyTriggerAction[]>();

            profile.actions.forEach((action) => {
              const tabIds = getTabIdsForAction(
                action,
                profile.currentTabOnly,
                profile.otherTabsOnly,
              );
              const key = JSON.stringify(tabIds);
              const existing = actionsByTabIds.get(key) ?? [];
              actionsByTabIds.set(key, [...existing, action]);
            });

            // Send one message per unique set of target tabs
            actionsByTabIds.forEach((actions, tabIdsJson) => {
              const tabIds = JSON.parse(tabIdsJson) as number[];
              if (tabIds.length === 0) {
                return;
              }

              const normalizedTabIds = [...tabIds].sort((a, b) => a - b);
              const scopedToggleProfileId = `${profile.id}::${normalizedTabIds.join(",")}`;

              void safeSendRuntimeMessage({
                type: "KEY_TRIGGER_TOGGLE",
                profileId: scopedToggleProfileId,
                tabIds,
                actions,
              });
            });
          });

          onceProfiles.forEach((profile) => {
            // Group actions by their target tabs
            const actionsByTabIds = new Map<string, KeyTriggerAction[]>();

            profile.actions.forEach((action) => {
              const tabIds = getTabIdsForAction(
                action,
                profile.currentTabOnly,
                profile.otherTabsOnly,
              );
              const key = JSON.stringify(tabIds);
              const existing = actionsByTabIds.get(key) ?? [];
              actionsByTabIds.set(key, [...existing, action]);
            });

            // Send one message per unique set of target tabs
            actionsByTabIds.forEach((actions, tabIdsJson) => {
              const tabIds = JSON.parse(tabIdsJson) as number[];
              if (tabIds.length === 0) {
                return;
              }

              void safeSendRuntimeMessage({
                type: "KEY_TRIGGER_RUN_ONCE",
                profileId: profile.id,
                tabIds,
                actions,
              });
            });
          });
          return;
        }
      }

      if (!settings.editMode && settings.strictPassthrough) {
        if (isInputTarget) {
          return;
        }

        recordBindingAction(shapeBindingHistoryRef.current, keyToken);

        const hitAreas = shapes.filter(
          (shape) =>
            shape.keyBinding &&
            !getReservedShapeShortcutUsage(shape.keyBinding, settings) &&
            matchesBindingAction(
              shape.keyBinding,
              {
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
              },
              shapeBindingHistoryRef.current,
            ),
        );

        if (hitAreas.length > 0) {
          clearPendingSequencePassThrough();
          event.preventDefault();
          event.stopPropagation();

          if (event.repeat) {
            return;
          }

          hitAreas.forEach((shape) => {
            triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
          });
        }

        return;
      }

      if (!overlayVisible) return;

      if (event.key === "Escape") {
        if (selectedShape) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedId(null);
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }

        if (dialogVisible) {
          event.preventDefault();
          event.stopPropagation();
          attemptCloseDialog();
          return;
        }
      }

      if (
        settings.editMode &&
        selectedIds.length > 0 &&
        event.key === "Delete"
      ) {
        event.preventDefault();
        event.stopPropagation();
        deleteShapeIds(selectedIds);
        return;
      }

      if (isInputTarget) {
        return;
      }

      if (settings.editMode) {
        const isSelectAllShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "a";

        if (isSelectAllShortcut) {
          event.preventDefault();
          event.stopPropagation();
          if (shapes.length === 0) {
            selectSingleShape(null);
            return;
          }

          const allIds = shapes.map((shape) => shape.id);
          setSelectedIds(allIds);
          setSelectedId(allIds[allIds.length - 1]);
          return;
        }

        const isUndoShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "z";

        if (isUndoShortcut) {
          event.preventDefault();
          event.stopPropagation();
          undoShapeChanges();
          return;
        }

        const isRedoShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          ((event.shiftKey && event.key.toLowerCase() === "z") ||
            (!event.shiftKey && event.key.toLowerCase() === "y"));

        if (isRedoShortcut) {
          event.preventDefault();
          event.stopPropagation();
          redoShapeChanges();
          return;
        }
      }

      if (settings.editMode) {
        const selectedShapesForClipboard = getClipboardShapes(
          shapes,
          selectedIds,
          selectedShape,
        );

        const isCopy = isClipboardShortcut(event, "copy");
        if (isCopy) {
          event.preventDefault();
          event.stopPropagation();
          copyShapeIds(selectedShapesForClipboard.map((shape) => shape.id));
          return;
        }

        const isCut = isClipboardShortcut(event, "cut");
        if (isCut && selectedShapesForClipboard.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          cutShapeIds(selectedShapesForClipboard.map((shape) => shape.id));
          return;
        }

        const isPaste = isClipboardShortcut(event, "paste");
        if (isPaste && copiedShapes.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          pasteCopiedShapesAt();
          return;
        }

        if (!selectedShape) {
          return;
        }
      }

      if (!settings.editMode) {
        recordBindingAction(shapeBindingHistoryRef.current, keyToken);

        const hitAreas = shapes.filter(
          (shape) =>
            shape.keyBinding &&
            !getReservedShapeShortcutUsage(shape.keyBinding, settings) &&
            matchesBindingAction(
              shape.keyBinding,
              {
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
              },
              shapeBindingHistoryRef.current,
            ),
        );
        if (hitAreas.length > 0) {
          clearPendingSequencePassThrough();
          event.preventDefault();
          event.stopPropagation();

          if (event.repeat) {
            return;
          }

          hitAreas.forEach((shape) => {
            triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
          });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      clearPendingSequencePassThrough();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [
    copiedShapes,
    copyShapeIds,
    cutShapeIds,
    deleteShapeIds,
    draftShape.opacity,
    dialogVisible,
    overlayVisible,
    selectedShape,
    selectedIds,
    settings.addKeyMapShortcut,
    settings.editMode,
    settings.focusCanvasShortcut,
    keyTriggerProfiles,
    settings.strictPassthrough,
    settings.setZeroOpacityShortcut,
    settings.toggleModeShortcut,
    settings.toggleShapesShortcut,
    settings.toggleDialogShortcut,
    getKeyTriggerTabIdsForProfile,
    getTabIdsForAction,
    shapes,
    dispatchKeyboardEventToCanvas,
    selectSingleShape,
    undoShapeChanges,
    redoShapeChanges,
    pasteCopiedShapesAt,
  ]);

  useEffect(() => {
    if (settings.editMode || !shapesVisible) {
      return;
    }

    const CLICK_COMPLETION_WINDOW_MS = 350;

    let pendingPointerPassThrough: {
      timerId: number;
      token: "left click" | "right click";
      clientX: number;
      clientY: number;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
      timestamp: number;
    } | null = null;

    const clearPendingPointerPassThrough = () => {
      if (!pendingPointerPassThrough) {
        return;
      }

      window.clearTimeout(pendingPointerPassThrough.timerId);
      pendingPointerPassThrough = null;
    };

    const dispatchPendingPointerToCanvas = () => {
      if (!pendingPointerPassThrough) {
        return;
      }

      const pending = pendingPointerPassThrough;
      pendingPointerPassThrough = null;

      for (
        let index = shapeBindingHistoryRef.current.length - 1;
        index >= 0;
        index -= 1
      ) {
        const item = shapeBindingHistoryRef.current[index];
        if (
          item.token === pending.token &&
          Math.abs(item.timestamp - pending.timestamp) <= 1000
        ) {
          shapeBindingHistoryRef.current.splice(index, 1);
          break;
        }
      }

      const overlayRoot = document.getElementById(ROOT_ID);
      const previousOverlayPointerEvents = overlayRoot?.style.pointerEvents;

      if (overlayRoot) {
        overlayRoot.style.pointerEvents = "none";
      }

      const hit = document.elementFromPoint(
        pending.clientX,
        pending.clientY,
      ) as HTMLElement | null;

      if (overlayRoot) {
        overlayRoot.style.pointerEvents = previousOverlayPointerEvents ?? "";
      }

      const target =
        (hit && !hit.closest(`#${ROOT_ID}`) ? hit : null) ??
        (document.querySelector("canvas") as HTMLElement | null);

      if (!target) {
        return;
      }

      const isRightClick = pending.token === "right click";
      const button = isRightClick ? 2 : 0;
      const commonEventInit: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: pending.clientX,
        clientY: pending.clientY,
        button,
        ctrlKey: pending.ctrlKey,
        altKey: pending.altKey,
        shiftKey: pending.shiftKey,
        metaKey: pending.metaKey,
      };

      ["pointerdown", "mousedown", "mouseup"].forEach((eventName) => {
        target.dispatchEvent(new MouseEvent(eventName, commonEventInit));
      });

      target.dispatchEvent(
        new MouseEvent(isRightClick ? "contextmenu" : "click", commonEventInit),
      );
    };

    const hasPointerBinding = (
      token:
        | "left click"
        | "right click"
        | "double left click"
        | "double right click",
      action: {
        ctrlKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
      },
    ) => {
      return shapes.some((shape) => {
        if (
          !shape.keyBinding ||
          getReservedShapeShortcutUsage(shape.keyBinding, settings)
        ) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);

        const modifiers = {
          ctrl:
            bindingParts.includes("ctrl") || bindingParts.includes("control"),
          alt: bindingParts.includes("alt"),
          shift: bindingParts.includes("shift"),
          meta:
            bindingParts.includes("meta") ||
            bindingParts.includes("cmd") ||
            bindingParts.includes("command"),
        };

        const steps = bindingParts.filter(
          (part) =>
            ![
              "ctrl",
              "control",
              "alt",
              "shift",
              "meta",
              "cmd",
              "command",
            ].includes(part),
        );

        return (
          steps.length === 1 &&
          steps[0] === token &&
          action.ctrlKey === modifiers.ctrl &&
          action.altKey === modifiers.alt &&
          action.shiftKey === modifiers.shift &&
          action.metaKey === modifiers.meta
        );
      });
    };

    const triggerShapesFromAction = (
      token: string,
      event: {
        clientX?: number;
        clientY?: number;
        ctrlKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
        deltaY?: number;
        cancelable?: boolean;
        preventDefault: () => void;
        stopPropagation: () => void;
      },
    ) => {
      const pointerToken = token.toLowerCase();
      const shouldDelaySingleClickPassThrough =
        (pointerToken === "left click" || pointerToken === "right click") &&
        hasPointerBinding(
          pointerToken === "left click"
            ? "double left click"
            : "double right click",
          {
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
          },
        ) &&
        !hasPointerBinding(
          pointerToken === "left click" ? "left click" : "right click",
          {
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
          },
        );

      recordBindingAction(shapeBindingHistoryRef.current, token);

      if (shouldDelaySingleClickPassThrough) {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();

        if (
          !pendingPointerPassThrough &&
          typeof event.clientX === "number" &&
          typeof event.clientY === "number"
        ) {
          const timestamp = Date.now();
          pendingPointerPassThrough = {
            timerId: window.setTimeout(() => {
              dispatchPendingPointerToCanvas();
            }, CLICK_COMPLETION_WINDOW_MS),
            token: pointerToken === "left click" ? "left click" : "right click",
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            timestamp,
          };
        }

        return;
      }

      const hitAreas = shapes.filter(
        (shape) =>
          shape.keyBinding &&
          !getReservedShapeShortcutUsage(shape.keyBinding, settings) &&
          matchesBindingAction(
            shape.keyBinding,
            {
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
            },
            shapeBindingHistoryRef.current,
          ),
      );

      if (hitAreas.length === 0) {
        return;
      }

      clearPendingPointerPassThrough();

      const isWheelEvent = typeof event.deltaY === "number";
      if (!isWheelEvent && event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      hitAreas.forEach((shape) => {
        triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
      });
    };

    const onMouseDown = (event: MouseEvent) => {
      const targetTag = (event.target as HTMLElement | null)?.tagName;
      if (targetTag === "INPUT" || targetTag === "TEXTAREA") {
        return;
      }

      if (shouldIgnoreTriggeredPointerEvent(event.clientX, event.clientY)) {
        return;
      }

      if (event.button === 0) {
        if (shapesVisible) {
          triggerShapesFromAction("left click", event);
          return;
        }

        const hitShape = [...shapes]
          .reverse()
          .find((shape) =>
            isPointInsideShape(shape, event.clientX, event.clientY),
          );

        if (hitShape) {
          event.preventDefault();
          event.stopPropagation();
          clearPendingPointerPassThrough();
          triggerShapeArea(
            hitShape,
            {
              x: event.clientX,
              y: event.clientY,
            },
            { delayMs: 0 },
          );
          return;
        }

        triggerShapesFromAction("left click", event);
      }
    };

    const onDblClick = (event: MouseEvent) => {
      triggerShapesFromAction("double left click", event);
    };

    const onContextMenu = (event: MouseEvent) => {
      const now = Date.now();
      const isDoubleRightClick = now - rightClickTrackerRef.current < 360;
      rightClickTrackerRef.current = now;

      triggerShapesFromAction(
        isDoubleRightClick ? "double right click" : "right click",
        event,
      );
    };

    const onWheel = (event: WheelEvent) => {
      const token = event.deltaY < 0 ? "wheel up" : "wheel down";
      triggerShapesFromAction(token, event);
    };

    window.addEventListener("mousedown", onMouseDown, { capture: true });
    window.addEventListener("dblclick", onDblClick, { capture: true });
    window.addEventListener("contextmenu", onContextMenu, { capture: true });
    window.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      clearPendingPointerPassThrough();
      window.removeEventListener("mousedown", onMouseDown, { capture: true });
      window.removeEventListener("dblclick", onDblClick, { capture: true });
      window.removeEventListener("contextmenu", onContextMenu, {
        capture: true,
      });
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [settings.editMode, shapes, shapesVisible]);

  const captureGlobalShortcut = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    field: GlobalShortcutField,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      (event.target as HTMLInputElement).blur();
      return;
    }

    const captured = buildShortcutFromEvent(event);
    if (!captured) return;

    const conflictUsage = getGlobalShortcutConflict(captured, settings, field);
    if (conflictUsage) {
      setGlobalShortcutErrors((prev) => ({
        ...prev,
        [field]: `Shortcut is already used by: ${conflictUsage}`,
      }));
      return;
    }

    setGlobalShortcutErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }

      const next = { ...prev };
      delete next[field];
      return next;
    });

    setSettings((prev) => ({
      ...prev,
      [field]: captured,
    }));
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const activeId = rotateIdRef.current;
      if (!activeId) return;

      if (!rotateStartShapesRef.current) {
        rotateStartShapesRef.current = cloneShapesSnapshot(
          latestShapesRef.current,
        );
      }

      setShapesWithoutHistory((prev) =>
        prev.map((shape) => {
          if (shape.id !== activeId) return shape;
          const cx = shape.x + shape.width / 2;
          const cy = shape.y + shape.height / 2;
          const rad = Math.atan2(event.clientY - cy, event.clientX - cx);
          const rawRotation = (rad * 180) / Math.PI + 90;
          const rotation = event.shiftKey
            ? Math.round(rawRotation / 15) * 15
            : rawRotation;
          return { ...shape, rotation };
        }),
      );
    };

    const onUp = () => {
      if (!rotateIdRef.current) {
        return;
      }

      rotateIdRef.current = null;
      setIsTransformingShape(false);
      document.body.style.cursor = previousBodyCursorRef.current ?? "";
      previousBodyCursorRef.current = null;

      if (rotateStartShapesRef.current) {
        const beforeRotate = rotateStartShapesRef.current;
        rotateStartShapesRef.current = null;
        if (!areShapesEqual(beforeRotate, latestShapesRef.current)) {
          pushShapeUndoSnapshot(beforeRotate);
          shapeRedoStackRef.current = [];
        }
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    areShapesEqual,
    cloneShapesSnapshot,
    pushShapeUndoSnapshot,
    setShapesWithoutHistory,
  ]);

  useEffect(() => {
    const canvas = document.querySelector("canvas") as HTMLElement | null;
    if (!canvas) {
      return;
    }

    if (settings.editMode && isTransformingShape) {
      if (previousCanvasPointerEventsRef.current === null) {
        previousCanvasPointerEventsRef.current = canvas.style.pointerEvents;
      }
      canvas.style.pointerEvents = "none";
      return;
    }

    if (previousCanvasPointerEventsRef.current !== null) {
      canvas.style.pointerEvents = previousCanvasPointerEventsRef.current;
      previousCanvasPointerEventsRef.current = null;
    }

    return () => {
      if (previousCanvasPointerEventsRef.current !== null) {
        canvas.style.pointerEvents = previousCanvasPointerEventsRef.current;
        previousCanvasPointerEventsRef.current = null;
      }
    };
  }, [isTransformingShape, settings.editMode]);

  useEffect(() => {
    if (!overlayVisible || !shapesVisible) {
      setRunningTooltip(null);
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const hit = [...shapes]
        .reverse()
        .find(
          (shape) =>
            shape.keyBinding &&
            isPointInsideShape(shape, event.clientX, event.clientY),
        );

      if (!hit) {
        setRunningTooltip(null);
        return;
      }

      const viewportPadding = 10;
      const edgeOffset = 8;
      const tooltipWidthEstimate = Math.min(
        260,
        Math.max(120, hit.keyBinding.length * 9 + 36),
      );
      const tooltipHeightEstimate = 32;

      const preferRightX = hit.x + hit.width + edgeOffset;
      const rawX = preferRightX;
      const rawY =
        hit.y + hit.height / 2 - tooltipHeightEstimate / 2 + edgeOffset;

      const x = Math.max(
        viewportPadding,
        Math.min(
          rawX,
          window.innerWidth - tooltipWidthEstimate - viewportPadding,
        ),
      );
      const y = Math.max(
        viewportPadding,
        Math.min(
          rawY,
          window.innerHeight - tooltipHeightEstimate - viewportPadding,
        ),
      );

      setRunningTooltip({
        x,
        y,
        keyBinding: hit.keyBinding,
      });
    };

    const onMouseLeaveWindow = () => {
      setRunningTooltip(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseout", onMouseLeaveWindow);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeaveWindow);
    };
  }, [overlayVisible, shapes, shapesVisible]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      const active = document.activeElement as HTMLElement | null;
      const activeIsShapeShortcutInput =
        active?.classList.contains("fm-shape-shortcut-input") ?? false;
      const clickedShortcutInput =
        target?.closest(".fm-shape-shortcut-input") ?? null;

      if (activeIsShapeShortcutInput && !clickedShortcutInput) {
        active?.blur();
      }

      if (
        settings.editMode &&
        selectedIds.length > 0 &&
        event.button === 0 &&
        !target?.closest(".fm-shape") &&
        !target?.closest(".fm-shape-context-menu")
      ) {
        selectSingleShape(null);
      }

      if (target?.closest("canvas") && event.button === 0) {
        focusGameCanvas();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, [
    focusGameCanvas,
    selectSingleShape,
    selectedIds.length,
    settings.editMode,
  ]);

  const makeDraftedShape = useCallback(
    (
      shapeType: ShapeType = "rectangle",
      point?: { x: number; y: number },
    ): ShapeMapping => {
      const base = createShape(shapeType);

      if (!point) {
        return normalizeShape({
          ...base,
          opacity: draftShape.opacity,
        });
      }

      return normalizeShape({
        ...base,
        x: point.x - base.width / 2,
        y: point.y - base.height / 2,
        opacity: draftShape.opacity,
      });
    },
    [draftShape.opacity],
  );

  const addKeyMapOfType = useCallback(
    (shapeType: ShapeType, point?: { x: number; y: number }) => {
      const newShape = makeDraftedShape(shapeType, point);
      setShapes((prev) => [...prev, newShape]);
      selectSingleShape(newShape.id);
    },
    [makeDraftedShape, selectSingleShape],
  );

  const addKeyMap = useCallback(() => {
    addKeyMapOfType(selectedPaletteShape);
  }, [addKeyMapOfType, selectedPaletteShape]);

  const openProfileNameDialog = (
    mode: "create" | "rename" | "import",
    initialName: string,
  ) => {
    setProfileNameDialogMode(mode);
    setProfileNameInput(initialName);
    setProfileNameError("");
    setProfileNameDialogOpen(true);
  };

  const closeProfileNameDialog = () => {
    setProfileNameDialogOpen(false);
    setProfileNameError("");
  };

  const validateProfileName = (
    rawName: string,
    excludeProfileId?: string,
  ): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) {
      return "Profile name is required.";
    }

    const hasConflict = profiles.some(
      (profile) =>
        profile.id !== excludeProfileId &&
        profile.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (hasConflict) {
      return "Profile name already exists. Please choose a unique name.";
    }

    return null;
  };

  const switchProfileImmediately = (nextProfileId: string) => {
    stopAllToggleShapeAreas();
    isSwitchingProfileRef.current = true;
    setActiveProfileId(nextProfileId);
    setSelectedProfileId(nextProfileId);
  };

  const requestProfileSwitch = (nextProfileId: string) => {
    if (nextProfileId === activeProfileId) {
      return;
    }

    switchProfileImmediately(nextProfileId);
  };

  const attemptCloseDialog = () => {
    setDialogVisible(false);
  };

  function deleteShapeIds(ids: string[]) {
    const targetIds = Array.from(new Set(ids));
    if (targetIds.length === 0) {
      return;
    }

    targetIds.forEach((id) => stopToggleShapeArea(id));

    setShapes((prev) => {
      return prev.filter((shape) => !targetIds.includes(shape.id));
    });

    setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    setSelectedId((prev) => (prev && targetIds.includes(prev) ? null : prev));
  }

  const removeShape = (id: string) => {
    deleteShapeIds([id]);
  };

  function undoShapeChanges() {
    const previous = shapeUndoStackRef.current.pop();
    if (!previous) {
      return;
    }

    shapeRedoStackRef.current.push(
      cloneShapesSnapshot(latestShapesRef.current),
    );
    if (shapeRedoStackRef.current.length > MAX_SHAPE_HISTORY_ENTRIES) {
      shapeRedoStackRef.current.shift();
    }

    setShapesWithoutHistory(previous);
    const previousIds = new Set(previous.map((shape) => shape.id));
    setSelectedIds((prev) => prev.filter((id) => previousIds.has(id)));
    setSelectedId((prev) => (prev && previousIds.has(prev) ? prev : null));
  }

  function redoShapeChanges() {
    const next = shapeRedoStackRef.current.pop();
    if (!next) {
      return;
    }

    pushShapeUndoSnapshot(latestShapesRef.current);
    setShapesWithoutHistory(next);
    const nextIds = new Set(next.map((shape) => shape.id));
    setSelectedIds((prev) => prev.filter((id) => nextIds.has(id)));
    setSelectedId((prev) => (prev && nextIds.has(prev) ? prev : null));
  }

  function copyShapeIds(ids: string[]) {
    if (ids.length === 0) {
      return;
    }

    const idSet = new Set(ids);
    const clipboardShapes = shapes.filter((shape) => idSet.has(shape.id));
    setCopiedShapes(clipboardShapes);
  }

  function cutShapeIds(ids: string[]) {
    if (ids.length === 0) {
      return;
    }

    copyShapeIds(ids);
    deleteShapeIds(ids);
  }

  function pasteCopiedShapesAt(point?: { x: number; y: number }) {
    if (copiedShapes.length === 0) {
      return false;
    }

    let duplicatedShapes = duplicateClipboardShapes(
      copiedShapes,
      () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    if (point) {
      const anchor = duplicatedShapes[0];
      if (anchor) {
        const deltaX = point.x - anchor.x;
        const deltaY = point.y - anchor.y;
        duplicatedShapes = duplicatedShapes.map((shape) => ({
          ...shape,
          x: shape.x + deltaX,
          y: shape.y + deltaY,
        }));
      }
    }

    const normalizedShapes = duplicatedShapes.map((shape) =>
      normalizeShape(shape),
    );
    setShapes((prev) => [...prev, ...normalizedShapes]);

    const duplicatedIds = normalizedShapes.map((shape) => shape.id);
    setSelectedIds(duplicatedIds);
    setSelectedId(duplicatedIds[duplicatedIds.length - 1] ?? null);
    return true;
  }

  const resetDialogConfiguration = useCallback(() => {
    modal.confirm({
      className: "fm-confirm-modal fm-reset-config-modal",
      title: "Reset mapper configuration?",
      content:
        "This resets all Settings values and Key Mapper tab configuration to defaults while keeping Key Mapper and Key Trigger profiles unchanged.",
      zIndex: 2147483647,
      okText: "Reset",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        const resetSettings = cloneDefaultSettings();

        setSettings(resetSettings);
        latestSettingsRef.current = resetSettings;
        storage.saveSettings(resetSettings);

        setProfiles((prev) =>
          prev.map((profile) => ({
            ...profile,
            settings: cloneDefaultSettings(),
          })),
        );

        setDialogRect({ ...DEFAULT_DIALOG_RECT });
        setActiveUtilityTab("key-mapper");
        setSelectedPaletteShape("rectangle");
        setDraftShape((prev) => ({ ...prev, opacity: 1 }));
      },
    });
  }, [modal]);

  const createProfile = (name?: string) => {
    const nextName =
      (name ?? "").trim() ||
      makeUniqueProfileName(latestProfilesRef.current, "Profile");
    const validationError = validateProfileName(nextName);
    if (validationError) {
      setProfileNameError(validationError);
      return false;
    }

    const profile: MappingProfile = {
      id: createProfileId(),
      name: nextName,
      shapes: [],
      settings: activeProfile?.settings ?? latestSettingsRef.current,
    };

    setProfiles((prev) => [...prev, profile]);
    requestProfileSwitch(profile.id);
    return true;
  };

  const duplicateSelectedProfile = () => {
    if (!selectedProfile) {
      return;
    }

    const duplicated: MappingProfile = {
      id: createProfileId(),
      name: buildDuplicateProfileName(
        latestProfilesRef.current,
        selectedProfile.name,
      ),
      shapes: selectedProfile.shapes.map((shape) => ({ ...shape })),
      settings: { ...selectedProfile.settings },
    };

    setProfiles((prev) => {
      const selectedIndex = prev.findIndex(
        (profile) => profile.id === selectedProfile.id,
      );
      if (selectedIndex < 0) {
        return [...prev, duplicated];
      }

      const nextProfiles = [...prev];
      nextProfiles.splice(selectedIndex + 1, 0, duplicated);
      return nextProfiles;
    });
    setSelectedProfileId(duplicated.id);
    requestProfileSwitch(duplicated.id);
  };

  const renameSelectedProfile = (nextName: string) => {
    if (!selectedProfile) {
      return false;
    }

    const validationError = validateProfileName(nextName, selectedProfile.id);
    if (validationError) {
      setProfileNameError(validationError);
      return false;
    }

    const trimmed = nextName.trim();
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === selectedProfile.id
          ? {
              ...profile,
              name: trimmed,
            }
          : profile,
      ),
    );

    if (selectedProfile.id === activeProfileId) {
      setActiveProfileName(trimmed);
    }

    return true;
  };

  const deleteSelectedProfile = () => {
    if (!selectedProfile) {
      return;
    }

    const sourceProfiles = latestProfilesRef.current;
    const removeId = selectedProfile.id;
    const removeIndex = sourceProfiles.findIndex(
      (profile) => profile.id === removeId,
    );
    const remainingProfiles = sourceProfiles.filter(
      (profile) => profile.id !== removeId,
    );

    if (remainingProfiles.length === 0) {
      setProfiles([]);
      setSelectedProfileId("");
      setActiveProfileId("");
      setActiveProfileName("");
      setShapesWithoutHistory([]);
      resetShapeHistory();
      selectSingleShape(null);
      setCopiedShapes([]);
      setIsTransformingShape(false);
      return;
    }

    const previousIndex = Math.max(0, removeIndex - 1);
    const replacementProfile =
      remainingProfiles[previousIndex] ?? remainingProfiles[0] ?? null;
    if (!replacementProfile) {
      return;
    }

    setProfiles(remainingProfiles);
    setSelectedProfileId(replacementProfile.id);

    if (removeId === activeProfileId) {
      switchProfileImmediately(replacementProfile.id);
    }
  };

  const exportMappings = async () => {
    const payload = JSON.stringify(
      {
        profiles: latestProfilesRef.current,
        activeProfileId,
        settings: latestSettingsRef.current,
        keyTriggerProfiles,
        selectedKeyTriggerTabIds,
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(payload);
  };

  const performImportWithName = (baseProfileName: string) => {
    try {
      const parsed = JSON.parse(pendingImportText) as {
        profileName?: string;
        shapes?: ShapeMapping[];
        settings?: Partial<MapperSettings>;
        profiles?: Array<{
          name?: string;
          shapes?: ShapeMapping[];
          settings?: Partial<MapperSettings>;
        }>;
        keyTriggerProfiles?: KeyTriggerProfile[];
      };

      const resolveImportedSettings = (
        importedSettings: Partial<MapperSettings> | undefined,
        sourceLabel: string,
      ): { settings: MapperSettings; warnings: string[] } => {
        const baseSettings = latestSettingsRef.current;
        const resolved: MapperSettings = {
          ...baseSettings,
          theme: importedSettings?.theme ?? baseSettings.theme,
          editMode: importedSettings?.editMode ?? baseSettings.editMode,
          showHandles:
            importedSettings?.showHandles ?? baseSettings.showHandles,
          showSnapIndicators:
            importedSettings?.showSnapIndicators ??
            baseSettings.showSnapIndicators,
          strictPassthrough:
            importedSettings?.strictPassthrough ??
            baseSettings.strictPassthrough,
          addKeyMapShortcut: baseSettings.addKeyMapShortcut,
          toggleModeShortcut: baseSettings.toggleModeShortcut,
          focusCanvasShortcut: baseSettings.focusCanvasShortcut,
          toggleShapesShortcut: baseSettings.toggleShapesShortcut,
          setZeroOpacityShortcut: baseSettings.setZeroOpacityShortcut,
        };

        const warnings: string[] = [];

        GLOBAL_SHORTCUT_FIELDS.forEach((field) => {
          const importedBinding = importedSettings?.[field];
          if (typeof importedBinding !== "string") {
            return;
          }

          const candidate = importedBinding.trim();
          if (!candidate) {
            return;
          }

          const conflict = getGlobalShortcutConflict(
            candidate,
            resolved,
            field,
          );
          if (conflict) {
            warnings.push(
              `${sourceLabel}: ${GLOBAL_SHORTCUT_LABELS[field]} (${candidate}) conflicts with ${conflict}. Kept existing ${GLOBAL_SHORTCUT_LABELS[field]} shortcut.`,
            );
            return;
          }

          resolved[field] = candidate;
        });

        return {
          settings: resolved,
          warnings,
        };
      };

      const importWarnings: string[] = [];

      const baseSettingsResolution = resolveImportedSettings(
        parsed.settings,
        "Import payload",
      );
      importWarnings.push(...baseSettingsResolution.warnings);

      const baseImportedSettings = baseSettingsResolution.settings;

      const importedProfiles: MappingProfile[] = [];

      if (Array.isArray(parsed.profiles)) {
        parsed.profiles.forEach((profile, index) => {
          if (!Array.isArray(profile.shapes)) {
            return;
          }

          const desiredName =
            typeof profile.name === "string" && profile.name.trim().length > 0
              ? profile.name.trim()
              : parsed.profiles && parsed.profiles.length > 1
                ? `${baseProfileName.trim()} ${index + 1}`
                : baseProfileName.trim();

          const uniqueName = makeUniqueProfileName(
            [...latestProfilesRef.current, ...importedProfiles],
            desiredName,
          );

          const profileSettingsResolution = resolveImportedSettings(
            profile.settings,
            `Profile \"${uniqueName}\"`,
          );
          importWarnings.push(...profileSettingsResolution.warnings);

          importedProfiles.push({
            id: createProfileId(),
            name: uniqueName,
            shapes: profile.shapes.map(normalizeShape),
            settings: profileSettingsResolution.settings,
          });
        });
      }

      if (Array.isArray(parsed.shapes)) {
        const desiredName =
          typeof parsed.profileName === "string" &&
          parsed.profileName.trim().length > 0
            ? parsed.profileName.trim()
            : baseProfileName.trim();

        const uniqueName = makeUniqueProfileName(
          [...latestProfilesRef.current, ...importedProfiles],
          desiredName,
        );

        importedProfiles.push({
          id: createProfileId(),
          name: uniqueName,
          shapes: parsed.shapes.map(normalizeShape),
          settings: baseImportedSettings,
        });
      }

      if (importedProfiles.length === 0) {
        // No key-mapper profiles; still allow import if we have key trigger profiles below
      } else {
        const nextProfiles = [
          ...latestProfilesRef.current,
          ...importedProfiles,
        ];
        const nextActive = importedProfiles[importedProfiles.length - 1];

        setProfiles(nextProfiles);
        setSelectedProfileId(nextActive.id);
        requestProfileSwitch(nextActive.id);

        selectSingleShape(null);
        setCopiedShapes([]);
        setIsTransformingShape(false);
      }

      if (
        Array.isArray(parsed.keyTriggerProfiles) &&
        parsed.keyTriggerProfiles.length > 0
      ) {
        const incomingKtProfiles = (
          parsed.keyTriggerProfiles as KeyTriggerProfile[]
        ).map((profile) => ({
          ...profile,
          enabled: profile.enabled !== false,
        }));
        setKeyTriggerProfiles((prev) => [...prev, ...incomingKtProfiles]);
      }

      if (
        importedProfiles.length === 0 &&
        !(
          Array.isArray(parsed.keyTriggerProfiles) &&
          parsed.keyTriggerProfiles.length > 0
        )
      ) {
        Modal.error({
          title: "Invalid import payload",
          content:
            "Please provide a valid JSON mapping export with shapes or profiles.",
        });
        return;
      }

      setPendingImportText("");
      setImportText("");
      setImportOpen(false);
      closeProfileNameDialog();

      if (importWarnings.length > 0) {
        Modal.warning({
          title: "Some imported shortcuts were skipped",
          content: importWarnings.join(" "),
        });
      }
    } catch {
      Modal.error({
        title: "Invalid import payload",
        content: "Please provide a valid JSON mapping export.",
      });
    }
  };

  const handleProfileNameDialogSave = () => {
    const trimmed = profileNameInput.trim();
    if (!trimmed) {
      setProfileNameError("Profile name is required.");
      return;
    }

    if (profileNameDialogMode === "create") {
      const ok = createProfile(trimmed);
      if (!ok) {
        return;
      }
      closeProfileNameDialog();
      return;
    }

    if (profileNameDialogMode === "rename") {
      const ok = renameSelectedProfile(trimmed);
      if (!ok) return;
      closeProfileNameDialog();
      return;
    }

    performImportWithName(trimmed);
  };

  const applyImport = () => {
    if (!canImportNow) {
      Modal.error({
        title: "Cannot import mappings",
        content:
          importAnalysis.parseError ||
          "Please provide a valid JSON mapping export with shapes.",
      });
      return;
    }

    let suggestedName = "Imported";
    let hasKeyMapperProfiles = false;
    try {
      const parsed = JSON.parse(importText) as {
        profileName?: string;
        profiles?: Array<{ name?: string; shapes?: ShapeMapping[] }>;
        shapes?: ShapeMapping[];
      };

      hasKeyMapperProfiles =
        (Array.isArray(parsed.profiles) &&
          parsed.profiles.some((p) => Array.isArray(p.shapes))) ||
        Array.isArray(parsed.shapes);

      if (hasKeyMapperProfiles) {
        suggestedName =
          parsed.profileName?.trim() ||
          parsed.profiles?.[0]?.name?.trim() ||
          "Imported";
      }
    } catch {
      suggestedName = "Imported";
    }

    setPendingImportText(importText);

    if (!hasKeyMapperProfiles) {
      performImportWithName("Imported");
      return;
    }

    openProfileNameDialog("import", suggestedName);
  };

  const handleThemeChange = (value: string | number) => {
    setSettings((prev) => ({ ...prev, theme: value as ThemeMode }));
  };

  const algorithm =
    appliedTheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;

  useEffect(() => {
    const bodyClass = "fm-dark-theme";
    if (appliedTheme === "dark") {
      document.body.classList.add(bodyClass);
      return () => {
        document.body.classList.remove(bodyClass);
      };
    }

    document.body.classList.remove(bodyClass);
  }, [appliedTheme]);

  return (
    <ConfigProvider theme={{ algorithm }}>
      <App>
        {modalContextHolder}
        <div
          className={`fm-relative fm-size-full ${appliedTheme === "dark" ? "fm-dark" : ""}`}
        >
          <ShapeOverlay
            overlayVisible={overlayVisible}
            shapesVisible={shapesVisible}
            shapes={shapes}
            settings={settings}
            hasClipboardShapes={copiedShapes.length > 0}
            selectedIds={selectedIds}
            selectSingleShape={selectSingleShape}
            toggleShapeSelection={toggleShapeSelection}
            runningTooltip={runningTooltip}
            setIsTransformingShape={setIsTransformingShape}
            setShapes={setShapes}
            setShapesWithoutHistory={setShapesWithoutHistory}
            removeShape={removeShape}
            deleteShapeIds={deleteShapeIds}
            copyShapeIds={copyShapeIds}
            cutShapeIds={cutShapeIds}
            pasteCopiedShapesAt={pasteCopiedShapesAt}
            rotateIdRef={rotateIdRef}
            previousBodyCursorRef={previousBodyCursorRef}
            buildShortcutFromEvent={buildShortcutFromEvent}
            normalizeShape={normalizeShape}
          />

          <MapperDialog
            overlayVisible={overlayVisible}
            dialogVisible={dialogVisible}
            isTransformingShape={isTransformingShape}
            dialogRect={dialogRect}
            setDialogRect={setDialogRect}
            activeProfileName={activeProfileName}
            focusGameCanvas={focusGameCanvas}
            onResetDialogConfiguration={resetDialogConfiguration}
            settings={settings}
            toggleMode={toggleMode}
            addKeyMap={addKeyMap}
            profiles={profiles}
            selectedProfile={selectedProfile}
            onSelectProfileChange={(value) => {
              requestProfileSwitch(value);
            }}
            onOpenCreateProfile={() =>
              openProfileNameDialog(
                "create",
                makeUniqueProfileName(latestProfilesRef.current, "Profile"),
              )
            }
            duplicateSelectedProfile={duplicateSelectedProfile}
            onOpenRenameProfile={() => {
              if (!selectedProfile) return;
              openProfileNameDialog("rename", selectedProfile.name);
            }}
            deleteSelectedProfile={deleteSelectedProfile}
            activeUtilityTab={activeUtilityTab}
            onActiveUtilityTabChange={setActiveUtilityTab}
            selectedPaletteShape={selectedPaletteShape}
            setSelectedPaletteShape={setSelectedPaletteShape}
            handleThemeChange={handleThemeChange}
            draftShape={draftShape}
            setDraftShape={setDraftShape}
            setShapes={setShapes}
            normalizeShape={normalizeShape}
            setSettings={setSettings}
            exportMappings={exportMappings}
            setImportOpen={setImportOpen}
            captureGlobalShortcut={captureGlobalShortcut}
            globalShortcutErrors={globalShortcutErrors}
            keyTriggerProfiles={keyTriggerProfiles}
            onKeyTriggerProfilesChange={setKeyTriggerProfiles}
            keyTriggerCharacters={keyTriggerCharacters}
            selectedKeyTriggerTabIds={selectedKeyTriggerTabIds}
            onSelectedKeyTriggerTabIdsChange={setSelectedKeyTriggerTabIds}
            keyTriggerSelectedProfileId={
              keyTriggerCurrentCharacterSelectedProfileId
            }
            onKeyTriggerSelectedProfileIdChange={
              handleKeyTriggerSelectedProfileIdChange
            }
            reloadKeyTriggerCharacters={syncReloadKeyTriggerCharacters}
            autoStopCountdown={autoStopCountdown}
            automationRegionCaptureTarget={automationRegionCaptureTarget}
            onStartAutomationRegionCapture={startAutomationRegionCapture}
            onCancelAutomationRegionCapture={cancelAutomationRegionCapture}
            onClearAutomationRegionCapture={clearAutomationRegionCapture}
            autoAwakenRunning={autoAwakenRunning}
            autoAwakenStatus={autoAwakenStatus}
            autoAwakenLogs={autoAwakenLogs}
            onStartAutoAwaken={startAutoAwakenLoop}
            onStopAutoAwaken={stopAutoAwakenLoop}
          />

          {automationRegionCaptureTarget && (
            <div
              className="fm-automation-snipper"
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }

                const nextRect = {
                  x: event.clientX,
                  y: event.clientY,
                  width: 0,
                  height: 0,
                };
                automationRegionCaptureStartRef.current = {
                  x: event.clientX,
                  y: event.clientY,
                  pointerId: event.pointerId,
                };
                setAutomationRegionCaptureRect(nextRect);
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
              onPointerMove={(event) => {
                const start = automationRegionCaptureStartRef.current;
                if (!start || start.pointerId !== event.pointerId) {
                  return;
                }

                setAutomationRegionCaptureRect(
                  buildViewportSelectionRect(
                    start.x,
                    start.y,
                    event.clientX,
                    event.clientY,
                  ),
                );
              }}
              onPointerUp={(event) => {
                const start = automationRegionCaptureStartRef.current;
                if (!start || start.pointerId !== event.pointerId) {
                  return;
                }

                const nextRect = buildViewportSelectionRect(
                  start.x,
                  start.y,
                  event.clientX,
                  event.clientY,
                );
                automationRegionCaptureStartRef.current = null;

                if (
                  nextRect.width < MIN_AUTOMATION_CAPTURE_REGION_SIZE_PX ||
                  nextRect.height < MIN_AUTOMATION_CAPTURE_REGION_SIZE_PX
                ) {
                  setAutomationRegionCaptureRect(null);
                  return;
                }

                const normalizedRegion = viewportRectToNormalizedRect(
                  nextRect,
                  window.innerWidth,
                  window.innerHeight,
                );
                if (!normalizedRegion) {
                  setAutomationRegionCaptureRect(null);
                  return;
                }

                setSettings((prev) =>
                  automationRegionCaptureTarget === "autoHoly"
                    ? {
                        ...prev,
                        autoHoly: {
                          ...prev.autoHoly,
                          scanRegion: normalizedRegion,
                        },
                      }
                    : automationRegionCaptureTarget === "autoPills"
                      ? {
                          ...prev,
                          autoPills: {
                            ...prev.autoPills,
                            scanRegion: normalizedRegion,
                          },
                        }
                      : {
                          ...prev,
                          autoAwaken: {
                            ...prev.autoAwaken,
                            scanRegion: normalizedRegion,
                          },
                        },
                );
                setAutomationRegionCaptureRect(null);
                setAutomationRegionCaptureTarget(null);
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                automationRegionCaptureStartRef.current = null;
                setAutomationRegionCaptureRect(null);
              }}
            >
              <div className="fm-automation-snipper-card">
                <div className="fm-automation-snipper-title">
                  {automationRegionCaptureTarget === "autoHoly"
                    ? "Capture Auto-Holy Buff Area"
                    : automationRegionCaptureTarget === "autoPills"
                      ? "Capture Auto-Pills HP Area"
                      : "Capture Blessing Window Area"}
                </div>
                <div className="fm-automation-snipper-copy">
                  Drag a rectangle over the in-game reference area. Press Escape
                  to cancel.
                </div>
              </div>
              {automationRegionCaptureRect && (
                <div
                  className="fm-automation-snipper-selection"
                  style={{
                    left: automationRegionCaptureRect.x,
                    top: automationRegionCaptureRect.y,
                    width: automationRegionCaptureRect.width,
                    height: automationRegionCaptureRect.height,
                  }}
                />
              )}
            </div>
          )}

          {settings.autoHoly.enabled &&
            settings.autoHoly.debugOverlayEnabled &&
            autoHolyDebugInfo && (
              <Rnd
                className="fm-auto-debug-dialog fm-z-[2147483645]"
                size={{ width: 270, height: "auto" }}
                position={autoHolyDebugPanelPos}
                dragHandleClassName="ant-card-head"
                bounds="window"
                enableResizing={false}
                onDragStop={(_event, data) => {
                  setAutoHolyDebugPanelPos({ x: data.x, y: data.y });
                }}
              >
                <Card
                  title="Auto-Holy Debug"
                  size="small"
                  className="fm-panel fm-auto-debug-card"
                  bodyStyle={{ padding: "8px 10px" }}
                >
                  <div className="fm-auto-debug-overlay" aria-live="polite">
                    <div
                      className={`fm-auto-pills-debug-status fm-auto-pills-debug-status-${autoHolyDebugInfo.hasDebuff ? "trigger" : "safe"}`}
                    >
                      {autoHolyDebugInfo.hasDebuff ? "DETECTED" : "CLEAR"}
                    </div>
                    <div>
                      Type: {autoHolyDebugInfo.detectedType.toUpperCase()} |
                      Mode: {autoHolyDebugInfo.mode.toUpperCase()}
                    </div>
                    <div>
                      Region: {autoHolyDebugInfo.regionSource.toUpperCase()}
                    </div>
                    <div>
                      Consecutive: {autoHolyDebugInfo.consecutiveDetections}/
                      {autoHolyDebugInfo.requiredConsecutive}
                    </div>
                    <div>
                      Triggered: {autoHolyDebugInfo.triggered ? "YES" : "NO"}
                    </div>
                  </div>
                </Card>
              </Rnd>
            )}

          {settings.autoPills.enabled &&
            settings.autoPills.debugOverlayEnabled &&
            autoPillsDebugInfo && (
              <Rnd
                className="fm-auto-debug-dialog fm-z-[2147483645]"
                size={{ width: 290, height: "auto" }}
                position={autoPillsDebugPanelPos}
                dragHandleClassName="ant-card-head"
                onDragStop={(_event, data) => {
                  setAutoPillsDebugPanelPos({ x: data.x, y: data.y });
                }}
                bounds="window"
                enableResizing={false}
              >
                <Card
                  title="Auto-Pills Debug"
                  size="small"
                  className="fm-panel fm-auto-debug-card"
                  bodyStyle={{ padding: "8px 10px" }}
                >
                  <div className="fm-auto-debug-overlay" aria-live="polite">
                    <div
                      className={`fm-auto-pills-debug-status fm-auto-pills-debug-status-${autoPillsDebugInfo.triggerState}`}
                    >
                      {autoPillsDebugInfo.triggerState === "trigger"
                        ? "TRIGGER"
                        : autoPillsDebugInfo.triggerState === "safe"
                          ? "SAFE"
                          : "UNKNOWN"}
                    </div>
                    <div>
                      HP: {autoPillsDebugInfo.hpPercent ?? "N/A"}% / Threshold:{" "}
                      {autoPillsDebugInfo.threshold}%
                    </div>
                    <div>
                      Source: {autoPillsDebugInfo.hpSource.toUpperCase()}
                    </div>
                    <div>
                      Mode: {autoPillsDebugInfo.displayMode.toUpperCase()}
                    </div>
                    <div>
                      Mode source: {autoPillsDebugInfo.modeSource.toUpperCase()}
                    </div>
                    <div>Decision: {autoPillsDebugInfo.decisionPath}</div>
                    <div>
                      Color: {autoPillsDebugInfo.colorEstimatedHp ?? "N/A"}% |
                      OCR: {autoPillsDebugInfo.ocrEstimatedHp ?? "N/A"}% |
                      Template:{" "}
                      {autoPillsDebugInfo.templateEstimatedHp ?? "N/A"}%
                    </div>
                    <div>
                      OCR mode/conf: {autoPillsDebugInfo.ocrMode ?? "N/A"} /{" "}
                      {autoPillsDebugInfo.ocrConfidence ?? "N/A"}
                    </div>
                    <div>
                      OCR text: {autoPillsDebugInfo.ocrRawText ?? "N/A"}
                    </div>
                    <div>
                      Row: {autoPillsDebugInfo.rowY ?? "N/A"} / h={" "}
                      {autoPillsDebugInfo.rowHeight ?? "N/A"}
                    </div>
                    <div>
                      Fill/Track: {autoPillsDebugInfo.filledWidth ?? "N/A"} /{" "}
                      {autoPillsDebugInfo.trackWidth ?? "N/A"} (x:
                      {autoPillsDebugInfo.trackStartX ?? "N/A"}-
                      {autoPillsDebugInfo.trackEndX ?? "N/A"})
                    </div>
                    <div>
                      Text-gap bridge: {autoPillsDebugInfo.bridgedGapCount} /
                      max {autoPillsDebugInfo.largestBridgedGap}px
                    </div>
                  </div>
                </Card>
              </Rnd>
            )}

          <ImportMappingsModal
            overlayVisible={overlayVisible}
            importOpen={importOpen}
            isTransformingShape={isTransformingShape}
            canImportNow={canImportNow}
            importAnalysis={importAnalysis}
            importText={importText}
            setImportText={setImportText}
            applyImport={applyImport}
            onClose={() => {
              setImportOpen(false);
              setImportText("");
              setPendingImportText("");
            }}
          />

          <ProfileNameModal
            overlayVisible={overlayVisible}
            profileNameDialogOpen={profileNameDialogOpen}
            profileNameDialogMode={profileNameDialogMode}
            profileNameInput={profileNameInput}
            profileNameError={profileNameError}
            setProfileNameInput={setProfileNameInput}
            clearProfileNameError={() => setProfileNameError("")}
            onClose={closeProfileNameDialog}
            onSave={handleProfileNameDialogSave}
          />
        </div>
      </App>
    </ConfigProvider>
  );
}

const mount = () => {
  const existingRoot = document.getElementById(ROOT_ID);
  if (existingRoot) {
    existingRoot.remove();
  }

  const rootElement = document.createElement("div");
  rootElement.id = ROOT_ID;
  document.body.appendChild(rootElement);

  createRoot(rootElement).render(<MapperApp />);
};

// Global error handlers to gracefully handle extension context invalidation
window.addEventListener("error", (event) => {
  if (isExtensionContextInvalidatedError(event.error)) {
    event.preventDefault();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (isExtensionContextInvalidatedError(event.reason)) {
    event.preventDefault();
  }
});

mount();
