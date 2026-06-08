import {
  App,
  Card,
  ConfigProvider,
  Modal,
  Typography,
  message,
  theme,
} from "antd";
import "antd/dist/reset.css";
import {
  type CSSProperties,
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
import pixelmatch from "pixelmatch";
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
import { getResolvedThemePreset, isThemeMode } from "./themePresets";
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
import { DEFAULT_SETTINGS, storage } from "./storage";
import {
  deleteSubscriptionToken,
  generateSubscriptionToken,
  listSubscriptionTokens,
  revokeSubscriptionToken,
  resolveAccessControlState,
  type AccessRole,
  type AccessControlState,
  type SubscriptionPlan,
} from "./accessControl";
import "./styles.css";
import type {
  CharacterTabInfo,
  DialogRect,
  KeyTriggerAction,
  KeyTriggerProfile,
  KeyTriggerPreset,
  MappingProfile,
  MapperSettings,
  NormalizedRect,
  ShapeMapping,
  ShapeType,
  ThemeMode,
  UtilityTab,
  AwakenStatCriterion,
} from "./types";

const DEFAULT_DIALOG_RECT: DialogRect = {
  x: 40,
  y: 80,
  width: 420,
  height: 540,
};

const MAX_SHAPE_HISTORY_ENTRIES = 200;

const DEFAULT_ACCESS_CONTROL_STATE: AccessControlState = {
  loading: true,
  ipAddress: null,
  whitelisted: false,
  hasToolAccess: false,
  accessSource: "none",
  plan: "free",
  role: "user",
  canManageAccess: false,
  canManageAdmins: false,
  canGenerateTokens: false,
  tokenExpiresAtIso: null,
  features: {
    keyTrigger: false,
    autoHoly: false,
    autoPills: false,
    autoAwaken: false,
    syncMouse: false,
    experimentalFeatures: false,
  },
  reason: null,
};

type SharedRunState = {
  editMode?: unknown;
  experimentalFeaturesEnabled?: unknown;
  shapesVisible?: unknown;
  updatedAt?: unknown;
};

const loadSharedRunState = (): SharedRunState | null => {
  return storage.loadSharedRunState();
};

const AUTO_IMAGE_SCALE_WIDTH = 800;
const AUTO_AWAKEN_MATCH_MAX_WIDTH = 1200;

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
const MAPPER_CHARACTER_PROFILE_MAPPING_STORAGE_KEY =
  "flyff-mapper-character-profiles-v1";
const RECAPTCHA_SHARED_SIGNAL_KEY = "flyff-mapper-recaptcha-shared-v1";
const RECAPTCHA_DEBUG_LOG = true;
const KEY_TRIGGER_SESSION_SELECTED_TAB_IDS_KEY =
  "flyff-mapper-key-trigger-selected-tabs-session-v1";
const KEY_TRIGGER_SESSION_SELECTED_TAB_NAMES_KEY =
  "flyff-mapper-key-trigger-selected-tab-names-session-v1";

const loadSessionSelectedKeyTriggerTabIds = (): number[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(
      KEY_TRIGGER_SESSION_SELECTED_TAB_IDS_KEY,
    );
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((id): id is number => Number.isFinite(id));
  } catch {
    return [];
  }
};

const saveSessionSelectedKeyTriggerTabIds = (ids: number[]): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      KEY_TRIGGER_SESSION_SELECTED_TAB_IDS_KEY,
      JSON.stringify(ids.filter((id) => Number.isFinite(id))),
    );
  } catch {
    // Ignore session storage write failures.
  }
};

const loadSessionSelectedKeyTriggerTabNames = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(
      KEY_TRIGGER_SESSION_SELECTED_TAB_NAMES_KEY,
    );
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (name): name is string => typeof name === "string" && name.length > 0,
    );
  } catch {
    return [];
  }
};

const saveSessionSelectedKeyTriggerTabNames = (names: string[]): void => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      KEY_TRIGGER_SESSION_SELECTED_TAB_NAMES_KEY,
      JSON.stringify(
        names.filter((name) => typeof name === "string" && name.length > 0),
      ),
    );
  } catch {
    // Ignore session storage write failures.
  }
};

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
      const runtimeErrorMessage = chrome.runtime?.lastError?.message;
      if (
        runtimeErrorMessage &&
        isExtensionContextInvalidatedError(new Error(runtimeErrorMessage))
      ) {
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
  options?: {
    dedupeKey?: string;
    dedupeWindowMs?: number;
    mobilePush?: {
      enabled: boolean;
      discordBotUrl: string;
      discordUserId: string;
      discordApiKey: string;
    };
  },
): Promise<void> => {
  const mobilePushPayload = options?.mobilePush;
  const response = await safeSendRuntimeMessage<{ ok?: boolean }>({
    type: "SHOW_EXTENSION_NOTIFICATION",
    title,
    message: body,
    dedupeKey: options?.dedupeKey,
    dedupeWindowMs: options?.dedupeWindowMs,
    mobilePush: mobilePushPayload
      ? {
          enabled: mobilePushPayload.enabled,
          provider: "discord",
          discordBotUrl: mobilePushPayload.discordBotUrl,
          discordUserId: mobilePushPayload.discordUserId,
          discordApiKey: mobilePushPayload.discordApiKey,
        }
      : undefined,
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

const readSharedAutoStopState = (): SharedAutoStopState => {
  return storage.loadSharedAutoStopState();
};

const writeSharedAutoStopState = (state: SharedAutoStopState) => {
  storage.saveSharedAutoStopState(state);
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
  return storage.loadSharedRecaptchaSignal();
};

const writeSharedRecaptchaSignal = (signal: SharedRecaptchaSignal) => {
  storage.saveSharedRecaptchaSignal(signal);
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

const findTemplateLocationWithPixelmatch = (
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

  const sw = source.width;
  const sh = source.height;
  const tw = template.width;
  const th = template.height;
  const totalPixels = tw * th;
  const searchStep = totalPixels >= 7000 ? 6 : totalPixels >= 2400 ? 5 : 3;
  const candidate = new Uint8ClampedArray(totalPixels * 4);

  const toBinary = (image: RgbImageData): Uint8ClampedArray => {
    const out = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i += 1) {
      const r = image.rgb[i * 4];
      const g = image.rgb[i * 4 + 1];
      const b = image.rgb[i * 4 + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      const v = gray > 150 ? 0 : 255; // BINARY_INV like the Python flow
      out[i * 4] = v;
      out[i * 4 + 1] = v;
      out[i * 4 + 2] = v;
      out[i * 4 + 3] = 255;
    }
    return out;
  };

  const sourceBinary = toBinary(source);
  const templateBinary = toBinary(template);

  const scoreAt = (startX: number, startY: number): number => {
    for (let y = 0; y < th; y += 1) {
      const srcStart = ((startY + y) * sw + startX) * 4;
      const srcEnd = srcStart + tw * 4;
      candidate.set(sourceBinary.subarray(srcStart, srcEnd), y * tw * 4);
    }

    const mismatchCount = pixelmatch(
      templateBinary,
      candidate,
      undefined,
      tw,
      th,
      {
        threshold: 0.18,
        includeAA: false,
      },
    );

    return 1 - mismatchCount / totalPixels;
  };

  let bestScore = -1;
  let bestX = 0;
  let bestY = 0;

  for (let y = 0; y <= sh - th; y += searchStep) {
    for (let x = 0; x <= sw - tw; x += searchStep) {
      const score = scoreAt(x, y);
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
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

  if (bestScore < minScore) {
    return null;
  }

  return {
    x: Math.round(bestX + tw / 2),
    y: Math.round(bestY + th / 2),
  };
};

type AwakenButtonMatch = {
  x: number;
  y: number;
  regionLabel:
    | "start-band"
    | "full"
    | "bottom"
    | "bottom-center"
    | "lower-third"
    | "lower-third-center"
    | "footer"
    | "footer-center";
  scale: number;
  templateLabel: "button_image.png" | "button_image2.png" | null;
  detectionSource: "template" | "text";
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
    cropRgbImageData(bottomImage, {
      x: centerX,
      y: 0,
      width: centerWidth,
      height: bottomImage.height,
    }) ?? bottomImage;

  const footerY = Math.round(regionImg.height * 0.78);
  const footerImage =
    cropRgbImageData(regionImg, {
      x: 0,
      y: footerY,
      width: regionImg.width,
      height: regionImg.height - footerY,
    }) ?? bottomImage;
  const footerCenterWidth = Math.round(regionImg.width * 0.52);
  const footerCenterX = Math.round((regionImg.width - footerCenterWidth) / 2);
  const footerCenterImage =
    cropRgbImageData(footerImage, {
      x: footerCenterX,
      y: 0,
      width: footerCenterWidth,
      height: footerImage.height,
    }) ?? footerImage;

  const lowerThirdY = Math.round(regionImg.height * 0.62);
  const lowerThirdImage =
    cropRgbImageData(regionImg, {
      x: 0,
      y: lowerThirdY,
      width: regionImg.width,
      height: regionImg.height - lowerThirdY,
    }) ?? bottomImage;
  const lowerThirdCenterWidth = Math.round(regionImg.width * 0.72);
  const lowerThirdCenterX = Math.round(
    (regionImg.width - lowerThirdCenterWidth) / 2,
  );
  const lowerThirdCenterImage =
    cropRgbImageData(lowerThirdImage, {
      x: lowerThirdCenterX,
      y: 0,
      width: lowerThirdCenterWidth,
      height: lowerThirdImage.height,
    }) ?? lowerThirdImage;

  const startBandY = Math.round(regionImg.height * 0.84);
  const startBandHeight = Math.max(1, Math.round(regionImg.height * 0.15));
  const startBandWidth = Math.round(regionImg.width * 0.5);
  const startBandX = Math.round((regionImg.width - startBandWidth) / 2);
  const startBandImage =
    cropRgbImageData(regionImg, {
      x: startBandX,
      y: startBandY,
      width: startBandWidth,
      height: Math.min(startBandHeight, regionImg.height - startBandY),
    }) ?? footerCenterImage;

  const searchRegions: Array<{
    label:
      | "start-band"
      | "full"
      | "bottom"
      | "bottom-center"
      | "lower-third"
      | "lower-third-center"
      | "footer"
      | "footer-center";
    image: RgbImageData;
    offsetX: number;
    offsetY: number;
  }> = [
    {
      label: "start-band",
      image: startBandImage,
      offsetX: startBandX,
      offsetY: startBandY,
    },
    {
      label: "bottom-center",
      image: bottomCenterImage,
      offsetX: centerX,
      offsetY: bottomY,
    },
    {
      label: "footer-center",
      image: footerCenterImage,
      offsetX: footerCenterX,
      offsetY: footerY,
    },
    { label: "footer", image: footerImage, offsetX: 0, offsetY: footerY },
    {
      label: "lower-third-center",
      image: lowerThirdCenterImage,
      offsetX: lowerThirdCenterX,
      offsetY: lowerThirdY,
    },
    {
      label: "lower-third",
      image: lowerThirdImage,
      offsetX: 0,
      offsetY: lowerThirdY,
    },
  ];

  const scales = [1, 0.98, 1.02, 0.95, 1.05, 0.9, 1.1];
  const thresholdPasses = [0, -0.02, -0.04, -0.06];

  for (const thresholdAdjust of thresholdPasses) {
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

        const baseThreshold =
          searchRegion.label === "start-band"
            ? 0.9
            : searchRegion.label === "bottom-center"
              ? 0.88
              : searchRegion.label === "footer-center"
                ? 0.85
                : searchRegion.label === "footer"
                  ? 0.8
                  : searchRegion.label === "lower-third-center"
                    ? 0.78
                    : searchRegion.label === "lower-third"
                      ? 0.76
                      : searchRegion.label === "bottom"
                        ? 0.74
                        : 0.72;
        const matcherThreshold = Math.max(
          0.68,
          baseThreshold + thresholdAdjust,
        );
        const cvLoc = findTemplateLocationWithPixelmatch(
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
            detectionSource: "template",
          };
        }
      }
    }
  }
  return null;
};

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
const MAX_KEY_TRIGGER_CHAIN_DEPTH = 6;
const CHARACTER_TITLE_PATTERN = /^(.+?)\s*-\s*Flyff Universe$/i;

const getCharacterNameFromTitle = (title: string): string | null => {
  const trimmed = title.trim();
  const match = trimmed.match(CHARACTER_TITLE_PATTERN);
  const candidate = match?.[1]?.trim();
  return candidate ? candidate : null;
};

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

      if (token === "escape") {
        keys.push("esc");
        return;
      }

      keys.push(token);
    });

  const orderedModifiers = Array.from(modifiers).sort(
    (left, right) => modifierRank[left] - modifierRank[right],
  );

  return [...orderedModifiers, ...keys].join("+");
};

const getOriginalKeyTriggerProfileId = (profileId: string): string => {
  return profileId.split("::")[0];
};

const areStringRecordsEqual = (
  left: Record<string, string>,
  right: Record<string, string>,
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => right[key] === left[key]);
};

const areNumberArraysEqual = (left: number[], right: number[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
};

const normalizeKeyTriggerRunCount = (value: unknown, fallback = 1): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(999, Math.max(1, Math.round(fallback)));
  }

  return Math.min(999, Math.max(1, Math.round(numeric)));
};

const normalizeKeyTriggerActionRepeatCount = (
  value: unknown,
  fallback = 1,
): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(99, Math.max(1, Math.round(fallback)));
  }

  return Math.min(99, Math.max(1, Math.round(numeric)));
};

/**
 * Computes the total sequential execution duration of a run-once/repeat profile
 * including any profiles chained through action keys.
 * Used by scheduleKeyTriggerActions to defer subsequent actions in sequential mode.
 */
const computeSequentialChainedDurationMs = (
  profile: KeyTriggerProfile,
  allProfiles: KeyTriggerProfile[],
  visitedIds: Set<string>,
  depth: number,
): number => {
  if (depth > MAX_KEY_TRIGGER_CHAIN_DEPTH || visitedIds.has(profile.id)) {
    return 0;
  }

  const nextVisited = new Set(visitedIds).add(profile.id);
  const isSequential = profile.delayMode !== "synchronous";
  let singleRunMs = 0;

  if (isSequential) {
    for (const action of profile.actions) {
      if (action.enabled === false || !action.key.trim()) {
        continue;
      }
      const delayMs = Math.max(0, Math.round(action.delayMs || 0));
      const repeatCount =
        action.actionTriggerType === "repeat"
          ? normalizeKeyTriggerActionRepeatCount(action.actionRepeatCount, 2)
          : 1;
      singleRunMs +=
        delayMs + (repeatCount - 1) * Math.max(120, delayMs || 120);

      // Recurse into any profile that this action's key would chain to
      const normalizedKey = normalizeShortcutBinding(action.key);
      const chained = allProfiles.find(
        (p) =>
          p.enabled !== false &&
          p.triggerType !== "toggle" &&
          p.triggerKey &&
          normalizeShortcutBinding(p.triggerKey) === normalizedKey &&
          !nextVisited.has(p.id),
      );
      if (chained) {
        singleRunMs += computeSequentialChainedDurationMs(
          chained,
          allProfiles,
          nextVisited,
          depth + 1,
        );
      }
    }
  } else {
    // synchronous: duration is the max individual action delay
    const enabledActions = profile.actions.filter(
      (a) => a.enabled !== false && a.key.trim().length > 0,
    );
    singleRunMs =
      enabledActions.length > 0
        ? Math.max(
            ...enabledActions.map((a) =>
              Math.max(0, Math.round(a.delayMs || 0)),
            ),
          )
        : 0;
  }

  if (singleRunMs === 0) {
    return 0;
  }

  // Account for profile-level repeat (each run is spaced by cycleMs)
  const runCount =
    profile.triggerType === "repeat"
      ? normalizeKeyTriggerRunCount(profile.repeatCount, 2)
      : 1;
  const cycleMs = Math.max(120, singleRunMs + 120);
  return runCount > 1 ? runCount * cycleMs : singleRunMs;
};

function MapperApp() {
  const [modal, modalContextHolder] = Modal.useModal();
  const initialProfilesState = useMemo(() => storage.loadProfiles(), []);
  const initialUiState = useMemo(() => storage.loadUiState(), []);
  const [settings, setSettings] = useState<MapperSettings>(() =>
    storage.loadSettings(),
  );
  const [accessControl, setAccessControl] = useState<AccessControlState>(
    DEFAULT_ACCESS_CONTROL_STATE,
  );
  const [accessLastCheckedAtIso, setAccessLastCheckedAtIso] = useState<
    string | null
  >(null);
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

  useEffect(() => {
    let isMounted = true;

    void storage.runStorageHealthCheck().then((report) => {
      if (!isMounted || report.ok) {
        return;
      }

      const summary = report.issues.slice(0, 3).join("; ");
      message.warning(
        `Storage health check found issues. Auto-repairs: ${report.repairs.length}. ${summary}`,
        8,
      );
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [activeProfileName, setActiveProfileName] = useState(() => {
    const activeProfile = initialProfilesState.profiles.find(
      (profile) => profile.id === initialProfilesState.activeProfileId,
    );
    return activeProfile?.name ?? "";
  });
  const [copiedShapes, setCopiedShapes] = useState<ShapeMapping[]>([]);
  const [isTransformingShape, setIsTransformingShape] = useState(false);
  const [shapesVisible, setShapesVisible] = useState<boolean>(() => {
    const shared = loadSharedRunState();
    return typeof shared?.shapesVisible === "boolean"
      ? shared.shapesVisible
      : true;
  });
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
  const initialKeyTriggerState = useMemo(
    () => storage.loadKeyTriggerState(),
    [],
  );
  const [keyTriggerPresets, setKeyTriggerPresets] = useState<
    KeyTriggerPreset[]
  >(initialKeyTriggerState.presets);
  const [selectedKeyTriggerPresetId, setSelectedKeyTriggerPresetId] =
    useState<string>(initialKeyTriggerState.selectedPresetId);
  const [
    keyTriggerCharacterPresetMapping,
    setKeyTriggerCharacterPresetMapping,
  ] = useState<Record<string, string>>(
    () => initialKeyTriggerState.characterPresetMapping,
  );
  const [keyTriggerProfiles, setKeyTriggerProfiles] = useState<
    KeyTriggerProfile[]
  >(() => {
    const activePreset =
      initialKeyTriggerState.presets.find(
        (preset) => preset.id === initialKeyTriggerState.selectedPresetId,
      ) ?? initialKeyTriggerState.presets[0];
    return activePreset?.profiles ?? [];
  });

  const [keyTriggerCharacters, setKeyTriggerCharacters] = useState<
    CharacterTabInfo[]
  >([]);
  const [selectedKeyTriggerTabIds, setSelectedKeyTriggerTabIds] = useState<
    number[]
  >(() => {
    const sessionIds = loadSessionSelectedKeyTriggerTabIds();
    const persistedIds = storage.loadKeyTriggerTargetTabIds();
    return Array.from(new Set([...sessionIds, ...persistedIds])).filter((id) =>
      Number.isFinite(id),
    );
  });
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  const [currentCharacterName, setCurrentCharacterName] = useState<
    string | null
  >(() => getCharacterNameFromTitle(document.title));
  const [mapperCharacterProfileMapping, setMapperCharacterProfileMapping] =
    useState<Record<string, string>>(() =>
      storage.loadMapperCharacterProfileMapping(),
    );
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
  const [systemThemeRefreshVersion, setSystemThemeRefreshVersion] = useState(0);

  const rotateIdRef = useRef<string | null>(null);
  const previousBodyCursorRef = useRef<string | null>(null);
  const previousCanvasPointerEventsRef = useRef<string | null>(null);
  const latestShapesRef = useRef<ShapeMapping[]>(shapes);
  const latestSettingsRef = useRef<MapperSettings>(settings);
  const latestProfilesRef = useRef<MappingProfile[]>(profiles);
  const previousActiveProfileIdRef = useRef(activeProfileId);
  const skipNextProfilesSaveRef = useRef(false);
  const suppressNextSettingsSaveRef = useRef(false);
  const suppressNextUiStateSaveRef = useRef(false);
  const suppressNextSharedRunStateSaveRef = useRef(false);
  const suppressNextKeyTriggerStateSaveRef = useRef(false);
  const suppressNextKeyTriggerTargetTabsSaveRef = useRef(false);
  const suppressNextKeyTriggerCharacterProfileMappingSaveRef = useRef(false);
  const suppressNextMapperCharacterProfileMappingSaveRef = useRef(false);
  const isSwitchingProfileRef = useRef(false);
  const isApplyingMappedProfileRef = useRef(false);
  const skipMappedAutoApplyOnceRef = useRef(false);
  const isPrimarySyncSourceRef = useRef(
    typeof document === "undefined"
      ? true
      : document.visibilityState === "visible" && document.hasFocus(),
  );
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
  const latestAccessControlRef = useRef<AccessControlState>(accessControl);
  const accessLockHandledRef = useRef(false);

  const canUseTool = accessControl.hasToolAccess;
  const canUseKeyTrigger = canUseTool && accessControl.features.keyTrigger;
  const canUseAutoHoly = canUseTool && accessControl.features.autoHoly;
  const canUseAutoPills = canUseTool && accessControl.features.autoPills;
  const canUseAutoAwaken = canUseTool && accessControl.features.autoAwaken;
  const canUseSyncMouseEvents = canUseTool && accessControl.features.syncMouse;

  const refreshAccessControl = useCallback(
    async (subscriptionToken?: string) => {
      const nextState = await resolveAccessControlState({
        subscriptionToken:
          typeof subscriptionToken === "string"
            ? subscriptionToken
            : latestSettingsRef.current.subscriptionAccessToken,
      });
      setAccessControl(nextState);
      setAccessLastCheckedAtIso(new Date().toISOString());
      return nextState;
    },
    [],
  );

  const handleGenerateSubscriptionToken = useCallback(
    async (payload: { plan: SubscriptionPlan; role?: AccessRole }) => {
      return generateSubscriptionToken(accessControl, payload);
    },
    [accessControl],
  );

  const handleListSubscriptionTokens = useCallback(async () => {
    return listSubscriptionTokens(accessControl);
  }, [accessControl]);

  const handleRevokeSubscriptionToken = useCallback(
    async (tokenHash: string) => {
      await revokeSubscriptionToken(accessControl, tokenHash);
    },
    [accessControl],
  );

  const handleDeleteSubscriptionToken = useCallback(
    async (tokenHash: string) => {
      await deleteSubscriptionToken(accessControl, tokenHash);
    },
    [accessControl],
  );

  useEffect(() => {
    let cancelled = false;

    void refreshAccessControl().then((nextState) => {
      if (cancelled) {
        return;
      }

      setAccessControl(nextState);
    });

    return () => {
      cancelled = true;
    };
  }, [refreshAccessControl]);

  // Periodically recheck access control to detect token expiry and role/plan updates.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshAccessControl();
    }, 30_000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshAccessControl();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [refreshAccessControl]);

  useEffect(() => {
    if (accessControl.loading || accessControl.hasToolAccess) {
      return;
    }

    setOverlayVisible((prev) => (dialogVisible ? prev : false));
    setAutomationRegionCaptureTarget(null);
    setAutomationRegionCaptureRect(null);
  }, [accessControl, dialogVisible]);

  useEffect(() => {
    if (
      accessControl.loading ||
      !accessControl.hasToolAccess ||
      !dialogVisible
    ) {
      return;
    }

    setOverlayVisible(true);
  }, [accessControl.hasToolAccess, accessControl.loading, dialogVisible]);

  useEffect(() => {
    if (accessControl.loading) {
      return;
    }

    if (!canUseKeyTrigger && activeUtilityTab === "key-trigger") {
      setActiveUtilityTab("key-mapper");
      return;
    }

    if (!canUseAutoAwaken && activeUtilityTab === "auto-awaken") {
      setActiveUtilityTab("key-mapper");
    }
  }, [
    accessControl.loading,
    activeUtilityTab,
    canUseAutoAwaken,
    canUseKeyTrigger,
  ]);

  useEffect(() => {
    setSettings((prev) => {
      let next = prev;

      if (!canUseSyncMouseEvents && next.syncMouseEvents) {
        next = {
          ...next,
          syncMouseEvents: false,
        };
      }

      if (!canUseAutoHoly && next.autoHoly.enabled) {
        next = {
          ...next,
          autoHoly: {
            ...next.autoHoly,
            enabled: false,
          },
        };
      }

      if (!canUseAutoPills && next.autoPills.enabled) {
        next = {
          ...next,
          autoPills: {
            ...next.autoPills,
            enabled: false,
          },
        };
      }

      return next;
    });
  }, [
    canUseAutoAwaken,
    canUseAutoHoly,
    canUseAutoPills,
    canUseSyncMouseEvents,
  ]);

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
  const [autoAwakenTemporaryShape, setAutoAwakenTemporaryShape] =
    useState<ShapeMapping | null>(null);
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
  const autoAwakenTemporaryShapeClearTimerRef = useRef<number | null>(null);
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

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      isPrimarySyncSourceRef.current = true;
      return;
    }

    const updateSyncSourceState = () => {
      isPrimarySyncSourceRef.current =
        document.visibilityState === "visible" && document.hasFocus();
    };

    updateSyncSourceState();
    document.addEventListener("visibilitychange", updateSyncSourceState);
    window.addEventListener("focus", updateSyncSourceState);
    window.addEventListener("blur", updateSyncSourceState);

    return () => {
      document.removeEventListener("visibilitychange", updateSyncSourceState);
      window.removeEventListener("focus", updateSyncSourceState);
      window.removeEventListener("blur", updateSyncSourceState);
    };
  }, []);

  const setShapesWithoutHistory = useCallback(
    (updater: SetStateAction<ShapeMapping[]>) => {
      updateShapes(updater, { recordHistory: false, clearRedo: false });
    },
    [updateShapes],
  );

  const selectedShape = useMemo(
    () => shapes.find((shape) => shape.id === selectedId) ?? null,
    [selectedId, shapes],
  );

  const visibleShapes = useMemo(
    () =>
      autoAwakenTemporaryShape ? [...shapes, autoAwakenTemporaryShape] : shapes,
    [autoAwakenTemporaryShape, shapes],
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

  const selectedKeyTriggerPreset = useMemo(
    () =>
      keyTriggerPresets.find(
        (preset) => preset.id === selectedKeyTriggerPresetId,
      ) ??
      keyTriggerPresets[0] ??
      null,
    [keyTriggerPresets, selectedKeyTriggerPresetId],
  );

  useEffect(() => {
    if (!selectedKeyTriggerPreset) {
      return;
    }

    setKeyTriggerProfiles((prev) => {
      const nextProfiles = selectedKeyTriggerPreset.profiles;
      if (JSON.stringify(prev) === JSON.stringify(nextProfiles)) {
        return prev;
      }
      return nextProfiles;
    });
  }, [selectedKeyTriggerPreset]);

  useEffect(() => {
    if (
      keyTriggerPresets.length > 0 &&
      !keyTriggerPresets.some(
        (preset) => preset.id === selectedKeyTriggerPresetId,
      )
    ) {
      setSelectedKeyTriggerPresetId(keyTriggerPresets[0].id);
    }
  }, [keyTriggerPresets, selectedKeyTriggerPresetId]);

  const resolvedTheme = useMemo(
    () => getResolvedThemePreset(settings.theme, getSystemDark()),
    [settings.theme, systemThemeRefreshVersion],
  );
  const isDarkTheme = resolvedTheme.appearance === "dark";

  // Keep all --fm-theme-* CSS custom properties up to date on the mapper root
  // and document-level containers so portaled popups/modals also inherit them.
  useEffect(() => {
    const root = document.getElementById(ROOT_ID);
    const targets: HTMLElement[] = [document.body, document.documentElement];
    if (root) {
      targets.push(root);
    }
    const t = resolvedTheme.token;
    const bgBase = t.colorBgBase ?? "#f5f5f5";
    const bgContainer = t.colorBgContainer ?? bgBase;
    const bgElevated = t.colorBgElevated ?? bgContainer;
    const bgLayout = t.colorBgLayout ?? bgBase;
    const text = t.colorText ?? t.colorTextBase ?? "rgba(0, 0, 0, 0.88)";
    const textSecondary =
      t.colorTextSecondary ?? t.colorTextDescription ?? "rgba(0, 0, 0, 0.62)";
    const border = t.colorBorder ?? "#d9d9d9";
    const borderSecondary = t.colorBorderSecondary ?? border;
    const fill = t.colorFillSecondary ?? "rgba(0, 0, 0, 0.06)";
    const fillStrong = t.colorFillTertiary ?? fill;
    const fillSoft = t.colorFillQuaternary ?? fill;
    const primary = t.colorPrimary ?? "#1677ff";
    const primaryBg = t.colorPrimaryBg ?? "#e6f4ff";
    const success = t.colorSuccess ?? "#52c41a";
    const successBg = t.colorSuccessBg ?? "#f6ffed";
    const warning = t.colorWarning ?? "#faad14";
    const warningBg = t.colorWarningBg ?? "#fffbe6";
    const error = t.colorError ?? "#ff4d4f";
    const errorBg = t.colorErrorBg ?? "#fff2f0";
    const infoBg = t.colorInfoBg ?? primaryBg;

    const vars: Array<[string, string]> = [
      ["--fm-theme-bg-base", bgBase],
      ["--fm-theme-bg-container", bgContainer],
      ["--fm-theme-bg-elevated", bgElevated],
      ["--fm-theme-bg-layout", bgLayout],
      ["--fm-theme-text", text],
      ["--fm-theme-text-secondary", textSecondary],
      ["--fm-theme-border", border],
      ["--fm-theme-border-secondary", borderSecondary],
      ["--fm-theme-fill", fill],
      ["--fm-theme-fill-strong", fillStrong],
      ["--fm-theme-fill-soft", fillSoft],
      ["--fm-theme-primary", primary],
      ["--fm-theme-primary-bg", primaryBg],
      ["--fm-theme-success", success],
      ["--fm-theme-success-bg", successBg],
      ["--fm-theme-warning", warning],
      ["--fm-theme-warning-bg", warningBg],
      ["--fm-theme-error", error],
      ["--fm-theme-error-bg", errorBg],
      ["--fm-theme-info-bg", infoBg],
    ];
    vars.forEach(([name, value]) => {
      targets.forEach((target) => {
        target.style.setProperty(name, value);
      });
    });
  }, [resolvedTheme]);

  const importAnalysis = useMemo(() => {
    const raw = importText.trim();
    if (!raw) {
      return {
        isValidJson: false,
        hasImportData: false,
        profileCount: 0,
        keyTriggerProfileCount: 0,
        mapperDuplicateCount: 0,
        keyTriggerDuplicateCount: 0,
        missingNameCount: 0,
        parseError: "Paste mapping JSON to import.",
      };
    }

    try {
      const parsed = JSON.parse(raw) as {
        profileName?: string;
        shapes?: ShapeMapping[];
        profiles?: Array<{
          name?: string;
          shapes?: ShapeMapping[];
        }>;
        keyTriggerProfiles?: KeyTriggerProfile[];
        keyTriggerPresets?: Array<{
          id?: string;
          name?: string;
          switchShortcut?: string;
          profiles?: KeyTriggerProfile[];
        }>;
        selectedKeyTriggerPresetId?: string;
        keyTriggerCharacterPresetMapping?: Record<string, string>;
        settings?: Partial<MapperSettings>;
        uiState?: {
          selectedPaletteShape?: ShapeType;
          dialogRect?: Partial<DialogRect>;
          selectedUtilityTab?: UtilityTab;
        };
        selectedKeyTriggerTabIds?: unknown[];
        selectedKeyTriggerTabNames?: unknown[];
        keyTriggerCharacterProfileMapping?: Record<string, string>;
        mapperCharacterProfileMapping?: Record<string, string>;
      };

      const buildMapperSignature = (
        candidate: Pick<MappingProfile, "shapes">,
      ): string => {
        const normalizedShapes = candidate.shapes.map((shape) => ({
          type: shape.type,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          rotation: shape.rotation,
          keyBinding: shape.keyBinding.trim(),
          delayMs: Math.max(0, Math.round(shape.delayMs || 0)),
          triggerType: shape.triggerType,
        }));

        return JSON.stringify({ shapes: normalizedShapes });
      };

      const buildKeyTriggerSignature = (
        profile: Pick<
          KeyTriggerProfile,
          | "enabled"
          | "triggerType"
          | "repeatCount"
          | "triggerKey"
          | "executionScope"
          | "currentTabOnly"
          | "otherTabsOnly"
          | "specificTargetTabIds"
          | "delayMode"
          | "actions"
        >,
      ): string => {
        const normalizedActions = profile.actions.map((action) => ({
          name: action.name.trim().toLowerCase(),
          key: action.key.trim(),
          delayMs: Math.max(0, Math.round(action.delayMs || 0)),
          enabled: action.enabled !== false,
          actionTriggerType:
            action.actionTriggerType === "repeat" ? "repeat" : "once",
          actionRepeatCount:
            action.actionTriggerType === "repeat"
              ? normalizeKeyTriggerActionRepeatCount(
                  action.actionRepeatCount,
                  2,
                )
              : 1,
          executionScope:
            action.executionScope === "current" ||
            action.executionScope === "other" ||
            action.executionScope === "specific"
              ? action.executionScope
              : action.otherTabsOnly === true
                ? "other"
                : action.currentTabOnly === true
                  ? "current"
                  : "all",
          currentTabOnly: action.currentTabOnly === true,
          otherTabsOnly: action.otherTabsOnly === true,
          specificTargetTabIds: Array.from(
            new Set(
              (action.specificTargetTabIds ?? []).filter((id) =>
                Number.isFinite(id),
              ),
            ),
          ),
        }));

        return JSON.stringify({
          enabled: profile.enabled !== false,
          triggerType: profile.triggerType,
          repeatCount:
            profile.triggerType === "repeat"
              ? normalizeKeyTriggerRunCount(profile.repeatCount, 2)
              : 1,
          triggerKey: profile.triggerKey.trim(),
          executionScope:
            profile.executionScope === "current" ||
            profile.executionScope === "other" ||
            profile.executionScope === "specific"
              ? profile.executionScope
              : profile.otherTabsOnly === true
                ? "other"
                : profile.currentTabOnly === true
                  ? "current"
                  : "all",
          currentTabOnly: profile.currentTabOnly === true,
          otherTabsOnly: profile.otherTabsOnly === true,
          specificTargetTabIds: Array.from(
            new Set(
              (profile.specificTargetTabIds ?? []).filter((id) =>
                Number.isFinite(id),
              ),
            ),
          ),
          delayMode: profile.delayMode,
          actions: normalizedActions,
        });
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
      const selectedTabCount = Array.isArray(parsed.selectedKeyTriggerTabIds)
        ? parsed.selectedKeyTriggerTabIds.filter((id) => Number.isFinite(id))
            .length
        : 0;
      const selectedTabNameCount = Array.isArray(
        parsed.selectedKeyTriggerTabNames,
      )
        ? parsed.selectedKeyTriggerTabNames.filter(
            (name) => typeof name === "string" && name.trim().length > 0,
          ).length
        : 0;
      const characterProfileMappingCount =
        parsed.keyTriggerCharacterProfileMapping &&
        typeof parsed.keyTriggerCharacterProfileMapping === "object"
          ? Object.keys(parsed.keyTriggerCharacterProfileMapping).length
          : 0;
      const mapperCharacterProfileMappingCount =
        parsed.mapperCharacterProfileMapping &&
        typeof parsed.mapperCharacterProfileMapping === "object"
          ? Object.keys(parsed.mapperCharacterProfileMapping).length
          : 0;
      const hasSettings =
        !!parsed.settings && typeof parsed.settings === "object";
      const hasUiState = !!parsed.uiState && typeof parsed.uiState === "object";

      const mapperSignatures = new Set(
        profiles.map((profile) =>
          buildMapperSignature({
            shapes: profile.shapes,
          }),
        ),
      );
      let mapperDuplicateCount = 0;

      if (Array.isArray(parsed.profiles)) {
        parsed.profiles.forEach((profile) => {
          if (!Array.isArray(profile.shapes)) {
            return;
          }

          const signature = buildMapperSignature({
            shapes: profile.shapes.map(normalizeShape),
          });

          if (mapperSignatures.has(signature)) {
            mapperDuplicateCount += 1;
            return;
          }

          mapperSignatures.add(signature);
        });
      }

      if (Array.isArray(parsed.shapes)) {
        const signature = buildMapperSignature({
          shapes: parsed.shapes.map(normalizeShape),
        });

        if (mapperSignatures.has(signature)) {
          mapperDuplicateCount += 1;
        } else {
          mapperSignatures.add(signature);
        }
      }

      const keyTriggerSignatures = new Set(
        keyTriggerProfiles.map((profile) =>
          buildKeyTriggerSignature({
            enabled: profile.enabled,
            triggerType: profile.triggerType,
            triggerKey: profile.triggerKey,
            executionScope: profile.executionScope,
            currentTabOnly: profile.currentTabOnly,
            otherTabsOnly: profile.otherTabsOnly,
            specificTargetTabIds: profile.specificTargetTabIds,
            delayMode: profile.delayMode,
            actions: profile.actions,
          }),
        ),
      );
      const keyTriggerIdentifiers = new Set(
        keyTriggerProfiles
          .map((profile) => profile.profileIdentifier?.trim())
          .filter((identifier): identifier is string =>
            Boolean(identifier && identifier.length > 0),
          ),
      );
      let keyTriggerDuplicateCount = 0;

      if (Array.isArray(parsed.keyTriggerProfiles)) {
        parsed.keyTriggerProfiles.forEach((profile) => {
          const incomingIdentifier =
            typeof profile.profileIdentifier === "string"
              ? profile.profileIdentifier.trim()
              : "";

          if (
            incomingIdentifier &&
            keyTriggerIdentifiers.has(incomingIdentifier)
          ) {
            keyTriggerDuplicateCount += 1;
            return;
          }

          const signature = buildKeyTriggerSignature({
            enabled: profile.enabled,
            triggerType:
              profile.triggerType === "toggle"
                ? "toggle"
                : profile.triggerType === "repeat"
                  ? "repeat"
                  : "once",
            repeatCount: normalizeKeyTriggerRunCount(profile.repeatCount, 2),
            triggerKey:
              typeof profile.triggerKey === "string" ? profile.triggerKey : "",
            executionScope:
              profile.executionScope === "current" ||
              profile.executionScope === "other" ||
              profile.executionScope === "specific"
                ? profile.executionScope
                : profile.otherTabsOnly === true
                  ? "other"
                  : profile.currentTabOnly === true
                    ? "current"
                    : "all",
            currentTabOnly: profile.currentTabOnly,
            otherTabsOnly: profile.otherTabsOnly,
            specificTargetTabIds: Array.isArray(profile.specificTargetTabIds)
              ? profile.specificTargetTabIds
              : Number.isFinite(profile.specificTargetTabId)
                ? [profile.specificTargetTabId as number]
                : [],
            delayMode:
              profile.delayMode === "synchronous"
                ? "synchronous"
                : "sequential",
            actions: (Array.isArray(profile.actions)
              ? profile.actions
              : []) as KeyTriggerAction[],
          });

          if (keyTriggerSignatures.has(signature)) {
            keyTriggerDuplicateCount += 1;
            return;
          }

          if (incomingIdentifier) {
            keyTriggerIdentifiers.add(incomingIdentifier);
          }
          keyTriggerSignatures.add(signature);
        });
      }

      return {
        isValidJson: true,
        hasImportData:
          profileCount > 0 ||
          keyTriggerProfileCount > 0 ||
          selectedTabCount > 0 ||
          selectedTabNameCount > 0 ||
          characterProfileMappingCount > 0 ||
          mapperCharacterProfileMappingCount > 0 ||
          hasSettings ||
          hasUiState,
        profileCount,
        keyTriggerProfileCount,
        mapperDuplicateCount,
        keyTriggerDuplicateCount,
        missingNameCount,
        parseError: "",
      };
    } catch {
      return {
        isValidJson: false,
        hasImportData: false,
        profileCount: 0,
        keyTriggerProfileCount: 0,
        mapperDuplicateCount: 0,
        keyTriggerDuplicateCount: 0,
        missingNameCount: 0,
        parseError: "Invalid JSON format.",
      };
    }
  }, [importText, keyTriggerProfiles, profiles, settings]);

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
        const sameShapes = profile.shapes === shapes;

        if (sameName && sameShapes) {
          return profile;
        }

        return {
          ...profile,
          name: nextName,
          shapes,
        };
      }),
    );
  }, [activeProfileId, activeProfileName, shapes]);

  useEffect(() => {
    latestProfilesRef.current = profiles;

    if (skipNextProfilesSaveRef.current) {
      skipNextProfilesSaveRef.current = false;
      return;
    }

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
    setActiveProfileName(nextActiveProfile.name);
    selectSingleShape(null);
    setCopiedShapes([]);
    setIsTransformingShape(false);
    setSelectedProfileId(activeProfileId);
  }, [
    activeProfileId,
    profiles,
    resetShapeHistory,
    selectSingleShape,
    setShapesWithoutHistory,
  ]);

  useEffect(() => {
    if (!isSwitchingProfileRef.current) {
      return;
    }

    const nextActiveProfile =
      profiles.find((profile) => profile.id === activeProfileId) ?? null;
    if (!nextActiveProfile) {
      isSwitchingProfileRef.current = false;
      return;
    }

    const shapeHydrated = shapes === nextActiveProfile.shapes;
    const nameHydrated = activeProfileName === nextActiveProfile.name;

    if (shapeHydrated && nameHydrated) {
      isSwitchingProfileRef.current = false;
    }
  }, [activeProfileId, activeProfileName, profiles, shapes]);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    latestAccessControlRef.current = accessControl;
  }, [accessControl]);

  useEffect(() => {
    if (suppressNextSettingsSaveRef.current) {
      suppressNextSettingsSaveRef.current = false;
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    storage.saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    selectedPaletteShapeRef.current = selectedPaletteShape;
  }, [selectedPaletteShape]);

  useEffect(() => {
    const updateCharacterName = () => {
      const nextCharacterName = getCharacterNameFromTitle(document.title);
      setCurrentCharacterName((prev) =>
        prev === nextCharacterName ? prev : nextCharacterName,
      );
    };

    updateCharacterName();

    const titleElement = document.querySelector("title");
    const observer = new MutationObserver(updateCharacterName);
    if (titleElement) {
      observer.observe(titleElement, {
        childList: true,
      });
    }

    const intervalId = window.setInterval(updateCharacterName, 1000);

    return () => {
      observer.disconnect();
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!currentCharacterName || !activeProfileId) {
      return;
    }

    if (skipMappedAutoApplyOnceRef.current) {
      skipMappedAutoApplyOnceRef.current = false;
      return;
    }

    const mappedProfileId = mapperCharacterProfileMapping[currentCharacterName];
    const hasMappedProfile =
      typeof mappedProfileId === "string" &&
      profiles.some((profile) => profile.id === mappedProfileId);

    if (hasMappedProfile && mappedProfileId !== activeProfileId) {
      stopAllToggleShapeAreas();
      isApplyingMappedProfileRef.current = true;
      isSwitchingProfileRef.current = true;
      setActiveProfileId(mappedProfileId);
      setSelectedProfileId(mappedProfileId);
    }
  }, [
    activeProfileId,
    currentCharacterName,
    mapperCharacterProfileMapping,
    profiles,
  ]);

  useEffect(() => {
    if (!currentCharacterName || !activeProfileId) {
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    setMapperCharacterProfileMapping((prev) => {
      if (isApplyingMappedProfileRef.current) {
        isApplyingMappedProfileRef.current = false;
        return prev;
      }

      const existing = prev[currentCharacterName];

      if (existing === activeProfileId) {
        return prev;
      }

      return {
        ...prev,
        [currentCharacterName]: activeProfileId,
      };
    });
  }, [activeProfileId, currentCharacterName, profiles]);

  useEffect(() => {
    if (suppressNextUiStateSaveRef.current) {
      suppressNextUiStateSaveRef.current = false;
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    storage.saveUiState({
      selectedPaletteShape,
      dialogRect,
      selectedUtilityTab: activeUtilityTab,
    });
  }, [activeUtilityTab, dialogRect, selectedPaletteShape]);

  useEffect(() => {
    if (suppressNextSharedRunStateSaveRef.current) {
      suppressNextSharedRunStateSaveRef.current = false;
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    storage.saveSharedRunState({
      editMode: settings.editMode,
      experimentalFeaturesEnabled: settings.experimentalFeaturesEnabled,
      shapesVisible,
      updatedAt: Date.now(),
    });
  }, [settings.editMode, settings.experimentalFeaturesEnabled, shapesVisible]);

  useEffect(() => {
    if (suppressNextKeyTriggerStateSaveRef.current) {
      suppressNextKeyTriggerStateSaveRef.current = false;
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    storage.saveKeyTriggerState({
      selectedPresetId: selectedKeyTriggerPresetId,
      presets: keyTriggerPresets,
      characterPresetMapping: keyTriggerCharacterPresetMapping,
    });
  }, [
    keyTriggerCharacterPresetMapping,
    keyTriggerPresets,
    selectedKeyTriggerPresetId,
  ]);

  useEffect(() => {
    saveSessionSelectedKeyTriggerTabIds(selectedKeyTriggerTabIds);

    const selectedNames = keyTriggerCharacters
      .filter((tab) => selectedKeyTriggerTabIds.includes(tab.id))
      .map((tab) => tab.name);
    const selectedNameSet = new Set(selectedNames);
    const previousSelectedNames = new Set([
      ...loadSessionSelectedKeyTriggerTabNames(),
      ...storage.loadKeyTriggerTargetTabNames(),
    ]);
    const currentlyVisibleNames = new Set(
      keyTriggerCharacters.map((tab) => tab.name),
    );
    const preservedNames = Array.from(previousSelectedNames).filter(
      (name) => !currentlyVisibleNames.has(name),
    );
    const uniqueSelectedNames = Array.from(
      new Set([...Array.from(selectedNameSet), ...preservedNames]),
    );

    if (selectedKeyTriggerTabIds.length === 0) {
      saveSessionSelectedKeyTriggerTabNames(uniqueSelectedNames);
    } else if (uniqueSelectedNames.length > 0) {
      saveSessionSelectedKeyTriggerTabNames(uniqueSelectedNames);
    }

    if (suppressNextKeyTriggerTargetTabsSaveRef.current) {
      suppressNextKeyTriggerTargetTabsSaveRef.current = false;
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    storage.saveKeyTriggerTargetTabIds(selectedKeyTriggerTabIds);

    if (uniqueSelectedNames.length > 0) {
      storage.saveKeyTriggerTargetTabNames(uniqueSelectedNames);
      return;
    }

    if (selectedKeyTriggerTabIds.length === 0) {
      // This represents an explicit user uncheck with no preserved names.
      storage.saveKeyTriggerTargetTabNames([]);
    }
  }, [selectedKeyTriggerTabIds, keyTriggerCharacters]);

  useEffect(() => {
    if (settings.editMode) {
      return;
    }

    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      return;
    }

    const tabIds = Array.from(
      new Set(selectedKeyTriggerTabIds.filter((id) => Number.isFinite(id))),
    );

    void safeSendRuntimeMessage({
      type: "KEY_TRIGGER_SYNC_TOGGLE_TABS",
      tabIds,
    });
  }, [selectedKeyTriggerTabIds, settings.editMode]);

  useEffect(() => {
    if (suppressNextKeyTriggerCharacterProfileMappingSaveRef.current) {
      suppressNextKeyTriggerCharacterProfileMappingSaveRef.current = false;
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    storage.saveKeyTriggerCharacterProfileMapping(
      keyTriggerCharacterProfileMapping,
    );
  }, [keyTriggerCharacterProfileMapping]);

  useEffect(() => {
    if (suppressNextMapperCharacterProfileMappingSaveRef.current) {
      suppressNextMapperCharacterProfileMappingSaveRef.current = false;
      return;
    }

    if (!isPrimarySyncSourceRef.current) {
      return;
    }

    storage.saveMapperCharacterProfileMapping(mapperCharacterProfileMapping);
  }, [mapperCharacterProfileMapping]);

  useEffect(() => {
    // Validate that all stored profiles still exist.
    setKeyTriggerCharacterProfileMapping((prev) => {
      const validProfileIds = new Set(keyTriggerProfiles.map((p) => p.id));
      const validatedMapping: Record<string, string> = {};

      Object.entries(prev).forEach(([charName, profileId]) => {
        if (validProfileIds.has(profileId)) {
          validatedMapping[charName] = profileId;
        }
      });

      return areStringRecordsEqual(prev, validatedMapping)
        ? prev
        : validatedMapping;
    });
  }, [keyTriggerProfiles]);

  useEffect(() => {
    setMapperCharacterProfileMapping((prev) => {
      const validProfileIds = new Set(profiles.map((p) => p.id));
      const validatedMapping: Record<string, string> = {};

      Object.entries(prev).forEach(([charName, profileId]) => {
        if (validProfileIds.has(profileId)) {
          validatedMapping[charName] = profileId;
        }
      });

      return areStringRecordsEqual(prev, validatedMapping)
        ? prev
        : validatedMapping;
    });
  }, [profiles]);

  useEffect(() => {
    const unsubscribe = storage.subscribeToSync((message) => {
      if (isPrimarySyncSourceRef.current) {
        return;
      }

      if (message.key === "flyff-mapper-profiles-v1") {
        const nextProfilesState = storage.loadProfiles();
        if (nextProfilesState.profiles.length === 0) {
          return;
        }

        const nextActiveProfileId = nextProfilesState.profiles.some(
          (profile) => profile.id === nextProfilesState.activeProfileId,
        )
          ? nextProfilesState.activeProfileId
          : nextProfilesState.profiles[0].id;
        const nextActiveProfile =
          nextProfilesState.profiles.find(
            (profile) => profile.id === nextActiveProfileId,
          ) ?? nextProfilesState.profiles[0];

        if (!nextActiveProfile) {
          return;
        }

        const currentLocalProfileId = previousActiveProfileIdRef.current;
        if (
          currentLocalProfileId &&
          currentLocalProfileId !== nextActiveProfile.id
        ) {
          const currentLocalProfile = nextProfilesState.profiles.find(
            (profile) => profile.id === currentLocalProfileId,
          );

          if (currentLocalProfile) {
            skipNextProfilesSaveRef.current = true;
            setProfiles(nextProfilesState.profiles);
            setSelectedProfileId((prev) => {
              if (
                prev &&
                nextProfilesState.profiles.some(
                  (profile) => profile.id === prev,
                )
              ) {
                return prev;
              }
              return currentLocalProfile.id;
            });
            setActiveProfileName(currentLocalProfile.name);
            return;
          }
          return;
        }

        skipNextProfilesSaveRef.current = true;
        previousActiveProfileIdRef.current = nextActiveProfile.id;
        isSwitchingProfileRef.current = false;

        setProfiles(nextProfilesState.profiles);
        setActiveProfileId(nextActiveProfile.id);
        setSelectedProfileId(nextActiveProfile.id);
        setActiveProfileName(nextActiveProfile.name);
        setShapesWithoutHistory(nextActiveProfile.shapes);
        resetShapeHistory();
        selectSingleShape(null);
        setCopiedShapes([]);
        setIsTransformingShape(false);
        return;
      }

      if (message.key === "flyff-mapper-key-trigger-v1") {
        suppressNextKeyTriggerStateSaveRef.current = true;
        const nextState = storage.loadKeyTriggerState();
        setKeyTriggerPresets((prev) => {
          const prevSerialized = JSON.stringify(prev);
          const nextSerialized = JSON.stringify(nextState.presets);
          return prevSerialized === nextSerialized ? prev : nextState.presets;
        });
        setSelectedKeyTriggerPresetId((prev) =>
          prev === nextState.selectedPresetId
            ? prev
            : nextState.selectedPresetId,
        );
        setKeyTriggerCharacterPresetMapping((prev) =>
          areStringRecordsEqual(prev, nextState.characterPresetMapping)
            ? prev
            : nextState.characterPresetMapping,
        );
        const activePreset =
          nextState.presets.find(
            (preset) => preset.id === nextState.selectedPresetId,
          ) ?? nextState.presets[0];
        setKeyTriggerProfiles((prev) => {
          const nextProfiles = activePreset?.profiles ?? [];
          const prevSerialized = JSON.stringify(prev);
          const nextSerialized = JSON.stringify(nextProfiles);
          return prevSerialized === nextSerialized ? prev : nextProfiles;
        });
        return;
      }

      if (message.key === "flyff-mapper-key-trigger-target-tabs-v1") {
        suppressNextKeyTriggerTargetTabsSaveRef.current = true;
        const syncedIds = storage.loadKeyTriggerTargetTabIds();
        setSelectedKeyTriggerTabIds((prev) =>
          areNumberArraysEqual(prev, syncedIds) ? prev : syncedIds,
        );
        saveSessionSelectedKeyTriggerTabIds(syncedIds);
        return;
      }

      if (message.key === "flyff-mapper-key-trigger-target-tab-names-v1") {
        const syncedNames = storage.loadKeyTriggerTargetTabNames();
        saveSessionSelectedKeyTriggerTabNames(syncedNames);

        if (keyTriggerCharacters.length === 0 || syncedNames.length === 0) {
          return;
        }

        const availableNames = new Set(syncedNames);
        const matchedIds = keyTriggerCharacters
          .filter((tab) => availableNames.has(tab.name))
          .map((tab) => tab.id);

        if (matchedIds.length > 0) {
          const nextMatchedIds = Array.from(new Set(matchedIds));
          suppressNextKeyTriggerTargetTabsSaveRef.current = true;
          setSelectedKeyTriggerTabIds((prev) =>
            areNumberArraysEqual(prev, nextMatchedIds) ? prev : nextMatchedIds,
          );
        }
        return;
      }

      if (message.key === "flyff-mapper-settings-v1") {
        const nextSettings = storage.loadSettings();
        suppressNextSettingsSaveRef.current = true;
        setSettings((prev) => {
          const prevSerialized = JSON.stringify(prev);
          const nextSerialized = JSON.stringify(nextSettings);
          return prevSerialized === nextSerialized ? prev : nextSettings;
        });
        return;
      }

      if (message.key === "flyff-mapper-ui-state-v1") {
        const nextUiState = storage.loadUiState();
        suppressNextUiStateSaveRef.current = true;
        setSelectedPaletteShape((prev) =>
          prev === nextUiState.selectedPaletteShape
            ? prev
            : nextUiState.selectedPaletteShape,
        );
        setDialogRect((prev) => {
          const prevSerialized = JSON.stringify(prev);
          const nextSerialized = JSON.stringify(nextUiState.dialogRect);
          return prevSerialized === nextSerialized
            ? prev
            : nextUiState.dialogRect;
        });
        setActiveUtilityTab((prev) =>
          prev === nextUiState.selectedUtilityTab
            ? prev
            : nextUiState.selectedUtilityTab,
        );
        return;
      }

      if (message.key === "flyff-mapper-key-trigger-character-profiles-v1") {
        suppressNextKeyTriggerCharacterProfileMappingSaveRef.current = true;
        const syncedMapping = storage.loadKeyTriggerCharacterProfileMapping();
        setKeyTriggerCharacterProfileMapping((prev) =>
          areStringRecordsEqual(prev, syncedMapping) ? prev : syncedMapping,
        );
        return;
      }

      if (message.key === MAPPER_CHARACTER_PROFILE_MAPPING_STORAGE_KEY) {
        suppressNextMapperCharacterProfileMappingSaveRef.current = true;
        const syncedMapping = storage.loadMapperCharacterProfileMapping();
        setMapperCharacterProfileMapping((prev) =>
          areStringRecordsEqual(prev, syncedMapping) ? prev : syncedMapping,
        );
        return;
      }

      if (message.key === "flyff-mapper-run-state-v1") {
        const nextRunState = storage.loadSharedRunState();

        suppressNextSharedRunStateSaveRef.current = true;
        setShapesVisible((prev) =>
          prev === nextRunState.shapesVisible
            ? prev
            : nextRunState.shapesVisible,
        );
        setSettings((prev) => {
          let changed = false;
          const updates: Partial<MapperSettings> = {};

          if (prev.editMode !== nextRunState.editMode) {
            updates.editMode = nextRunState.editMode;
            changed = true;
          }

          if (
            prev.experimentalFeaturesEnabled !==
            nextRunState.experimentalFeaturesEnabled
          ) {
            updates.experimentalFeaturesEnabled =
              nextRunState.experimentalFeaturesEnabled;
            changed = true;
          }

          return changed ? { ...prev, ...updates } : prev;
        });
        return;
      }
    });

    return unsubscribe;
  }, [
    keyTriggerCharacters,
    resetShapeHistory,
    selectSingleShape,
    setShapesWithoutHistory,
  ]);

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
        setSelectedKeyTriggerTabIds((prev) => {
          if (tabs.length === 0) {
            return prev;
          }

          const tabIdSet = new Set(tabs.map((tab: CharacterTabInfo) => tab.id));
          const preselected = prev.filter((id) => tabIdSet.has(id));
          const loadedSelected = loadSessionSelectedKeyTriggerTabIds();
          const storedSelected = storage.loadKeyTriggerTargetTabIds();
          const toRestore = loadedSelected.filter((id) => tabIdSet.has(id));
          const storedRestore = storedSelected.filter((id) => tabIdSet.has(id));
          const savedNames = new Set([
            ...loadSessionSelectedKeyTriggerTabNames(),
            ...storage.loadKeyTriggerTargetTabNames(),
          ]);
          const nameMatched = tabs
            .filter((tab: CharacterTabInfo) => savedNames.has(tab.name))
            .map((tab: CharacterTabInfo) => tab.id);
          const merged = Array.from(
            new Set([
              ...preselected,
              ...toRestore,
              ...storedRestore,
              ...nameMatched,
            ]),
          );
          return merged.length > 0 ? merged : prev;
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
    const onChange = () => {
      setSystemThemeRefreshVersion((prev) => prev + 1);
    };
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

    if (settings.editMode || !autoStopSec || autoStopSec <= 0) {
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

      // If stop signal has an owner tab, only that tab should notify.
      if (current.stopSignalBy && current.stopSignalBy !== tabId) {
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
        {
          dedupeKey: `auto-stop:${signalId}`,
          dedupeWindowMs: 60_000,
          mobilePush: {
            enabled: settings.mobilePushEnabled,
            discordBotUrl: settings.mobilePushDiscordBotUrl,
            discordUserId: settings.mobilePushDiscordUserId,
            discordApiKey: settings.mobilePushDiscordApiKey,
          },
        },
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

      setAutoStopCountdown(Math.ceil(remaining));
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
  }, [
    settings.editMode,
    settings.autoStopSeconds,
    settings.mobilePushEnabled,
    settings.mobilePushDiscordBotUrl,
    settings.mobilePushDiscordUserId,
    settings.mobilePushDiscordApiKey,
  ]);

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
          {
            dedupeKey: `recaptcha-stop:${signal.signalId}`,
            dedupeWindowMs: 60_000,
            mobilePush: {
              enabled: settings.mobilePushEnabled,
              discordBotUrl: settings.mobilePushDiscordBotUrl,
              discordUserId: settings.mobilePushDiscordUserId,
              discordApiKey: settings.mobilePushDiscordApiKey,
            },
          },
        );
        return;
      }

      void showBrowserNotification(
        "Flyff Utility - CAPTCHA detected",
        "A reCAPTCHA or hCaptcha element was found on the page.",
        {
          dedupeKey: `recaptcha-detected:${signal.signalId}`,
          dedupeWindowMs: 60_000,
          mobilePush: {
            enabled: settings.mobilePushEnabled,
            discordBotUrl: settings.mobilePushDiscordBotUrl,
            discordUserId: settings.mobilePushDiscordUserId,
            discordApiKey: settings.mobilePushDiscordApiKey,
          },
        },
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
      } else if (signalRaised) {
        // CAPTCHA disappeared — reset so the next CAPTCHA occurrence can be detected
        signalRaised = false;
        recaptchaLastHandledSignalRef.current = "";
        const current = readSharedRecaptchaSignal();
        if (current.detectedBy === tabId) {
          writeSharedRecaptchaSignal(getDefaultSharedRecaptchaSignal());
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    requestNotificationPermission();
    window.addEventListener("storage", onSharedRecaptchaSignal);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onSharedRecaptchaSignal);
    };
  }, [
    settings.notifyOnRecaptcha,
    settings.stopOnRecaptcha,
    settings.editMode,
    settings.mobilePushEnabled,
    settings.mobilePushDiscordBotUrl,
    settings.mobilePushDiscordUserId,
    settings.mobilePushDiscordApiKey,
  ]);

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
      profileExecutionScope?: "all" | "current" | "other" | "specific",
      profileSpecificTargetTabIds?: number[],
      profileSpecificTargetTabId?: number | null,
    ): number[] => {
      const allTargetTabIds = getKeyTriggerTargetTabIds();

      const actionScope =
        action.executionScope === "current" ||
        action.executionScope === "other" ||
        action.executionScope === "specific"
          ? action.executionScope
          : action.otherTabsOnly === true
            ? "other"
            : action.currentTabOnly === true
              ? "current"
              : "all";

      if (actionScope === "specific") {
        const scopedIds = Array.from(
          new Set(
            (action.specificTargetTabIds ?? []).filter((id) =>
              Number.isFinite(id),
            ),
          ),
        );
        if (scopedIds.length > 0) {
          const selectedTabSet = new Set(allTargetTabIds);
          return scopedIds.filter((id) => selectedTabSet.has(id));
        }
      }

      if (profileExecutionScope === "specific") {
        const scopedIds = Array.from(
          new Set(
            (profileSpecificTargetTabIds ?? []).filter((id) =>
              Number.isFinite(id),
            ),
          ),
        );
        const selectedTabSet = new Set(allTargetTabIds);
        if (scopedIds.length > 0) {
          return scopedIds.filter((id) => selectedTabSet.has(id));
        }

        if (Number.isFinite(profileSpecificTargetTabId)) {
          return selectedTabSet.has(profileSpecificTargetTabId as number)
            ? [profileSpecificTargetTabId as number]
            : [];
        }
        return [];
      }

      if (actionScope === "other") {
        // Return all selected tabs except the current one
        if (currentTabId === null) {
          return allTargetTabIds;
        }
        return allTargetTabIds.filter((tabId) => tabId !== currentTabId);
      }

      if (actionScope === "current") {
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

  const isActionEnabled = useCallback(
    (action: KeyTriggerAction) => action.enabled !== false,
    [],
  );

  const executeTriggeredKeyTriggerProfiles = useCallback(
    (
      triggeredProfiles: KeyTriggerProfile[],
      chainDepth = 0,
      inheritedDelayMode?: "sequential" | "synchronous",
    ) => {
      if (
        triggeredProfiles.length === 0 ||
        chainDepth > MAX_KEY_TRIGGER_CHAIN_DEPTH
      ) {
        return;
      }

      if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
        return;
      }

      const toggleProfiles = triggeredProfiles.filter(
        (profile) => profile.triggerType === "toggle",
      );
      const runProfiles = triggeredProfiles.filter(
        (profile) => profile.triggerType !== "toggle",
      );

      toggleProfiles.forEach((profile) => {
        const actionsByTabIds = new Map<string, KeyTriggerAction[]>();

        profile.actions.forEach((action) => {
          if (!isActionEnabled(action)) {
            return;
          }

          const tabIds = getTabIdsForAction(
            action,
            profile.currentTabOnly,
            profile.otherTabsOnly,
            profile.executionScope,
            profile.specificTargetTabIds,
            profile.specificTargetTabId,
          );
          const key = JSON.stringify(tabIds);
          const existing = actionsByTabIds.get(key) ?? [];
          actionsByTabIds.set(key, [...existing, action]);
        });

        actionsByTabIds.forEach((actions, tabIdsJson) => {
          const tabIds = JSON.parse(tabIdsJson) as number[];
          if (tabIds.length === 0 || actions.length === 0) {
            return;
          }

          const normalizedTabIds = [...tabIds].sort((a, b) => a - b);
          const scopedToggleProfileId = `${profile.id}::${normalizedTabIds.join(",")}`;

          void safeSendRuntimeMessage({
            type: "KEY_TRIGGER_TOGGLE",
            profileId: scopedToggleProfileId,
            tabIds,
            actions,
            chainDepth,
            delayMode: inheritedDelayMode ?? profile.delayMode,
            lockToTab: profile.lockToTab === true,
          });
        });
      });

      runProfiles.forEach((profile) => {
        const actionsByTabIds = new Map<string, KeyTriggerAction[]>();
        const runCount =
          profile.triggerType === "repeat"
            ? normalizeKeyTriggerRunCount(profile.repeatCount, 2)
            : 1;

        profile.actions.forEach((action) => {
          if (!isActionEnabled(action)) {
            return;
          }

          const tabIds = getTabIdsForAction(
            action,
            profile.currentTabOnly,
            profile.otherTabsOnly,
            profile.executionScope,
            profile.specificTargetTabIds,
            profile.specificTargetTabId,
          );
          const key = JSON.stringify(tabIds);
          const existing = actionsByTabIds.get(key) ?? [];
          actionsByTabIds.set(key, [...existing, action]);
        });

        actionsByTabIds.forEach((actions, tabIdsJson) => {
          const tabIds = JSON.parse(tabIdsJson) as number[];
          if (tabIds.length === 0 || actions.length === 0) {
            return;
          }

          void safeSendRuntimeMessage({
            type: "KEY_TRIGGER_RUN_ONCE",
            profileId: profile.id,
            tabIds,
            actions,
            chainDepth,
            runCount,
            delayMode: inheritedDelayMode ?? profile.delayMode,
          });
        });
      });
    },
    [getTabIdsForAction, isActionEnabled],
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
      options?: {
        emitModifierKeyEvents?: boolean;
        sendKeyUp?: boolean;
      },
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
        if (options?.sendKeyUp !== false) {
          target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
        }
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
      if (options?.sendKeyUp !== false) {
        target.dispatchEvent(
          new KeyboardEvent("keyup", {
            ...eventInit,
            bubbles: true,
            cancelable: true,
            repeat: false,
            ...required,
          }),
        );
      }

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

  const dispatchKeyboardKeyUpToCanvas = useCallback(
    (eventInit: KeyboardEventInit) => {
      const canvas = document.querySelector("canvas") as HTMLElement | null;
      const target =
        canvas ?? (document.activeElement as HTMLElement | null) ?? window;

      if (canvas && document.activeElement !== canvas) {
        if (canvas.tabIndex < 0) {
          canvas.tabIndex = -1;
        }
        canvas.focus({ preventScroll: true });
      }

      target.dispatchEvent(
        new KeyboardEvent("keyup", {
          ...eventInit,
          bubbles: true,
          cancelable: true,
          repeat: false,
        }),
      );
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

  const dispatchPlainKeyChordToCanvas = useCallback(
    (bindings: string[]): boolean => {
      const parsed = bindings
        .map((binding) => {
          const parts = binding
            .split("+")
            .map((part) => part.trim())
            .filter(Boolean);

          if (parts.length === 0) {
            return null;
          }

          const modifiers = {
            ctrlKey: parts.some((part) => /^(ctrl|control)$/i.test(part)),
            altKey: parts.some((part) => /^alt$/i.test(part)),
            shiftKey: parts.some((part) => /^shift$/i.test(part)),
            metaKey: parts.some((part) => /^(meta|cmd|command)$/i.test(part)),
          };

          // Keep chord dispatch focused on plain keys so it mirrors
          // multi-finger key presses without modifier ambiguity.
          if (
            modifiers.ctrlKey ||
            modifiers.altKey ||
            modifiers.shiftKey ||
            modifiers.metaKey
          ) {
            return null;
          }

          const key =
            parts.find(
              (part) =>
                !/^(ctrl|control|alt|shift|meta|cmd|command)$/i.test(part),
            ) ?? "";

          if (!key || isMouseWheelShortcutToken(key)) {
            return null;
          }

          const resolved = resolveDispatchKey(key, false);
          if (!resolved) {
            return null;
          }

          return {
            key: resolved.key,
            code: resolved.code,
          };
        })
        .filter(
          (entry): entry is { key: string; code: string } => entry !== null,
        );

      if (parsed.length < 2) {
        return false;
      }

      const canvas = document.querySelector("canvas") as HTMLElement | null;
      const target =
        canvas ?? (document.activeElement as HTMLElement | null) ?? window;

      if (canvas && document.activeElement !== canvas) {
        if (canvas.tabIndex < 0) {
          canvas.tabIndex = -1;
        }
        canvas.focus({ preventScroll: true });
      }

      parsed.forEach((entry) => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: entry.key,
            code: entry.code,
            bubbles: true,
            cancelable: true,
            repeat: false,
          }),
        );
      });

      [...parsed].reverse().forEach((entry) => {
        target.dispatchEvent(
          new KeyboardEvent("keyup", {
            key: entry.key,
            code: entry.code,
            bubbles: true,
            cancelable: true,
            repeat: false,
          }),
        );
      });

      return true;
    },
    [resolveDispatchKey],
  );

  const dispatchKeyTriggerKey = useCallback(
    (
      binding: string,
      options?: {
        sourceProfileId?: string;
        chainDepth?: number;
        delayMode?: "sequential" | "synchronous";
      },
    ) => {
      const normalizedBinding = normalizeShortcutBinding(binding);
      const sourceProfileId = options?.sourceProfileId
        ? getOriginalKeyTriggerProfileId(options.sourceProfileId)
        : null;
      const chainDepth = Math.max(
        0,
        Math.round(Number(options?.chainDepth ?? 0) || 0),
      );

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

        if (chainDepth < MAX_KEY_TRIGGER_CHAIN_DEPTH) {
          const triggeredProfiles = keyTriggerProfiles.filter((profile) => {
            if (profile.enabled === false || !profile.triggerKey) {
              return false;
            }

            if (sourceProfileId && profile.id === sourceProfileId) {
              return false;
            }

            const normalizedTriggerKey = normalizeShortcutBinding(
              profile.triggerKey,
            );
            return normalizedTriggerKey === normalizedBinding;
          });

          if (triggeredProfiles.length > 0) {
            executeTriggeredKeyTriggerProfiles(
              triggeredProfiles,
              chainDepth + 1,
              options?.delayMode,
            );
          }
        }
      }

      isDispatchingKeyTriggerRef.current = true;
      try {
        dispatchBindingToCanvas(binding);
      } finally {
        isDispatchingKeyTriggerRef.current = false;
      }
    },
    [
      dispatchBindingToCanvas,
      executeTriggeredKeyTriggerProfiles,
      keyTriggerProfiles,
      settings,
      shapes,
    ],
  );

  const dispatchKeyTriggerBindingsAtSameTiming = useCallback(
    (
      bindings: string[],
      options?: {
        sourceProfileId?: string;
        chainDepth?: number;
        delayMode?: "sequential" | "synchronous";
      },
    ) => {
      const sourceProfileId = options?.sourceProfileId
        ? getOriginalKeyTriggerProfileId(options.sourceProfileId)
        : null;
      const chainDepth = Math.max(
        0,
        Math.round(Number(options?.chainDepth ?? 0) || 0),
      );
      const delayMode = options?.delayMode ?? "sequential";

      // Collect matching shapes by array index so duplicate IDs still trigger.
      const shapesToTrigger = new Set<number>();
      const plainChordBindings: string[] = [];
      const individualBindings: string[] = [];

      bindings.forEach((binding) => {
        const normalizedBinding = normalizeShortcutBinding(binding);
        let foundShape = false;

        shapes.forEach((shape, shapeIndex) => {
          if (!shape.keyBinding) return;
          if (getReservedShapeShortcutUsage(shape.keyBinding, settings)) return;
          if (
            normalizeShortcutBinding(shape.keyBinding) === normalizedBinding
          ) {
            shapesToTrigger.add(shapeIndex);
            foundShape = true;
          }
        });

        const hasProfileMatch =
          chainDepth < MAX_KEY_TRIGGER_CHAIN_DEPTH &&
          keyTriggerProfiles.some((profile) => {
            if (profile.enabled === false || !profile.triggerKey) {
              return false;
            }
            if (sourceProfileId && profile.id === sourceProfileId) {
              return false;
            }
            return (
              normalizeShortcutBinding(profile.triggerKey) === normalizedBinding
            );
          });

        const parts = binding
          .split("+")
          .map((part) => part.trim())
          .filter(Boolean);
        const hasModifier = parts.some((part) =>
          /^(ctrl|control|alt|shift|meta|cmd|command)$/i.test(part),
        );

        if (foundShape) {
          return;
        }

        if (!hasProfileMatch && !hasModifier) {
          plainChordBindings.push(binding);
          return;
        }

        // Keep non-plain bindings on the regular path (profiles, modified keys)
        // so Ctrl+D never falls through as plain D behavior.
        individualBindings.push(binding);
      });

      // Trigger all unique shapes for this batch
      if (shapesToTrigger.size > 0) {
        shapesToTrigger.forEach((shapeIndex) => {
          const shape = shapes[shapeIndex];
          if (shape) {
            triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
          }
        });
      }

      if (individualBindings.length > 0) {
        individualBindings.forEach((binding) => {
          dispatchKeyTriggerKey(binding, {
            sourceProfileId: sourceProfileId ?? undefined,
            chainDepth,
            delayMode,
          });
        });
      }

      if (plainChordBindings.length === 0) {
        return;
      }

      if (plainChordBindings.length === 1) {
        dispatchKeyTriggerKey(plainChordBindings[0], {
          sourceProfileId: sourceProfileId ?? undefined,
          chainDepth,
          delayMode,
        });
        return;
      }

      isDispatchingKeyTriggerRef.current = true;
      try {
        const dispatched = dispatchPlainKeyChordToCanvas(plainChordBindings);
        if (!dispatched) {
          plainChordBindings.forEach((binding) => {
            dispatchKeyTriggerKey(binding, {
              sourceProfileId: sourceProfileId ?? undefined,
              chainDepth,
              delayMode,
            });
          });
        }
      } finally {
        isDispatchingKeyTriggerRef.current = false;
      }
    },
    [
      dispatchKeyTriggerKey,
      dispatchPlainKeyChordToCanvas,
      keyTriggerProfiles,
      settings,
      shapes,
    ],
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
          // Blob-backed workers avoid cross-origin SecurityError in content scripts.
          workerBlobURL: true,
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
          // Blob-backed workers avoid cross-origin SecurityError in content scripts.
          workerBlobURL: true,
        });
        if (typeof worker.setParameters === "function") {
          const singleBlockPsm =
            typeof (module as { PSM?: { SINGLE_BLOCK?: unknown } }).PSM
              ?.SINGLE_BLOCK === "number"
              ? Number(
                  (module as { PSM?: { SINGLE_BLOCK?: unknown } }).PSM
                    ?.SINGLE_BLOCK,
                )
              : 6;
          await worker.setParameters({
            // 6 = SINGLE_BLOCK; use numeric fallback when enum export shape changes.
            tessedit_pageseg_mode: singleBlockPsm as any,
            tessedit_char_whitelist:
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+.% ",
          });
        }
        awakenOcrWorkerRef.current = worker;
        return worker;
      } catch (error) {
        console.error("[Auto-Awaken] OCR worker init failed", error);
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
    if (autoAwakenTemporaryShapeClearTimerRef.current !== null) {
      window.clearTimeout(autoAwakenTemporaryShapeClearTimerRef.current);
      autoAwakenTemporaryShapeClearTimerRef.current = null;
    }
    setAutoAwakenTemporaryShape(null);
  }, []);

  useEffect(() => {
    if (accessControl.loading) {
      return;
    }

    if (accessControl.hasToolAccess) {
      accessLockHandledRef.current = false;
      return;
    }

    if (accessLockHandledRef.current) {
      return;
    }

    accessLockHandledRef.current = true;

    // Force-stop active runtime loops when access is revoked mid-run.
    stopAllToggleShapeAreas();
    clearAllKeyTriggerTimers();
    stopAutoAwakenLoop();

    if (typeof chrome !== "undefined" && chrome.runtime) {
      void safeSendRuntimeMessage({ type: "KEY_TRIGGER_STOP_ALL" });
    }

    setSettings((prev) => {
      if (
        prev.editMode &&
        !prev.autoHoly.enabled &&
        !prev.autoPills.enabled &&
        !prev.experimentalFeaturesEnabled &&
        !prev.syncMouseEvents
      ) {
        return prev;
      }

      return {
        ...prev,
        editMode: true,
        syncMouseEvents: false,
        autoHoly: {
          ...prev.autoHoly,
          enabled: false,
        },
        autoPills: {
          ...prev.autoPills,
          enabled: false,
        },
      };
    });
  }, [
    accessControl.hasToolAccess,
    accessControl.loading,
    clearAllKeyTriggerTimers,
    stopAutoAwakenLoop,
  ]);

  useEffect(() => {
    if (!settings.experimentalFeaturesEnabled && autoAwakenRunningRef.current) {
      stopAutoAwakenLoop();
    }
  }, [settings.experimentalFeaturesEnabled, stopAutoAwakenLoop]);

  const startAutoAwakenLoop = useCallback(
    async (mode?: "reawaken") => {
      let canStartAutoAwaken = canUseAutoAwaken;

      if (!canStartAutoAwaken) {
        const refreshedAccess = await refreshAccessControl(
          latestSettingsRef.current.subscriptionAccessToken,
        );
        canStartAutoAwaken =
          refreshedAccess.hasToolAccess && refreshedAccess.features.autoAwaken;
      }

      if (!canStartAutoAwaken) {
        message.warning(
          "Your current subscription plan does not include Auto-Awaken.",
        );
        return;
      }

      if (autoAwakenRunningRef.current) return;

      autoAwakenRunningRef.current = true;
      setAutoAwakenRunning(true);
      setAutoAwakenStatus(
        mode === "reawaken"
          ? "🔄 Re-awakening..."
          : "🔍 Searching for Start button...",
      );
      setAutoAwakenLogs([]);
      setAutoAwakenTemporaryShape(null);

      const MAX_LOG = 120;
      const addLog = (line: string) => {
        const ts = new Date().toLocaleTimeString();
        setAutoAwakenLogs((prev) => [
          ...prev.slice(-(MAX_LOG - 1)),
          `[${ts}] ${line}`,
        ]);
      };

      const worker = await ensureAwakenOcrWorker();
      if (!worker) {
        setAutoAwakenStatus("OCR worker failed to init. Check console logs.");
        autoAwakenRunningRef.current = false;
        setAutoAwakenRunning(false);
        setAutoAwakenTemporaryShape(null);
        return;
      }

      setAutoAwakenStatus("🔍 Searching for Start button...");

      // Load both Start button reference templates at startup.
      const buttonTemplates: Array<{
        label: "button_image.png" | "button_image2.png";
        image: RgbImageData;
      }> = [];
      try {
        const buttonSrc = chrome.runtime.getURL("button_image.png");
        const template = await loadRgbImageDataFromSrc(buttonSrc);
        buttonTemplates.push({ label: "button_image.png", image: template });
      } catch {
        addLog("Warning: could not load a Start button reference image.");
      }

      try {
        const buttonSrc2 = chrome.runtime.getURL("button_image2.png");
        const template2 = await loadRgbImageDataFromSrc(buttonSrc2);
        buttonTemplates.push({ label: "button_image2.png", image: template2 });
      } catch {
        addLog("Warning: could not load a secondary Start button reference.");
      }

      if (buttonTemplates.length === 0) {
        addLog("Warning: no Start button references loaded - click disabled.");
      }

      addLog("Automation started.");
      let waitingForButtonReappear = false;
      const pause = (ms: number) =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, ms);
        });
      const OCR_SETTLE_MAX_POLL = 5;
      const OCR_SETTLE_INTERVAL_MS = 280;
      const OCR_SETTLE_REQUIRED_STABLE_COUNT = 2;
      const CLICK_ATTEMPT_COUNT = 5;
      const CLICK_RETRY_SETTLE_MS = 420;
      const OCR_RETRY_COOLDOWN_MS = 1200;
      const WAIT_POLL_IDLE_MS = 330;
      const WAIT_POLL_DISAPPEAR_MS = 300;
      const WAIT_POLL_REAPPEAR_MS = 330;
      const ENABLE_FULL_REGION_OCR_LOGS = false;
      let ocrCycleCount = 0;
      let nextOcrAllowedAt = 0;

      addLog(
        "Auto-Awaken click mode: temporary key-mapper shape trigger (non-persistent).",
      );

      /**
       * Dispatch a click using a temporary in-memory shape that never touches
       * profiles, storage, or clipboard.
       */
      const clickViewport = async (
        vx: number,
        vy: number,
        shapeSize?: { width: number; height: number },
      ) => {
        const width = Math.max(14, Math.round(shapeSize?.width ?? 72));
        const height = Math.max(10, Math.round(shapeSize?.height ?? 28));

        const shapeX = Math.max(
          0,
          Math.min(window.innerWidth - width, Math.round(vx - width / 2)),
        );
        const shapeY = Math.max(
          0,
          Math.min(window.innerHeight - height, Math.round(vy - height / 2)),
        );

        const temporaryShape: ShapeMapping = {
          id: `auto-awaken-temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: "rectangle",
          x: shapeX,
          y: shapeY,
          width,
          height,
          rotation: 0,
          opacity: 0.32,
          keyBinding: "",
          delayMs: 0,
          triggerType: "once",
        };

        setAutoAwakenTemporaryShape(temporaryShape);
        if (autoAwakenTemporaryShapeClearTimerRef.current !== null) {
          window.clearTimeout(autoAwakenTemporaryShapeClearTimerRef.current);
        }
        autoAwakenTemporaryShapeClearTimerRef.current = window.setTimeout(
          () => {
            setAutoAwakenTemporaryShape((prev) =>
              prev?.id === temporaryShape.id ? null : prev,
            );
            autoAwakenTemporaryShapeClearTimerRef.current = null;
          },
          900,
        );

        triggerShapeArea(temporaryShape, { x: vx, y: vy });

        return {
          tagName: "CANVAS",
          isCanvas: true,
          clicked: true,
          method: "mapper-shape" as const,
          nativeError: undefined as string | undefined,
        };
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

      const buildScaledCanvasFromRgbImage = (
        image: RgbImageData,
        scale: number,
      ): HTMLCanvasElement | null => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }

        const bitmapCanvas = document.createElement("canvas");
        bitmapCanvas.width = image.width;
        bitmapCanvas.height = image.height;
        const bitmapCtx = bitmapCanvas.getContext("2d");
        if (!bitmapCtx) {
          return null;
        }

        bitmapCtx.putImageData(
          new ImageData(
            new Uint8ClampedArray(image.rgb),
            image.width,
            image.height,
          ),
          0,
          0,
        );

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmapCanvas, 0, 0, canvas.width, canvas.height);
        return canvas;
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

      const normalizeAwakenOcrLine = (line: string): string =>
        line
          .replace(/[|!]/g, "I")
          .replace(/[“”"'`~_^=<>]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const extractBestAwakenStatLine = (text: string): string => {
        const normalizedText = text.replace(/\r/g, "\n");
        const rawLines = normalizedText
          .split(/\n+/)
          .map((line) => normalizeAwakenOcrLine(line))
          .filter((line) => line.length > 0);

        const candidates =
          rawLines.length > 0 ? rawLines : [normalizeAwakenOcrLine(text)];

        let bestLine = "";
        let bestScore = -1;
        for (const line of candidates) {
          let score = 0;
          if (/[A-Za-z]{3,}/.test(line)) score += 2;
          if (/\+\s*\d+/.test(line)) score += 5;
          if (/\d+\s*%/.test(line)) score += 4;
          if (
            /(attack|resist|speed|damage|block|defense|chance|max\.?\s*(hp|mp)|str|dex|int|sta)/i.test(
              line,
            )
          ) {
            score += 2;
          }
          if (line.length >= 6 && line.length <= 42) score += 1;

          if (score > bestScore) {
            bestScore = score;
            bestLine = line;
          }
        }

        return bestLine || normalizeAwakenOcrLine(text);
      };

      type AwakenOcrResult = {
        bestText: string;
        detectedTexts: string[];
      };

      const recognizeAwakenPanelText = async (
        image: RgbImageData,
        hintNames: string[],
        options?: {
          singleLine?: boolean;
        },
      ): Promise<AwakenOcrResult> => {
        const ocrScale = options?.singleLine ? 5 : 3;
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = image.width * ocrScale;
        cropCanvas.height = image.height * ocrScale;
        const ctx = cropCanvas.getContext("2d");

        const nativeCanvas = document.createElement("canvas");
        nativeCanvas.width = image.width * ocrScale;
        nativeCanvas.height = image.height * ocrScale;
        const nativeCtx = nativeCanvas.getContext("2d");

        if (!ctx || !nativeCtx) {
          return {
            bestText: "",
            detectedTexts: [],
          };
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
        ];

        let bestText = "";
        let bestScore = -1;
        const detectedTexts: string[] = [];

        for (const candidate of candidates) {
          const picked = extractBestAwakenStatLine(candidate);
          if (picked) {
            detectedTexts.push(picked);
          }
          const score = scorePanelOcrCandidate(picked, hintNames);
          if (score > bestScore) {
            bestText = picked;
            bestScore = score;
          }
        }

        for (const variant of variants) {
          const processed = buildBinaryVariant(
            variant.threshold,
            variant.brightTextMask,
          );
          ctx.putImageData(processed, 0, 0);
          const result = await worker.recognize(cropCanvas, {
            tessedit_char_whitelist:
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+% .\\n",
            preserve_interword_spaces: "1",
            tessedit_pageseg_mode: options?.singleLine ? "7" : "6",
          });
          const text =
            typeof result?.data?.text === "string" ? result.data.text : "";
          const picked = extractBestAwakenStatLine(text);
          if (picked) {
            detectedTexts.push(picked);
          }
          const score = scorePanelOcrCandidate(picked, hintNames);
          if (score > bestScore) {
            bestText = picked;
            bestScore = score;
          }
          if (score >= 7) {
            break;
          }
        }

        return {
          bestText,
          detectedTexts: Array.from(
            new Set(detectedTexts.map((text) => text.trim()).filter(Boolean)),
          ),
        };
      };

      const recognizeAwakenResultText = async (
        regionImage: RgbImageData,
        side: "left" | "right",
        hintNames: string[],
      ): Promise<AwakenOcrResult> => {
        const baseX = side === "left" ? 0.028 : 0.526;
        const focusedResultLineVariants = [
          { x: baseX + 0.012, y: 0.86, width: 0.424, height: 0.09 },
          { x: baseX + 0.02, y: 0.875, width: 0.408, height: 0.075 },
          { x: baseX + 0.004, y: 0.842, width: 0.436, height: 0.108 },
        ];

        const broaderPanelVariants = [
          { x: baseX, y: 0.79, width: 0.448, height: 0.11 },
          { x: baseX + 0.004, y: 0.77, width: 0.44, height: 0.14 },
          { x: baseX + 0.012, y: 0.815, width: 0.42, height: 0.085 },
        ];

        let bestText = "";
        let bestScore = -1;
        const allDetectedTexts: string[] = [];

        const tryVariants = async (
          variants: Array<{
            x: number;
            y: number;
            width: number;
            height: number;
          }>,
          singleLine: boolean,
        ) => {
          for (const variant of variants) {
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

            const panelOcr = await recognizeAwakenPanelText(crop, hintNames, {
              singleLine,
            });
            allDetectedTexts.push(...panelOcr.detectedTexts);
            const text = panelOcr.bestText;
            const scoreBoost =
              (/\+\s*\d+/.test(text) ? 4 : 0) + (/\d+\s*%/.test(text) ? 3 : 0);
            const score = scorePanelOcrCandidate(text, hintNames) + scoreBoost;
            if (score > bestScore) {
              bestText = text;
              bestScore = score;
            }
            if (score >= 9) {
              return;
            }
          }
        };

        await tryVariants(focusedResultLineVariants, true);
        if (bestScore < 8) {
          await tryVariants(broaderPanelVariants, false);
        }

        return {
          bestText,
          detectedTexts: Array.from(
            new Set(
              allDetectedTexts.map((text) => text.trim()).filter(Boolean),
            ),
          ),
        };
      };

      const recognizeAllAwakenTextsInRegion = async (
        regionImage: RgbImageData,
      ): Promise<string[]> => {
        const regionCanvas = buildScaledCanvasFromRgbImage(regionImage, 2);
        if (!regionCanvas) {
          return [];
        }

        const lines: string[] = [];
        const nativeRegionText = await detectTextWithNativeApi(regionCanvas);
        if (nativeRegionText) {
          nativeRegionText
            .split(/\n+/)
            .map((line: string) => normalizeAwakenOcrLine(line))
            .filter(Boolean)
            .forEach((line: string) => lines.push(line));
        }

        try {
          const result = await worker.recognize(regionCanvas, {
            tessedit_char_whitelist:
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+% .\\n",
            preserve_interword_spaces: "1",
            tessedit_pageseg_mode: "6",
          });

          const rawText =
            typeof result?.data?.text === "string" ? result.data.text : "";
          rawText
            .split(/\n+/)
            .map((line: string) => normalizeAwakenOcrLine(line))
            .filter(Boolean)
            .forEach((line: string) => lines.push(line));
        } catch {
          // Keep native lines when Tesseract fails.
        }

        return Array.from(new Set(lines));
      };

      const extractAwakenValueToken = (text: string): string | null => {
        const normalized = text.replace(/\s+/g, " ").trim();
        if (!normalized) {
          return null;
        }

        const plusMatch = normalized.match(/[+#]\s*\d+(?:\.\d+)?\s*%?/);
        if (plusMatch?.[0]) {
          return plusMatch[0].replace(/\s+/g, "");
        }

        const percentMatch = normalized.match(/\d+(?:\.\d+)?\s*%/);
        if (percentMatch?.[0]) {
          return percentMatch[0].replace(/\s+/g, "");
        }

        const numberMatch = normalized.match(/\d+(?:\.\d+)?/);
        if (numberMatch?.[0]) {
          return numberMatch[0];
        }

        return null;
      };

      type AwakenRegionSnapshot = {
        fullImg: RgbImageData;
        cropRect: { x: number; y: number; width: number; height: number };
        normalizedRegion: NormalizedRect;
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

        const targetMatchWidth = Math.min(
          AUTO_AWAKEN_MATCH_MAX_WIDTH,
          Math.max(
            900,
            Math.round(
              window.innerWidth *
                Math.max(1, Math.min(window.devicePixelRatio || 1, 1.5)),
            ),
          ),
        );
        const fullImg = await loadRgbImageDataFromSrc(
          screenshot,
          targetMatchWidth,
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
          normalizedRegion: scanRegion,
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
        let missingPollCount = 0;

        while (autoAwakenRunningRef.current) {
          const snapshot = await captureAwakenRegionSnapshot(cfg);
          if (!snapshot) {
            if (phase === "disappear") {
              setAutoAwakenStatus("⏳ Waiting for reroll...");
            } else if (phase === "reappear") {
              setAutoAwakenStatus("⏳ Waiting for Start button to reappear...");
            } else {
              setAutoAwakenStatus("🔍 Waiting for Start button...");
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
              missingPollCount = 0;
              addLog("Start button visible - reading current result.");
              return snapshot;
            }
            missingPollCount += 1;
            if (missingPollCount === 1) {
              addLog("Start button not visible. Waiting for it to appear...");
            } else if (missingPollCount % 12 === 0) {
              addLog(
                `Start template not matched yet. Retrying region screenshot match (${missingPollCount} polls).`,
              );
            }
            phase = "reappear";
            setAutoAwakenStatus("🔍 Waiting for Start button...");
            await new Promise((r) => setTimeout(r, WAIT_POLL_IDLE_MS));
            continue;
          }

          if (phase === "disappear") {
            if (!buttonVisible) {
              missingPollCount = 0;
              addLog("Start button disappeared - reroll in progress.");
              setAutoAwakenStatus("⏳ Waiting for reroll...");
              phase = "reappear";
              await new Promise((r) => setTimeout(r, WAIT_POLL_DISAPPEAR_MS));
              continue;
            }
            // Button still visible – not gone yet, keep polling
            setAutoAwakenStatus("⏳ Waiting for reroll...");
            await new Promise((r) => setTimeout(r, WAIT_POLL_DISAPPEAR_MS));
            continue;
          }

          // phase === "reappear"
          if (buttonVisible) {
            missingPollCount = 0;
            addLog(
              "Start button reappeared - reroll finished. Reading settled result.",
            );
            waitingForButtonReappear = false;
            return snapshot;
          }

          missingPollCount += 1;
          if (missingPollCount % 12 === 0) {
            addLog(
              `Still waiting for Start template. Retrying region screenshot match (${missingPollCount} polls).`,
            );
          }

          setAutoAwakenStatus("⏳ Waiting for Start button to reappear...");
          await new Promise((r) => setTimeout(r, WAIT_POLL_REAPPEAR_MS));
        }

        return null;
      };

      const computeAwakenRegionDiff = (
        previous: RgbImageData,
        current: RgbImageData,
      ): number => {
        const width = Math.min(previous.width, current.width);
        const height = Math.min(previous.height, current.height);
        if (width < 4 || height < 4) {
          return 999;
        }

        const startY = Math.max(0, Math.floor(height * 0.64));
        const endY = Math.min(height - 1, Math.ceil(height * 0.95));
        const stepX = Math.max(1, Math.floor(width / 44));
        const stepY = Math.max(1, Math.floor((endY - startY + 1) / 18));

        let diffSum = 0;
        let sampleCount = 0;

        for (let y = startY; y <= endY; y += stepY) {
          for (let x = 0; x < width; x += stepX) {
            const prevIndex = (y * previous.width + x) * 4;
            const currIndex = (y * current.width + x) * 4;
            const prevGray =
              previous.rgb[prevIndex] * 0.299 +
              previous.rgb[prevIndex + 1] * 0.587 +
              previous.rgb[prevIndex + 2] * 0.114;
            const currGray =
              current.rgb[currIndex] * 0.299 +
              current.rgb[currIndex + 1] * 0.587 +
              current.rgb[currIndex + 2] * 0.114;
            diffSum += Math.abs(prevGray - currGray);
            sampleCount += 1;
          }
        }

        return sampleCount > 0 ? diffSum / sampleCount : 999;
      };

      const waitForAwakenResultToSettle = async (
        seedSnapshot: AwakenRegionSnapshot,
        cfg: typeof latestSettingsRef.current.autoAwaken,
      ): Promise<AwakenRegionSnapshot | null> => {
        let stableCount = 0;
        let latestSnapshot: AwakenRegionSnapshot | null = seedSnapshot;

        for (
          let pollIndex = 0;
          pollIndex < OCR_SETTLE_MAX_POLL && autoAwakenRunningRef.current;
          pollIndex += 1
        ) {
          await pause(OCR_SETTLE_INTERVAL_MS);
          const nextSnapshot = await captureAwakenRegionSnapshot(cfg);
          if (!nextSnapshot || !latestSnapshot) {
            stableCount = 0;
            latestSnapshot = nextSnapshot;
            continue;
          }

          const regionDiff = computeAwakenRegionDiff(
            latestSnapshot.regionImg,
            nextSnapshot.regionImg,
          );
          const buttonDrift =
            latestSnapshot.buttonMatch && nextSnapshot.buttonMatch
              ? Math.hypot(
                  latestSnapshot.buttonMatch.x - nextSnapshot.buttonMatch.x,
                  latestSnapshot.buttonMatch.y - nextSnapshot.buttonMatch.y,
                )
              : 0;
          const isStable = regionDiff < 5.4 && buttonDrift <= 4;
          stableCount = isStable ? stableCount + 1 : 0;
          latestSnapshot = nextSnapshot;

          if (stableCount >= OCR_SETTLE_REQUIRED_STABLE_COUNT) {
            return latestSnapshot;
          }
        }

        return latestSnapshot;
      };

      const clickAwakenButtonFromSnapshot = async (
        snapshot: AwakenRegionSnapshot,
        match: AwakenButtonMatch,
        reason: "initial" | "reroll",
      ): Promise<boolean> => {
        const { cropRect, fullImg } = snapshot;
        const scaleX = window.innerWidth / Math.max(1, fullImg.width);
        const scaleY = window.innerHeight / Math.max(1, fullImg.height);
        const baseX = Math.round((cropRect.x + match.x) * scaleX);
        const baseY = Math.round((cropRect.y + match.y) * scaleY);
        const matchedTemplate = match.templateLabel
          ? buttonTemplates.find(
              (template) => template.label === match.templateLabel,
            )
          : null;
        const detectedButtonWidth = Math.max(
          20,
          Math.round(
            (matchedTemplate?.image.width ?? 96) *
              (match.templateLabel ? match.scale : 1) *
              scaleX,
          ),
        );
        const detectedButtonHeight = Math.max(
          10,
          Math.round(
            (matchedTemplate?.image.height ?? 30) *
              (match.templateLabel ? match.scale : 1) *
              scaleY,
          ),
        );
        const clickShapeSize = {
          width: Math.max(24, Math.min(280, detectedButtonWidth)),
          height: Math.max(12, Math.min(120, detectedButtonHeight)),
        };
        const offsetX = Math.max(2, Math.round(clickShapeSize.width * 0.2));
        const offsetY = Math.max(2, Math.round(clickShapeSize.height * 0.2));
        const clickPoints = [
          { x: baseX, y: baseY },
          { x: baseX + offsetX, y: baseY },
          { x: baseX - offsetX, y: baseY },
          { x: baseX, y: baseY + offsetY },
          { x: baseX, y: baseY - offsetY },
          { x: baseX + offsetX, y: baseY + offsetY },
          { x: baseX - offsetX, y: baseY + offsetY },
          { x: baseX + offsetX, y: baseY - offsetY },
          { x: baseX - offsetX, y: baseY - offsetY },
        ]
          .slice(0, CLICK_ATTEMPT_COUNT)
          .map((point) => ({
            x: Math.max(0, Math.min(window.innerWidth - 1, point.x)),
            y: Math.max(0, Math.min(window.innerHeight - 1, point.y)),
          }));

        setAutoAwakenStatus("🔄 Re-awakening...");
        for (
          let attemptIndex = 0;
          attemptIndex < clickPoints.length;
          attemptIndex += 1
        ) {
          if (attemptIndex > 0) {
            addLog("Retrying Start click with adjusted click point.");
          }

          const point = clickPoints[attemptIndex];
          await clickViewport(point.x, point.y, clickShapeSize);

          const shouldLogAttemptDetail = attemptIndex === 0;
          if (shouldLogAttemptDetail) {
            addLog(
              `${reason === "initial" ? "Initial start" : "Stats did not match"}: Start button found at (${point.x}, ${point.y}) via ${match.detectionSource === "text" ? "Start text OCR" : "template match"}; click attempt ${attemptIndex + 1}/${clickPoints.length} using key-mapper shape trigger.`,
            );
          }

          for (let pollIndex = 0; pollIndex < 3; pollIndex += 1) {
            await new Promise((r) => setTimeout(r, 160));
            const verifySnapshot = await captureAwakenRegionSnapshot(
              latestSettingsRef.current.autoAwaken,
            );
            if (!verifySnapshot) {
              continue;
            }

            if (!verifySnapshot.buttonMatch) {
              waitingForButtonReappear = true;
              addLog(
                "Start button click confirmed. Waiting for Start button to disappear and reappear after click...",
              );
              return true;
            }
          }
        }

        addLog(
          "Start button remained visible after click attempts. Region screenshot match did not confirm a valid click yet; retrying.",
        );
        setAutoAwakenStatus("🔍 Waiting for Start button...");
        await pause(CLICK_RETRY_SETTLE_MS);
        return false;
      };

      let initialRerollTriggered = false;
      let initialStartUnconfirmedAttempts = 0;

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

        const settledSnapshot = await waitForAwakenResultToSettle(
          snapshot,
          cfg,
        );
        if (!settledSnapshot) {
          await pause(240);
          continue;
        }

        const { regionImg, buttonMatch } = settledSnapshot;
        if (!buttonMatch && buttonTemplates.length > 0) {
          addLog(
            "Start button not found in region. Tried button_image.png/button_image2.png template match across bottom-center, footer, lower-third, bottom, and full-region passes.",
          );
          await pause(300);
          continue;
        }

        if (
          !initialRerollTriggered &&
          buttonTemplates.length > 0 &&
          buttonMatch
        ) {
          const initialClickStarted = await clickAwakenButtonFromSnapshot(
            settledSnapshot,
            buttonMatch,
            "initial",
          );
          if (initialClickStarted) {
            initialRerollTriggered = true;
            initialStartUnconfirmedAttempts = 0;
            nextOcrAllowedAt = Date.now() + OCR_RETRY_COOLDOWN_MS;
          } else {
            initialStartUnconfirmedAttempts += 1;
            nextOcrAllowedAt = Date.now() + OCR_RETRY_COOLDOWN_MS;
            if (initialStartUnconfirmedAttempts % 2 === 0) {
              addLog(
                "Initial Start click could not be confirmed yet. Retrying Start before OCR.",
              );
            }
          }
          await pause(420);
          continue;
        }

        if (Date.now() < nextOcrAllowedAt) {
          setAutoAwakenStatus("⏳ Waiting for reroll to settle...");
          await pause(220);
          continue;
        }

        // ── OCR – read the bottom result box of each panel ───────────────
        ocrCycleCount += 1;
        addLog("Reading stats from settled result...");
        let stat1OcrText = "";
        let stat2OcrText = "";
        let stat1DetectedTexts: string[] = [];
        let stat2DetectedTexts: string[] = [];
        let allRegionDetectedTexts: string[] = [];
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

          if (ENABLE_FULL_REGION_OCR_LOGS && ocrCycleCount % 3 === 1) {
            allRegionDetectedTexts =
              await recognizeAllAwakenTextsInRegion(regionImg);
          }

          const [stat1Result, stat2Result] = await Promise.all([
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

          stat1OcrText = stat1Result.bestText;
          stat2OcrText = stat2Result.bestText;
          stat1DetectedTexts = stat1Result.detectedTexts;
          stat2DetectedTexts = stat2Result.detectedTexts;
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
        if (ENABLE_FULL_REGION_OCR_LOGS) {
          addLog(
            `Detected texts in full region: ${allRegionDetectedTexts.length > 0 ? allRegionDetectedTexts.join(" | ") : "(none)"}`,
          );
        }
        addLog(
          `OCR Stat 1: ${normalizedStat1OcrText ? `${normalizedStat1OcrText.slice(0, 80)}${normalizedStat1OcrText.length > 80 ? "..." : ""}` : "(empty)"}`,
        );
        addLog(
          `OCR Stat 2: ${normalizedStat2OcrText ? `${normalizedStat2OcrText.slice(0, 80)}${normalizedStat2OcrText.length > 80 ? "..." : ""}` : "(empty)"}`,
        );
        addLog(
          `Detected texts in region (Stat 1): ${stat1DetectedTexts.length > 0 ? stat1DetectedTexts.join(" | ") : "(none)"}`,
        );
        addLog(
          `Detected texts in region (Stat 2): ${stat2DetectedTexts.length > 0 ? stat2DetectedTexts.join(" | ") : "(none)"}`,
        );
        addLog(
          `Extracted Stat 1 value: ${extractAwakenValueToken(normalizedStat1OcrText) ?? "(none)"}`,
        );
        addLog(
          `Extracted Stat 2 value: ${extractAwakenValueToken(normalizedStat2OcrText) ?? "(none)"}`,
        );

        if (!normalizedOcrText) {
          addLog(
            "No readable text while button is visible. Waiting before retry...",
          );
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }

        // ── Parse detected stats (panel-first, configured-stat matching) ───
        type DetectedStat = { statId: string; value: number };
        const detected: DetectedStat[] = [];
        const configuredCriteria = [...cfg.stat1Criteria, ...cfg.stat2Criteria];
        const configuredStatIds = Array.from(
          new Set(configuredCriteria.map((criterion) => criterion.statId)),
        );
        const configuredStats = configuredStatIds
          .map((statId) => ({ statId, stat: AWAKEN_STAT_BY_ID[statId] }))
          .filter(
            (
              entry,
            ): entry is {
              statId: string;
              stat: (typeof AWAKEN_STAT_BY_ID)[string];
            } => Boolean(entry.stat),
          );

        if (configuredStats.length === 0) {
          addLog("No configured target stats – stopping.");
          break;
        }

        const normalizeAwakenLabel = (value: string): string =>
          value
            .replace(/[|!]/g, "I")
            .replace(/[\[\]{}()]/g, " ")
            .replace(/\./g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .toUpperCase();

        const compactAwakenLabel = (value: string): string =>
          normalizeAwakenLabel(value)
            .replace(/[^A-Z ]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .replace(/^MAX\s+/g, "")
            .trim();

        const resolveConfiguredStatId = (label: string): string | null => {
          const normalizedLabel = compactAwakenLabel(label);
          if (!normalizedLabel) {
            return null;
          }

          let best: { statId: string; score: number } | null = null;

          for (const { statId, stat } of configuredStats) {
            for (const name of stat.ocrNames) {
              const normalizedName = compactAwakenLabel(name);
              if (!normalizedName) {
                continue;
              }

              let score = -1;
              if (stat.exactMatch) {
                if (normalizedLabel === normalizedName) {
                  score = 10;
                }
              } else if (normalizedLabel === normalizedName) {
                score = 9;
              } else if (normalizedLabel.includes(normalizedName)) {
                score = 7 + normalizedName.length / 100;
              } else if (
                normalizedName.includes(normalizedLabel) &&
                normalizedLabel.length >= 3
              ) {
                score = 5;
              }

              if (score > -1 && (!best || score > best.score)) {
                best = { statId, score };
              }
            }
          }

          return best?.statId ?? null;
        };

        const parseOcrNumericValue = (raw: string): number | null => {
          const cleaned = raw.replace(/[+%\s]/g, "").trim();
          if (!cleaned) {
            return null;
          }
          const parsed = Number.parseFloat(cleaned);
          return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
        };

        const extractDetectedStatsFromPanel = (
          panelText: string,
        ): DetectedStat[] => {
          const panelHits: DetectedStat[] = [];
          const seen = new Set<string>();
          const normalizedText = panelText.replace(/\r/g, "").trim();
          if (!normalizedText) {
            return panelHits;
          }

          const parseFromChunk = (chunk: string) => {
            const patterns = [
              /([A-Za-z][A-Za-z .%]{0,48}?)\s*[+#]\s*(\d+(?:\.\d+)?)(%?)/gi,
              /([A-Za-z][A-Za-z .%]{0,48}?)\s+(\d+(?:\.\d+)?)\s*(%)/gi,
            ];

            for (const pattern of patterns) {
              pattern.lastIndex = 0;
              for (const match of chunk.matchAll(pattern)) {
                const label = (match[1] ?? "").trim();
                const numberToken = (match[2] ?? "").trim();
                const value = parseOcrNumericValue(numberToken);
                if (value === null) {
                  continue;
                }

                const statId = resolveConfiguredStatId(label);
                if (!statId) {
                  continue;
                }

                const key = `${statId}:${value}`;
                if (seen.has(key)) {
                  continue;
                }
                seen.add(key);
                panelHits.push({ statId, value });
              }
            }
          };

          const lines = normalizedText
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean);

          for (const line of lines) {
            parseFromChunk(line);
          }

          if (panelHits.length === 0) {
            parseFromChunk(normalizedText.replace(/\s+/g, " "));
          }

          return panelHits;
        };

        detected.push(...extractDetectedStatsFromPanel(stat1OcrText));
        detected.push(...extractDetectedStatsFromPanel(stat2OcrText));

        const occurrencesByStat = new Map<string, number[]>();
        for (const entry of detected) {
          const existing = occurrencesByStat.get(entry.statId) ?? [];
          existing.push(entry.value);
          occurrencesByStat.set(entry.statId, existing);
        }

        // ── Evaluate criteria ──────────────────────────────────────────────
        // OR logic within each configured section, AND logic across both sections.
        // Cross-panel: stats from either panel are pooled into occurrencesByStat,
        // so Stat 1 criteria can match the right panel and vice versa.
        // Sum mode: when only ONE section is configured, occurrences of the same
        // stat on both panels are summed before comparing against statValue.
        const hasStat1Section = cfg.stat1Criteria.length > 0;
        const hasStat2Section = cfg.stat2Criteria.length > 0;
        const singleSectionMode = hasStat1Section !== hasStat2Section;

        const sectionMatches = (criteria: AwakenStatCriterion[]): boolean => {
          if (criteria.length === 0) {
            return true;
          }

          return criteria.some((criterion) => {
            const occurrences = occurrencesByStat.get(criterion.statId) ?? [];
            if (occurrences.length === 0) {
              return false;
            }

            if (singleSectionMode && occurrences.length >= 2) {
              const sum = occurrences.reduce(
                (total, value) => total + value,
                0,
              );
              return sum >= criterion.statValue;
            }

            return occurrences.some((value) => value >= criterion.statValue);
          });
        };

        const matched =
          (hasStat1Section || hasStat2Section) &&
          sectionMatches(cfg.stat1Criteria) &&
          sectionMatches(cfg.stat2Criteria);

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
            observed = occurrences.reduce((total, value) => total + value, 0);
            observedExpr = `${occurrences.join("+")}=${observed}`;
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
          await pause(280);
          await clickAwakenButtonFromSnapshot(
            settledSnapshot,
            buttonMatch,
            "reroll",
          );
          nextOcrAllowedAt = Date.now() + OCR_RETRY_COOLDOWN_MS;
        }

        await pause(260);
      }

      if (autoAwakenRunningRef.current) {
        autoAwakenRunningRef.current = false;
        setAutoAwakenRunning(false);
      }

      if (autoAwakenTemporaryShapeClearTimerRef.current !== null) {
        window.clearTimeout(autoAwakenTemporaryShapeClearTimerRef.current);
        autoAwakenTemporaryShapeClearTimerRef.current = null;
      }
      setAutoAwakenTemporaryShape(null);
    },
    [
      canUseAutoAwaken,
      captureGameplayScreenshot,
      ensureAwakenOcrWorker,
      refreshAccessControl,
    ],
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
      options?: {
        sourceProfileId?: string;
        chainDepth?: number;
        startDelayMs?: number;
      },
    ) => {
      const sourceProfileId =
        options?.sourceProfileId ?? getOriginalKeyTriggerProfileId(profileId);
      const chainDepth = Math.max(
        0,
        Math.round(Number(options?.chainDepth ?? 0) || 0),
      );
      const startDelayMs = Math.max(
        0,
        Math.round(Number(options?.startDelayMs ?? 0) || 0),
      );

      const entries: Array<{ key: string; offsetMs: number }> = [];
      if (delayMode === "sequential") {
        let accumulatedDelayMs = 0;
        actions
          .map((action) => ({
            ...action,
            key: action.key.trim(),
            delayMs: Math.max(0, Math.round(action.delayMs || 0)),
            actionTriggerType:
              action.actionTriggerType === "repeat" ? "repeat" : "once",
            actionRepeatCount:
              action.actionTriggerType === "repeat"
                ? normalizeKeyTriggerActionRepeatCount(
                    action.actionRepeatCount,
                    2,
                  )
                : 1,
          }))
          .filter((action) => action.enabled !== false && action.key.length > 0)
          .forEach((action) => {
            const repeatCount =
              action.actionTriggerType === "repeat"
                ? normalizeKeyTriggerActionRepeatCount(
                    action.actionRepeatCount,
                    2,
                  )
                : 1;
            const repeatIntervalMs = Math.max(120, action.delayMs || 120);

            // Sequential mode: action delay applies once before the action block,
            // then repeats use repeatIntervalMs relative to that action start.
            accumulatedDelayMs += action.delayMs;

            for (let index = 0; index < repeatCount; index += 1) {
              const offsetMs =
                startDelayMs + accumulatedDelayMs + index * repeatIntervalMs;
              entries.push({
                key: action.key,
                offsetMs,
              });
            }

            // In sequential mode: if this action's key chains to a run-once/repeat
            // profile, defer all subsequent actions until that profile finishes.
            if (action.key.length > 0) {
              const normalizedActionKey = normalizeShortcutBinding(action.key);
              const chainedProfile = keyTriggerProfiles.find(
                (p) =>
                  p.enabled !== false &&
                  p.triggerType !== "toggle" &&
                  p.triggerKey &&
                  normalizeShortcutBinding(p.triggerKey) ===
                    normalizedActionKey &&
                  p.id !== sourceProfileId,
              );
              if (chainedProfile) {
                accumulatedDelayMs += computeSequentialChainedDurationMs(
                  chainedProfile,
                  keyTriggerProfiles,
                  new Set([sourceProfileId]),
                  chainDepth + 1,
                );
              }
            }
          });
      } else {
        // synchronous: actions with equal offsets fire in the same tick.
        actions
          .map((action) => ({
            ...action,
            key: action.key.trim(),
            delayMs: Math.max(0, Math.round(action.delayMs || 0)),
            actionTriggerType:
              action.actionTriggerType === "repeat" ? "repeat" : "once",
            actionRepeatCount:
              action.actionTriggerType === "repeat"
                ? normalizeKeyTriggerActionRepeatCount(
                    action.actionRepeatCount,
                    2,
                  )
                : 1,
          }))
          .filter((action) => action.enabled !== false && action.key.length > 0)
          .forEach((action) => {
            const repeatCount =
              action.actionTriggerType === "repeat"
                ? normalizeKeyTriggerActionRepeatCount(
                    action.actionRepeatCount,
                    2,
                  )
                : 1;
            const repeatIntervalMs = Math.max(120, action.delayMs || 120);

            for (let index = 0; index < repeatCount; index += 1) {
              entries.push({
                key: action.key,
                offsetMs:
                  startDelayMs + action.delayMs + index * repeatIntervalMs,
              });
            }
          });
      }

      const groupedByOffset = new Map<number, string[]>();
      entries.forEach((entry) => {
        const existing = groupedByOffset.get(entry.offsetMs) ?? [];
        groupedByOffset.set(entry.offsetMs, [...existing, entry.key]);
      });

      const timerIds = Array.from(groupedByOffset.entries()).map(
        ([offsetMs, bindings]) =>
          window.setTimeout(() => {
            dispatchKeyTriggerBindingsAtSameTiming(bindings, {
              sourceProfileId,
              chainDepth,
              delayMode,
            });
          }, offsetMs),
      );

      if (timerIds.length === 0) {
        return;
      }

      const existing = activeKeyTriggerTimersRef.current.get(profileId) ?? [];
      activeKeyTriggerTimersRef.current.set(profileId, [
        ...existing,
        ...timerIds,
      ]);
    },
    [dispatchKeyTriggerBindingsAtSameTiming, keyTriggerProfiles],
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

  const toggleOverlay = useCallback(() => {
    const currentAccessControl = latestAccessControlRef.current;
    const canUseToolNow = currentAccessControl.hasToolAccess;

    if (currentAccessControl.loading) {
      setOverlayVisible(true);
      setDialogVisible(true);
      message.info("Checking access status. Please try again in a moment.");
      return;
    }

    if (!canUseToolNow) {
      setOverlayVisible(true);
      setDialogVisible(true);
      return;
    }

    // If state drift makes the dialog logically open but visually hidden
    // (for example during shape transforms or overlay gating), recover by
    // forcing the dialog open instead of blindly toggling it closed.
    const shouldForceOpen =
      !dialogVisible || isTransformingShape || !overlayVisible;

    setIsTransformingShape(false);
    setOverlayVisible(true);
    if (shouldForceOpen) {
      setDialogVisible(true);
      return;
    }

    setDialogVisible(false);
    setImportOpen(false);
    window.setTimeout(() => {
      focusGameCanvas();
    }, 0);
  }, [dialogVisible, focusGameCanvas, isTransformingShape, overlayVisible]);

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
          chainDepth?: number;
          runCount?: number;
          delayMode?: "sequential" | "synchronous";
          event?: MouseSyncEventPayload;
          keyEvent?: KeyboardSyncEventPayload;
        };
        if (msg.type === "TOGGLE_OVERLAY") {
          toggleOverlay();
          return;
        }

        if (msg.type === "KEY_TRIGGER_EXECUTE_ONCE") {
          // Guard: Only execute if currentTabId is in tabIds (if tabIds is provided)
          const tabIds = Array.isArray((msg as any).tabIds)
            ? (msg as any).tabIds
            : undefined;
          if (tabIds && tabIds.length > 0) {
            if (currentTabId == null || !tabIds.includes(currentTabId)) {
              return;
            }
          }
          const profileId = msg.profileId ?? `once-${Date.now()}`;
          clearKeyTriggerProfileTimers(profileId);
          const chainDepth = Math.max(
            0,
            Math.round(Number(msg.chainDepth ?? 0) || 0),
          );
          const sourceProfileId = msg.profileId
            ? getOriginalKeyTriggerProfileId(msg.profileId)
            : undefined;

          // Find profile settings if available.
          const sourceProfile = sourceProfileId
            ? keyTriggerProfiles.find(
                (profile) => profile.id === sourceProfileId,
              )
            : undefined;

          // Prefer propagated delayMode for chained executions, otherwise use profile mode.
          let delayMode: "sequential" | "synchronous" = "sequential";
          if (msg.delayMode === "synchronous") {
            delayMode = "synchronous";
          } else if (
            sourceProfile &&
            sourceProfile.delayMode === "synchronous"
          ) {
            delayMode = "synchronous";
          }

          const fallbackRunCount =
            sourceProfile?.triggerType === "repeat"
              ? normalizeKeyTriggerRunCount(sourceProfile.repeatCount, 2)
              : 1;
          const runCount = normalizeKeyTriggerRunCount(
            msg.runCount,
            fallbackRunCount,
          );
          const actions = Array.isArray(msg.actions) ? msg.actions : [];

          if (runCount <= 1) {
            scheduleKeyTriggerActions(profileId, actions, delayMode, {
              sourceProfileId,
              chainDepth,
            });
            return;
          }

          const runnableActions = actions
            .map((action) => ({
              ...action,
              key: action.key.trim(),
              delayMs: Math.max(0, Math.round(action.delayMs || 0)),
              actionTriggerType:
                action.actionTriggerType === "repeat" ? "repeat" : "once",
              actionRepeatCount:
                action.actionTriggerType === "repeat"
                  ? normalizeKeyTriggerActionRepeatCount(
                      action.actionRepeatCount,
                      2,
                    )
                  : 1,
            }))
            .filter(
              (action) => action.enabled !== false && action.key.length > 0,
            );

          if (runnableActions.length === 0) {
            return;
          }

          const baseCycleMs =
            delayMode === "synchronous"
              ? Math.max(
                  ...runnableActions.map(
                    (action) =>
                      action.delayMs +
                      (action.actionTriggerType === "repeat"
                        ? (normalizeKeyTriggerActionRepeatCount(
                            action.actionRepeatCount,
                            2,
                          ) -
                            1) *
                          Math.max(120, action.delayMs || 120)
                        : 0),
                  ),
                )
              : runnableActions.reduce(
                  (total, action) =>
                    total +
                    action.delayMs +
                    (action.actionTriggerType === "repeat"
                      ? (normalizeKeyTriggerActionRepeatCount(
                          action.actionRepeatCount,
                          2,
                        ) -
                          1) *
                        Math.max(120, action.delayMs || 120)
                      : 0),
                  0,
                );
          const cycleMs = Math.max(120, baseCycleMs + 120);

          for (let index = 0; index < runCount; index += 1) {
            scheduleKeyTriggerActions(profileId, actions, delayMode, {
              sourceProfileId,
              chainDepth,
              startDelayMs: index * cycleMs,
            });
          }
          return;
        }

        if (msg.type === "KEY_TRIGGER_START_TOGGLE") {
          if (!msg.profileId) {
            return;
          }
          // Guard: Only execute if currentTabId is in tabIds (if tabIds is provided)
          const tabIds = Array.isArray((msg as any).tabIds)
            ? (msg as any).tabIds
            : undefined;
          if (tabIds && tabIds.length > 0) {
            if (currentTabId == null || !tabIds.includes(currentTabId)) {
              return;
            }
          }

          clearKeyTriggerProfileTimers(msg.profileId);
          const actions = Array.isArray(msg.actions)
            ? msg.actions.filter((action) => action.enabled !== false)
            : [];
          const chainDepth = Math.max(
            0,
            Math.round(Number(msg.chainDepth ?? 0) || 0),
          );
          // Prefer propagated delayMode for chained executions, otherwise use profile mode.
          // profileId may be scoped as "originalId::tabIds", extract original to look up
          let delayMode: "sequential" | "synchronous" = "sequential";
          const originalProfileId = getOriginalKeyTriggerProfileId(
            msg.profileId,
          );
          const profile = keyTriggerProfiles.find(
            (p) => p.id === originalProfileId,
          );
          if (msg.delayMode === "synchronous") {
            delayMode = "synchronous";
          } else if (profile && profile.delayMode === "synchronous") {
            delayMode = "synchronous";
          }

          if (delayMode === "synchronous") {
            // For synchronous toggle: same-delay action groups fire together.
            const timerIds: number[] = [];
            const groupedByDelay = new Map<
              number,
              Array<{ key: string; repeatCount: number }>
            >();

            actions
              .map((action) => ({
                key: action.key.trim(),
                delayMs: Math.max(0, Math.round(action.delayMs || 0)),
                repeatCount:
                  action.actionTriggerType === "repeat"
                    ? normalizeKeyTriggerActionRepeatCount(
                        action.actionRepeatCount,
                        2,
                      )
                    : 1,
              }))
              .filter((action) => action.key.length > 0)
              .forEach((action) => {
                const existing = groupedByDelay.get(action.delayMs) ?? [];
                groupedByDelay.set(action.delayMs, [...existing, action]);
              });

            groupedByDelay.forEach((groupActions, delayMs) => {
              const repeatIntervalMs = Math.max(120, delayMs || 120);

              const fireGroup = () => {
                const immediateKeys = groupActions.map((action) => action.key);
                dispatchKeyTriggerBindingsAtSameTiming(immediateKeys, {
                  sourceProfileId: originalProfileId,
                  chainDepth,
                  delayMode,
                });

                const maxRepeatCount = Math.max(
                  1,
                  ...groupActions.map((action) => action.repeatCount),
                );
                for (
                  let repeatIndex = 1;
                  repeatIndex < maxRepeatCount;
                  repeatIndex += 1
                ) {
                  const keysAtRepeat = groupActions
                    .filter((action) => action.repeatCount > repeatIndex)
                    .map((action) => action.key);

                  if (keysAtRepeat.length === 0) {
                    continue;
                  }

                  const repeatTimerId = window.setTimeout(() => {
                    dispatchKeyTriggerBindingsAtSameTiming(keysAtRepeat, {
                      sourceProfileId: originalProfileId,
                      chainDepth,
                      delayMode,
                    });
                  }, repeatIndex * repeatIntervalMs);
                  timerIds.push(repeatTimerId);
                }
              };

              fireGroup();

              if (delayMs > 0) {
                const intervalId = window.setInterval(() => {
                  fireGroup();
                }, delayMs);
                timerIds.push(intervalId);
              }
            });

            if (timerIds.length > 0) {
              activeKeyTriggerTimersRef.current.set(msg.profileId, timerIds);
            }
          } else {
            // For sequential toggle: cycle through all actions in sequence and repeat the cycle
            const totalSequenceDelay = actions.reduce((totalDelay, action) => {
              const delayMs = Math.max(0, Math.round(action.delayMs || 0));
              const actionRepeatCount =
                action.actionTriggerType === "repeat"
                  ? normalizeKeyTriggerActionRepeatCount(
                      action.actionRepeatCount,
                      2,
                    )
                  : 1;
              return (
                totalDelay +
                delayMs +
                (actionRepeatCount - 1) * Math.max(120, delayMs || 120)
              );
            }, 0);
            const cycleMs = Math.max(250, totalSequenceDelay + 120);

            const intervalId = window.setInterval(() => {
              scheduleKeyTriggerActions(
                msg.profileId ?? "",
                actions,
                delayMode,
                {
                  sourceProfileId: originalProfileId,
                  chainDepth,
                },
              );
            }, cycleMs);

            activeKeyTriggerTimersRef.current.set(msg.profileId, [intervalId]);
            scheduleKeyTriggerActions(msg.profileId, actions, delayMode, {
              sourceProfileId: originalProfileId,
              chainDepth,
            });
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

    const runtimeOnMessage =
      typeof chrome !== "undefined" ? chrome.runtime?.onMessage : undefined;

    if (!runtimeOnMessage) {
      return;
    }

    runtimeOnMessage.addListener(onRuntimeMessage);
    return () => runtimeOnMessage.removeListener(onRuntimeMessage);
  }, [
    clearAllKeyTriggerTimers,
    clearKeyTriggerProfileTimers,
    dispatchKeyTriggerBindingsAtSameTiming,
    dispatchRemoteKeyboardSyncEvent,
    dispatchRemoteMouseSyncEvent,
    reloadKeyTriggerCharacters,
    scheduleKeyTriggerActions,
    focusGameCanvas,
    toggleOverlay,
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
    const activeHoldTriggerTimers = new Map<
      string,
      {
        timerId: number;
        keyCode: string;
        ctrl: boolean;
        alt: boolean;
        shift: boolean;
        meta: boolean;
      }
    >();

    const getPressSignature = (event: KeyboardEvent): string => {
      return [
        event.code || event.key,
        event.ctrlKey ? "1" : "0",
        event.altKey ? "1" : "0",
        event.shiftKey ? "1" : "0",
        event.metaKey ? "1" : "0",
      ].join("|");
    };

    const getProfileTriggerIntervalMs = (
      profile: KeyTriggerProfile,
    ): number => {
      const runnableActions = profile.actions
        .map((action) => ({
          ...action,
          key: action.key.trim(),
          delayMs: Math.max(0, Math.round(action.delayMs || 0)),
          actionTriggerType:
            action.actionTriggerType === "repeat" ? "repeat" : "once",
          actionRepeatCount:
            action.actionTriggerType === "repeat"
              ? normalizeKeyTriggerActionRepeatCount(
                  action.actionRepeatCount,
                  2,
                )
              : 1,
        }))
        .filter((action) => action.enabled !== false && action.key.length > 0);

      if (runnableActions.length === 0) {
        return 250;
      }

      const baseCycleMs =
        profile.delayMode === "synchronous"
          ? Math.max(
              ...runnableActions.map(
                (action) =>
                  action.delayMs +
                  (action.actionTriggerType === "repeat"
                    ? (normalizeKeyTriggerActionRepeatCount(
                        action.actionRepeatCount,
                        2,
                      ) -
                        1) *
                      Math.max(120, action.delayMs || 120)
                    : 0),
              ),
            )
          : runnableActions.reduce(
              (total, action) =>
                total +
                action.delayMs +
                (action.actionTriggerType === "repeat"
                  ? (normalizeKeyTriggerActionRepeatCount(
                      action.actionRepeatCount,
                      2,
                    ) -
                      1) *
                    Math.max(120, action.delayMs || 120)
                  : 0),
              0,
            );

      const runCount =
        profile.triggerType === "repeat"
          ? normalizeKeyTriggerRunCount(profile.repeatCount, 2)
          : 1;

      return Math.max(250, (baseCycleMs + 120) * runCount);
    };

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

      const effectiveKeyTriggerProfiles = canUseKeyTrigger
        ? keyTriggerProfiles
        : [];

      const hasPotentialKeyTriggerBinding = effectiveKeyTriggerProfiles.some(
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
      const matchingKeyTriggerPreset = keyTriggerPresets.find(
        (preset) =>
          typeof preset.switchShortcut === "string" &&
          preset.switchShortcut.trim().length > 0 &&
          matchesBinding(event, preset.switchShortcut),
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

      if (!latestAccessControlRef.current.hasToolAccess) {
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

        const nextOpacity = settings.shapeOpacity <= 0.05 ? 1 : 0;

        setSettings((prev) =>
          Math.abs(prev.shapeOpacity - nextOpacity) <= 0.0001
            ? prev
            : {
                ...prev,
                shapeOpacity: nextOpacity,
              },
        );
        return;
      }

      if (!isInputTarget && isAddKeyMapShortcut && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        const base = createShape(selectedPaletteShapeRef.current);
        const newShape = normalizeShape({
          ...base,
          opacity: settings.shapeOpacity,
        });
        setShapes((prev) => [...prev, newShape]);
        setSelectedId(newShape.id);
        return;
      }

      if (
        dialogVisible &&
        activeUtilityTab === "key-trigger" &&
        !isInputTarget &&
        matchingKeyTriggerPreset &&
        !event.repeat
      ) {
        event.preventDefault();
        event.stopPropagation();

        if (
          keyTriggerPresets.length > 0 &&
          matchingKeyTriggerPreset.id !== selectedKeyTriggerPresetId
        ) {
          void safeSendRuntimeMessage({ type: "KEY_TRIGGER_STOP_ALL" });
          setSelectedKeyTriggerPresetId(matchingKeyTriggerPreset.id);
        }

        return;
      }

      if (!settings.editMode && !isInputTarget && !event.repeat) {
        const pressSignature = getPressSignature(event);
        if (activeHoldTriggerTimers.has(pressSignature)) {
          return;
        }

        const triggeredProfiles = effectiveKeyTriggerProfiles.filter(
          (profile) => {
            return (
              profile.enabled !== false &&
              profile.triggerKey &&
              matchesBinding(event, profile.triggerKey)
            );
          },
        );

        if (triggeredProfiles.length > 0) {
          event.preventDefault();
          event.stopPropagation();

          isDispatchingKeyTriggerRef.current = true;
          try {
            dispatchKeyboardEventToCanvas(
              {
                key: event.key,
                code: event.code,
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
                bubbles: true,
                cancelable: true,
                repeat: false,
              },
              { emitModifierKeyEvents: true, sendKeyUp: false },
            );
          } finally {
            isDispatchingKeyTriggerRef.current = false;
          }

          executeTriggeredKeyTriggerProfiles(triggeredProfiles, 0);

          const repeatIntervalMs = triggeredProfiles.reduce(
            (maxMs, profile) => {
              return Math.max(maxMs, getProfileTriggerIntervalMs(profile));
            },
            250,
          );

          const timerId = window.setInterval(() => {
            executeTriggeredKeyTriggerProfiles(triggeredProfiles, 0);
          }, repeatIntervalMs);

          activeHoldTriggerTimers.set(pressSignature, {
            timerId,
            keyCode: event.code || event.key,
            ctrl: event.ctrlKey,
            alt: event.altKey,
            shift: event.shiftKey,
            meta: event.metaKey,
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

      const shouldPreserveEscapeForBindings =
        !settings.editMode &&
        !isInputTarget &&
        event.key === "Escape" &&
        (hasPotentialSingleStepBinding ||
          hasPotentialSequenceStartBinding ||
          hasPotentialKeyTriggerBinding);

      const isShortcutCapturingInput =
        isInputTarget &&
        (event.target as HTMLElement | null)?.closest(
          ".fm-shape-context-menu, .fm-shortcut-input-shell-shape",
        ) !== null;

      if (
        event.key === "Escape" &&
        !isShortcutCapturingInput &&
        !shouldPreserveEscapeForBindings
      ) {
        if (selectedShape) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedId(null);
          (document.activeElement as HTMLElement | null)?.blur();
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

    const onKeyUp = (event: KeyboardEvent) => {
      if (!event.isTrusted) {
        return;
      }

      const releasedKeyCode = event.code || event.key;
      const releasedModifier = event.key.toLowerCase();

      activeHoldTriggerTimers.forEach((entry, signature) => {
        const modifierReleasedStopsTimer =
          (releasedModifier === "control" && entry.ctrl) ||
          (releasedModifier === "alt" && entry.alt) ||
          (releasedModifier === "shift" && entry.shift) ||
          (releasedModifier === "meta" && entry.meta);

        if (entry.keyCode === releasedKeyCode || modifierReleasedStopsTimer) {
          dispatchKeyboardKeyUpToCanvas({
            key: event.key,
            code: event.code,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
          });
          window.clearInterval(entry.timerId);
          activeHoldTriggerTimers.delete(signature);
        }
      });
    };

    const onWindowBlur = () => {
      activeHoldTriggerTimers.forEach((entry) => {
        window.clearInterval(entry.timerId);
      });
      activeHoldTriggerTimers.clear();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onWindowBlur);
    return () => {
      clearPendingSequencePassThrough();
      activeHoldTriggerTimers.forEach((entry) => {
        window.clearInterval(entry.timerId);
      });
      activeHoldTriggerTimers.clear();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    copiedShapes,
    copyShapeIds,
    cutShapeIds,
    deleteShapeIds,
    dialogVisible,
    overlayVisible,
    selectedShape,
    selectedIds,
    settings.addKeyMapShortcut,
    settings.shapeOpacity,
    settings.editMode,
    settings.focusCanvasShortcut,
    keyTriggerProfiles,
    settings.strictPassthrough,
    settings.setZeroOpacityShortcut,
    settings.toggleModeShortcut,
    settings.toggleShapesShortcut,
    settings.toggleDialogShortcut,
    executeTriggeredKeyTriggerProfiles,
    shapes,
    dispatchKeyboardEventToCanvas,
    selectSingleShape,
    undoShapeChanges,
    redoShapeChanges,
    pasteCopiedShapesAt,
    toggleOverlay,
  ]);

  useEffect(() => {
    if (settings.editMode) {
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

    const hasKeyTriggerPointerBinding = (
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
      return keyTriggerProfiles.some((profile) => {
        if (profile.enabled === false || !profile.triggerKey) {
          return false;
        }

        const bindingParts = profile.triggerKey
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
        (hasPointerBinding(
          pointerToken === "left click"
            ? "double left click"
            : "double right click",
          {
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
          },
        ) ||
          hasKeyTriggerPointerBinding(
            pointerToken === "left click"
              ? "double left click"
              : "double right click",
            {
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
            },
          )) &&
        !(
          hasPointerBinding(
            pointerToken === "left click" ? "left click" : "right click",
            {
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
            },
          ) ||
          hasKeyTriggerPointerBinding(
            pointerToken === "left click" ? "left click" : "right click",
            {
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
            },
          )
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

      const triggeredProfiles = keyTriggerProfiles.filter((profile) => {
        return (
          profile.enabled !== false &&
          profile.triggerKey &&
          matchesBindingAction(
            profile.triggerKey,
            {
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
            },
            shapeBindingHistoryRef.current,
          )
        );
      });

      if (hitAreas.length === 0 && triggeredProfiles.length === 0) {
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

      if (triggeredProfiles.length > 0) {
        executeTriggeredKeyTriggerProfiles(triggeredProfiles, 0);
      }
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
  }, [
    executeTriggeredKeyTriggerProfiles,
    keyTriggerProfiles,
    settings,
    settings.editMode,
    shapes,
    shapesVisible,
  ]);

  const captureGlobalShortcut = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    field: GlobalShortcutField,
  ) => {
    event.preventDefault();
    event.stopPropagation();

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
          opacity: settings.shapeOpacity,
        });
      }

      return normalizeShape({
        ...base,
        x: point.x - base.width / 2,
        y: point.y - base.height / 2,
        opacity: settings.shapeOpacity,
      });
    },
    [settings.shapeOpacity],
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
    // Allow one render cycle for manual profile change to persist mapping.
    skipMappedAutoApplyOnceRef.current = true;
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
      title: "Reset settings defaults?",
      content:
        "This only resets Settings values to defaults. It keeps Key Mapper profiles, shapes, shape history, copied shapes, active/selected profile per character mapping, and Key Trigger profiles unchanged.",
      zIndex: 2147483647,
      okText: "Reset",
      okButtonProps: { danger: true, type: "primary" },
      cancelButtonProps: { type: "default" },
      cancelText: "Cancel",
      onOk: () => {
        const resetSettings = cloneDefaultSettings();

        setSettings(resetSettings);
        latestSettingsRef.current = resetSettings;
        storage.saveSettings(resetSettings);

        setDialogRect({ ...DEFAULT_DIALOG_RECT });
        setActiveUtilityTab("key-mapper");
        setSelectedPaletteShape("rectangle");
      },
    });
  }, [modal]);

  const factoryResetConfiguration = useCallback(() => {
    modal.confirm({
      className: "fm-confirm-modal fm-reset-config-modal",
      title: "Factory reset tool data?",
      content: (
        <Typography.Text type="warning">
          Back up your tool config JSON first. Factory reset clears all Key
          Mapper profiles/shapes, Key Trigger presets/profiles/mappings,
          selected tabs, and settings, then starts from a clean default state.
        </Typography.Text>
      ),
      zIndex: 2147483647,
      okText: "Factory Reset",
      okButtonProps: { danger: true, type: "primary" },
      cancelButtonProps: { type: "default" },
      cancelText: "Cancel",
      onOk: () => {
        const resetSettings = cloneDefaultSettings();
        const defaultProfileId = createProfileId();
        const defaultProfiles: MappingProfile[] = [
          {
            id: defaultProfileId,
            name: "Default",
            shapes: [],
          },
        ];
        const defaultPresetId = "kt-preset-default";
        const defaultPresets: KeyTriggerPreset[] = [
          {
            id: defaultPresetId,
            name: "Default",
            switchShortcut: "",
            profiles: [],
          },
        ];

        setSettings(resetSettings);
        latestSettingsRef.current = resetSettings;

        setProfiles(defaultProfiles);
        setActiveProfileId(defaultProfileId);
        setSelectedProfileId(defaultProfileId);
        setActiveProfileName("Default");
        setShapesWithoutHistory([]);
        resetShapeHistory();
        selectSingleShape(null);
        setSelectedIds([]);
        setCopiedShapes([]);
        setIsTransformingShape(false);

        setMapperCharacterProfileMapping({});

        setKeyTriggerPresets(defaultPresets);
        setSelectedKeyTriggerPresetId(defaultPresetId);
        setKeyTriggerProfiles([]);
        setKeyTriggerCharacterPresetMapping({});
        setKeyTriggerCharacterProfileMapping({});
        setSelectedKeyTriggerTabIds([]);

        setDialogRect({ ...DEFAULT_DIALOG_RECT });
        setActiveUtilityTab("key-mapper");
        setSelectedPaletteShape("rectangle");

        setImportOpen(false);
        setImportText("");

        storage.saveSettings(resetSettings);
        storage.saveProfiles({
          activeProfileId: defaultProfileId,
          profiles: defaultProfiles,
        });
        storage.saveUiState({
          selectedPaletteShape: "rectangle",
          dialogRect: { ...DEFAULT_DIALOG_RECT },
          selectedUtilityTab: "key-mapper",
        });
        storage.saveKeyTriggerState({
          selectedPresetId: defaultPresetId,
          presets: defaultPresets,
          characterPresetMapping: {},
        });
        storage.saveKeyTriggerTargetTabIds([]);
        storage.saveKeyTriggerTargetTabNames([]);
        storage.saveKeyTriggerCharacterProfileMapping({});
        storage.saveMapperCharacterProfileMapping({});

        message.success("Factory reset complete. Tool state is now clean.");
      },
    });
  }, [modal, resetShapeHistory, selectSingleShape, setShapesWithoutHistory]);

  const restoreKeyMapperProfilesFromBackup = useCallback(() => {
    modal.confirm({
      className: "fm-confirm-modal fm-reset-config-modal",
      title: "Restore Key Mapper backup?",
      content:
        "This restores Key Mapper profiles from the saved backup snapshot. Key Trigger profiles are unchanged.",
      zIndex: 2147483647,
      okText: "Restore",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        const restored = storage.restoreProfilesFromBackup();
        if (!restored || restored.profiles.length === 0) {
          message.error("No Key Mapper backup was found to restore.");
          return;
        }

        const restoredActiveProfile =
          restored.profiles.find(
            (profile) => profile.id === restored.activeProfileId,
          ) ?? restored.profiles[0];

        if (!restoredActiveProfile) {
          message.error("No usable Key Mapper backup was found.");
          return;
        }

        skipNextProfilesSaveRef.current = true;
        previousActiveProfileIdRef.current = restoredActiveProfile.id;
        isSwitchingProfileRef.current = false;

        setProfiles(restored.profiles);
        setActiveProfileId(restoredActiveProfile.id);
        setSelectedProfileId(restoredActiveProfile.id);
        setActiveProfileName(restoredActiveProfile.name);
        setShapesWithoutHistory(restoredActiveProfile.shapes);
        resetShapeHistory();
        selectSingleShape(null);
        setSelectedIds([]);
        setCopiedShapes([]);
        setIsTransformingShape(false);

        message.success("Key Mapper backup restored.");
      },
    });
  }, [modal, resetShapeHistory, selectSingleShape, setShapesWithoutHistory]);

  const createProfile = (name?: string) => {
    const nextName =
      (name ?? "").trim() ||
      makeUniqueProfileName(latestProfilesRef.current, "Profile");
    const validationError = validateProfileName(nextName);
    if (validationError) {
      return validationError;
    }

    const profile: MappingProfile = {
      id: createProfileId(),
      name: nextName,
      shapes: [],
    };

    setProfiles((prev) => [...prev, profile]);
    requestProfileSwitch(profile.id);
    return null;
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
      return "Select a profile first.";
    }

    const validationError = validateProfileName(nextName, selectedProfile.id);
    if (validationError) {
      return validationError;
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

    return null;
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

  const buildKeyTriggerProfileSignature = (
    profile: Pick<
      KeyTriggerProfile,
      | "name"
      | "enabled"
      | "triggerType"
      | "repeatCount"
      | "triggerKey"
      | "executionScope"
      | "currentTabOnly"
      | "otherTabsOnly"
      | "specificTargetTabIds"
      | "specificTargetTabId"
      | "specificTargetTabName"
      | "delayMode"
      | "actions"
    >,
  ): string => {
    const normalizedActions = profile.actions.map((action) => ({
      name: action.name.trim().toLowerCase(),
      key: action.key.trim(),
      delayMs: Math.max(0, Math.round(action.delayMs || 0)),
      enabled: action.enabled !== false,
      actionTriggerType:
        action.actionTriggerType === "repeat" ? "repeat" : "once",
      actionRepeatCount:
        action.actionTriggerType === "repeat"
          ? normalizeKeyTriggerActionRepeatCount(action.actionRepeatCount, 2)
          : 1,
      executionScope:
        action.executionScope === "current" ||
        action.executionScope === "other" ||
        action.executionScope === "specific"
          ? action.executionScope
          : action.otherTabsOnly === true
            ? "other"
            : action.currentTabOnly === true
              ? "current"
              : "all",
      currentTabOnly: action.currentTabOnly === true,
      otherTabsOnly: action.otherTabsOnly === true,
      specificTargetTabIds: Array.from(
        new Set(
          (action.specificTargetTabIds ?? []).filter((id) =>
            Number.isFinite(id),
          ),
        ),
      ),
    }));

    return JSON.stringify({
      enabled: profile.enabled !== false,
      triggerType: profile.triggerType,
      repeatCount:
        profile.triggerType === "repeat"
          ? normalizeKeyTriggerRunCount(profile.repeatCount, 2)
          : 1,
      triggerKey: profile.triggerKey.trim(),
      executionScope:
        profile.executionScope === "current" ||
        profile.executionScope === "other" ||
        profile.executionScope === "specific"
          ? profile.executionScope
          : "all",
      currentTabOnly: profile.currentTabOnly === true,
      otherTabsOnly: profile.otherTabsOnly === true,
      specificTargetTabIds: Array.from(
        new Set(
          (profile.specificTargetTabIds ?? []).filter((id) =>
            Number.isFinite(id),
          ),
        ),
      ),
      specificTargetTabId: Number.isFinite(profile.specificTargetTabId)
        ? Number(profile.specificTargetTabId)
        : null,
      specificTargetTabName:
        typeof profile.specificTargetTabName === "string"
          ? profile.specificTargetTabName
          : null,
      delayMode: profile.delayMode,
      actions: normalizedActions,
    });
  };

  const filterCharacterMappingByProfileIds = (
    mapping: Record<string, string>,
    validProfileIds: Set<string>,
  ): Record<string, string> => {
    const filtered: Record<string, string> = {};
    Object.entries(mapping).forEach(([characterName, profileId]) => {
      const normalizedCharacterName = characterName.trim();
      if (
        normalizedCharacterName.length > 0 &&
        typeof profileId === "string" &&
        validProfileIds.has(profileId)
      ) {
        filtered[normalizedCharacterName] = profileId;
      }
    });
    return filtered;
  };

  const exportMappings = async () => {
    const selectedKeyTriggerTabIdsUnique = Array.from(
      new Set(selectedKeyTriggerTabIds.filter((id) => Number.isFinite(id))),
    );
    const selectedKeyTriggerTabNames = keyTriggerCharacters
      .filter((tab) => selectedKeyTriggerTabIds.includes(tab.id))
      .map((tab) => tab.name);

    const mapperProfileIds = new Set(
      latestProfilesRef.current.map((profile) => profile.id),
    );
    const keyTriggerProfileIds = new Set(
      keyTriggerProfiles.map((profile) => profile.id),
    );

    const filteredMapperCharacterProfileMapping =
      filterCharacterMappingByProfileIds(
        mapperCharacterProfileMapping,
        mapperProfileIds,
      );
    const filteredKeyTriggerCharacterProfileMapping =
      filterCharacterMappingByProfileIds(
        keyTriggerCharacterProfileMapping,
        keyTriggerProfileIds,
      );

    const payloadObject = {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      profiles: latestProfilesRef.current,
      activeProfileId,
      settings: latestSettingsRef.current,
      uiState: {
        selectedPaletteShape,
        dialogRect,
        selectedUtilityTab: activeUtilityTab,
      },
      keyTriggerProfiles,
      keyTriggerPresets,
      selectedKeyTriggerPresetId,
      selectedKeyTriggerTabIds: selectedKeyTriggerTabIdsUnique,
      selectedKeyTriggerTabNames,
      keyTriggerCharacterProfileMapping:
        filteredKeyTriggerCharacterProfileMapping,
      keyTriggerCharacterPresetMapping,
      mapperCharacterProfileMapping: filteredMapperCharacterProfileMapping,
    };

    const payload = JSON.stringify(payloadObject);

    let copied = false;

    try {
      await navigator.clipboard.writeText(payload);
      copied = true;
    } catch {
      const fallbackTextarea = document.createElement("textarea");
      fallbackTextarea.value = payload;
      fallbackTextarea.setAttribute("readonly", "");
      fallbackTextarea.style.position = "fixed";
      fallbackTextarea.style.top = "-9999px";
      fallbackTextarea.style.left = "-9999px";
      document.body.appendChild(fallbackTextarea);
      fallbackTextarea.focus();
      fallbackTextarea.select();

      try {
        copied = document.execCommand("copy");
      } finally {
        document.body.removeChild(fallbackTextarea);
      }
    }

    if (copied) {
      message.success("Tool config copied to clipboard.");
    } else {
      message.error("Failed to copy tool config. Please try again.");
    }
  };

  const performImportWithName = (
    baseProfileName: string,
    sourceImportText: string,
  ) => {
    try {
      const createImportedKeyTriggerProfileIdentifier = () =>
        `kt-identifier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const parsed = JSON.parse(sourceImportText) as {
        schemaVersion?: number;
        profileName?: string;
        shapes?: ShapeMapping[];
        profileId?: string;
        settings?: Partial<MapperSettings>;
        uiState?: {
          selectedPaletteShape?: ShapeType;
          dialogRect?: Partial<DialogRect>;
          selectedUtilityTab?: UtilityTab;
        };
        profiles?: Array<{
          id?: string;
          name?: string;
          shapes?: ShapeMapping[];
        }>;
        keyTriggerProfiles?: KeyTriggerProfile[];
        keyTriggerPresets?: KeyTriggerPreset[];
        selectedKeyTriggerPresetId?: string;
        selectedKeyTriggerTabIds?: unknown[];
        selectedKeyTriggerTabNames?: unknown[];
        keyTriggerCharacterProfileMapping?: Record<string, string>;
        keyTriggerCharacterPresetMapping?: Record<string, string>;
        mapperCharacterProfileMapping?: Record<string, string>;
      };

      const resolveImportedSettings = (
        importedSettings: Partial<MapperSettings> | undefined,
        sourceLabel: string,
      ): { settings: MapperSettings; warnings: string[] } => {
        const baseSettings = latestSettingsRef.current;
        const sanitizeScanRegion = (
          value: unknown,
          fallback: NormalizedRect | null,
        ): NormalizedRect | null => {
          if (value === null) {
            return null;
          }

          if (typeof value !== "object" || !value) {
            return fallback;
          }

          const parsedRegion = value as Partial<NormalizedRect>;
          const x = Number(parsedRegion.x);
          const y = Number(parsedRegion.y);
          const width = Number(parsedRegion.width);
          const height = Number(parsedRegion.height);

          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height)
          ) {
            return fallback;
          }

          return {
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y)),
            width: Math.max(0, Math.min(1, width)),
            height: Math.max(0, Math.min(1, height)),
          };
        };

        const sanitizeAwakenCriteria = (
          value: unknown,
          fallback: AwakenStatCriterion[],
        ): AwakenStatCriterion[] => {
          if (!Array.isArray(value)) {
            return fallback;
          }

          const normalized = value
            .map((entry) => {
              if (typeof entry !== "object" || !entry) {
                return null;
              }

              const parsedCriterion = entry as Partial<AwakenStatCriterion>;
              if (
                typeof parsedCriterion.statId !== "string" ||
                parsedCriterion.statId.trim().length === 0
              ) {
                return null;
              }

              const statValue = Number(parsedCriterion.statValue);
              if (!Number.isFinite(statValue)) {
                return null;
              }

              return {
                id:
                  typeof parsedCriterion.id === "string" &&
                  parsedCriterion.id.trim().length > 0
                    ? parsedCriterion.id.trim()
                    : `crit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                statId: parsedCriterion.statId.trim(),
                statValue,
              } satisfies AwakenStatCriterion;
            })
            .filter(
              (criterion): criterion is AwakenStatCriterion =>
                criterion !== null,
            );

          return normalized;
        };

        const importedAutoStopSeconds = importedSettings?.autoStopSeconds;

        const resolved: MapperSettings = {
          ...baseSettings,
          theme: importedSettings?.theme ?? baseSettings.theme,
          editMode: importedSettings?.editMode ?? baseSettings.editMode,
          experimentalFeaturesEnabled:
            importedSettings?.experimentalFeaturesEnabled ??
            baseSettings.experimentalFeaturesEnabled,
          showHandles:
            importedSettings?.showHandles ?? baseSettings.showHandles,
          showSnapIndicators:
            importedSettings?.showSnapIndicators ??
            baseSettings.showSnapIndicators,
          showShapeTooltips:
            importedSettings?.showShapeTooltips ??
            baseSettings.showShapeTooltips,
          shapeOpacity:
            typeof importedSettings?.shapeOpacity === "number" &&
            Number.isFinite(importedSettings.shapeOpacity)
              ? Math.max(0, Math.min(1, importedSettings.shapeOpacity))
              : baseSettings.shapeOpacity,
          strictPassthrough:
            importedSettings?.strictPassthrough ??
            baseSettings.strictPassthrough,
          syncMouseEvents:
            importedSettings?.syncMouseEvents ?? baseSettings.syncMouseEvents,
          mouseSyncPositionMode:
            importedSettings?.mouseSyncPositionMode === "ratio"
              ? "ratio"
              : importedSettings?.mouseSyncPositionMode === "actual"
                ? "actual"
                : baseSettings.mouseSyncPositionMode,
          addKeyMapShortcut:
            typeof importedSettings?.addKeyMapShortcut === "string"
              ? importedSettings.addKeyMapShortcut.trim() ||
                baseSettings.addKeyMapShortcut
              : baseSettings.addKeyMapShortcut,
          toggleModeShortcut:
            typeof importedSettings?.toggleModeShortcut === "string"
              ? importedSettings.toggleModeShortcut.trim() ||
                baseSettings.toggleModeShortcut
              : baseSettings.toggleModeShortcut,
          focusCanvasShortcut:
            typeof importedSettings?.focusCanvasShortcut === "string"
              ? importedSettings.focusCanvasShortcut.trim() ||
                baseSettings.focusCanvasShortcut
              : baseSettings.focusCanvasShortcut,
          toggleShapesShortcut:
            typeof importedSettings?.toggleShapesShortcut === "string"
              ? importedSettings.toggleShapesShortcut.trim() ||
                baseSettings.toggleShapesShortcut
              : baseSettings.toggleShapesShortcut,
          setZeroOpacityShortcut:
            typeof importedSettings?.setZeroOpacityShortcut === "string"
              ? importedSettings.setZeroOpacityShortcut.trim() ||
                baseSettings.setZeroOpacityShortcut
              : baseSettings.setZeroOpacityShortcut,
          toggleDialogShortcut:
            typeof importedSettings?.toggleDialogShortcut === "string"
              ? importedSettings.toggleDialogShortcut.trim() ||
                baseSettings.toggleDialogShortcut
              : baseSettings.toggleDialogShortcut,
          keyTriggerPresetSwitchShortcut:
            typeof importedSettings?.keyTriggerPresetSwitchShortcut === "string"
              ? importedSettings.keyTriggerPresetSwitchShortcut.trim() ||
                baseSettings.keyTriggerPresetSwitchShortcut
              : baseSettings.keyTriggerPresetSwitchShortcut,
          autoStopSeconds:
            importedAutoStopSeconds === null
              ? null
              : typeof importedAutoStopSeconds === "number" &&
                  Number.isFinite(importedAutoStopSeconds)
                ? Math.max(0, importedAutoStopSeconds)
                : baseSettings.autoStopSeconds,
          notifyOnRecaptcha:
            importedSettings?.notifyOnRecaptcha ??
            baseSettings.notifyOnRecaptcha,
          stopOnRecaptcha:
            importedSettings?.stopOnRecaptcha ?? baseSettings.stopOnRecaptcha,
          mobilePushEnabled:
            importedSettings?.mobilePushEnabled ??
            baseSettings.mobilePushEnabled,
          mobilePushDiscordBotUrl:
            typeof importedSettings?.mobilePushDiscordBotUrl === "string"
              ? importedSettings.mobilePushDiscordBotUrl.trim()
              : baseSettings.mobilePushDiscordBotUrl,
          mobilePushDiscordUserId:
            typeof importedSettings?.mobilePushDiscordUserId === "string"
              ? importedSettings.mobilePushDiscordUserId.trim()
              : baseSettings.mobilePushDiscordUserId,
          mobilePushDiscordApiKey:
            typeof importedSettings?.mobilePushDiscordApiKey === "string"
              ? importedSettings.mobilePushDiscordApiKey.trim()
              : baseSettings.mobilePushDiscordApiKey,
          subscriptionAccessToken:
            typeof importedSettings?.subscriptionAccessToken === "string"
              ? importedSettings.subscriptionAccessToken.trim()
              : baseSettings.subscriptionAccessToken,
          autoHoly: {
            enabled:
              importedSettings?.autoHoly?.enabled ??
              baseSettings.autoHoly.enabled,
            debuffType:
              importedSettings?.autoHoly?.debuffType === "root" ||
              importedSettings?.autoHoly?.debuffType === "stun" ||
              importedSettings?.autoHoly?.debuffType === "all"
                ? importedSettings.autoHoly.debuffType
                : baseSettings.autoHoly.debuffType,
            debugOverlayEnabled:
              importedSettings?.autoHoly?.debugOverlayEnabled ??
              baseSettings.autoHoly.debugOverlayEnabled,
            holyKey:
              typeof importedSettings?.autoHoly?.holyKey === "string"
                ? importedSettings.autoHoly.holyKey
                : baseSettings.autoHoly.holyKey,
            scanRegion: sanitizeScanRegion(
              importedSettings?.autoHoly?.scanRegion,
              baseSettings.autoHoly.scanRegion,
            ),
          },
          autoPills: {
            enabled:
              importedSettings?.autoPills?.enabled ??
              baseSettings.autoPills.enabled,
            hpThreshold:
              typeof importedSettings?.autoPills?.hpThreshold === "number" &&
              Number.isFinite(importedSettings.autoPills.hpThreshold)
                ? Math.max(
                    1,
                    Math.min(99, importedSettings.autoPills.hpThreshold),
                  )
                : baseSettings.autoPills.hpThreshold,
            debugOverlayEnabled:
              importedSettings?.autoPills?.debugOverlayEnabled ??
              baseSettings.autoPills.debugOverlayEnabled,
            pillKey:
              typeof importedSettings?.autoPills?.pillKey === "string"
                ? importedSettings.autoPills.pillKey
                : baseSettings.autoPills.pillKey,
            scanRegion: sanitizeScanRegion(
              importedSettings?.autoPills?.scanRegion,
              baseSettings.autoPills.scanRegion,
            ),
          },
          autoAwaken: {
            scanRegion: sanitizeScanRegion(
              importedSettings?.autoAwaken?.scanRegion,
              baseSettings.autoAwaken.scanRegion,
            ),
            blessingType:
              importedSettings?.autoAwaken?.blessingType === "goddess" ||
              importedSettings?.autoAwaken?.blessingType === "demon" ||
              importedSettings?.autoAwaken?.blessingType === "auto"
                ? importedSettings.autoAwaken.blessingType
                : baseSettings.autoAwaken.blessingType,
            stat1Criteria: sanitizeAwakenCriteria(
              importedSettings?.autoAwaken?.stat1Criteria,
              baseSettings.autoAwaken.stat1Criteria,
            ),
            stat2Criteria: sanitizeAwakenCriteria(
              importedSettings?.autoAwaken?.stat2Criteria,
              baseSettings.autoAwaken.stat2Criteria,
            ),
          },
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
      const buildUniqueNameWithCounter = (
        baseName: string,
        existingNames: Set<string>,
        fallback: string,
      ): string => {
        const normalizedBase = baseName.trim() || fallback;
        if (!existingNames.has(normalizedBase)) {
          existingNames.add(normalizedBase);
          return normalizedBase;
        }

        let counter = 1;
        let candidate = `${normalizedBase} (${counter})`;
        while (existingNames.has(candidate)) {
          counter += 1;
          candidate = `${normalizedBase} (${counter})`;
        }

        existingNames.add(candidate);
        return candidate;
      };

      const baseSettingsResolution = resolveImportedSettings(
        parsed.settings,
        "Import payload",
      );
      importWarnings.push(...baseSettingsResolution.warnings);

      const baseImportedSettings = baseSettingsResolution.settings;

      const importedProfiles: MappingProfile[] = [];
      const mapperImportedToNewProfileId = new Map<string, string>();
      const createImportedKeyTriggerProfileId = () =>
        `kt-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const createImportedKeyTriggerActionId = () =>
        `kt-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const importedPresetIdMap = new Map<string, string>();
      const importedPresetIds = new Set<string>();

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

          const nextProfile: MappingProfile = {
            id: createProfileId(),
            name: uniqueName,
            shapes: profile.shapes.map(normalizeShape),
          };
          importedProfiles.push(nextProfile);

          if (typeof profile.id === "string" && profile.id.trim().length > 0) {
            mapperImportedToNewProfileId.set(profile.id, nextProfile.id);
          }
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

        const nextProfile: MappingProfile = {
          id: createProfileId(),
          name: uniqueName,
          shapes: parsed.shapes.map(normalizeShape),
        };

        importedProfiles.push(nextProfile);
        if (
          typeof parsed.profileId === "string" &&
          parsed.profileId.trim().length > 0
        ) {
          mapperImportedToNewProfileId.set(parsed.profileId, nextProfile.id);
        }
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
        Array.isArray((parsed as any).keyTriggerPresets) &&
        (parsed as any).keyTriggerPresets.length > 0
      ) {
        const createImportedKeyTriggerPresetId = () =>
          `kt-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const existingPresetNames = new Set(
          keyTriggerPresets.map((preset) => preset.name),
        );
        const importedPresets: KeyTriggerPreset[] = [];

        (parsed as any).keyTriggerPresets.forEach(
          (
            preset: {
              id?: string;
              name?: string;
              switchShortcut?: string;
              profiles?: KeyTriggerProfile[];
            },
            presetIndex: number,
          ) => {
            const importedProfiles: KeyTriggerProfile[] = (
              Array.isArray(preset.profiles) ? preset.profiles : []
            ).map((profile) => {
              const nextProfileIdentifier =
                typeof profile.profileIdentifier === "string" &&
                profile.profileIdentifier.trim().length > 0
                  ? profile.profileIdentifier.trim()
                  : `kt-identifier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

              const normalizedSpecificTargetTabIds = Array.from(
                new Set(
                  (Array.isArray(profile.specificTargetTabIds)
                    ? profile.specificTargetTabIds
                    : Number.isFinite(profile.specificTargetTabId)
                      ? [profile.specificTargetTabId as number]
                      : []
                  ).filter((id) => Number.isFinite(id)),
                ),
              );
              const normalizedSpecificTargetTabNames = Array.from(
                new Set(
                  (Array.isArray(profile.specificTargetTabNames)
                    ? profile.specificTargetTabNames
                    : typeof profile.specificTargetTabName === "string" &&
                        profile.specificTargetTabName.trim().length > 0
                      ? [profile.specificTargetTabName]
                      : []
                  ).filter(
                    (name): name is string =>
                      typeof name === "string" && name.trim().length > 0,
                  ),
                ),
              );

              const normalizedActions: KeyTriggerAction[] = (
                Array.isArray(profile.actions) ? profile.actions : []
              ).map((action, actionIndex) => ({
                ...action,
                id: createImportedKeyTriggerActionId(),
                name: action.name?.trim() || `Action ${actionIndex + 1}`,
                key: action.key?.trim() || "",
                delayMs: Math.max(0, Math.round(action.delayMs || 0)),
                enabled: action.enabled !== false,
                actionTriggerType:
                  action.actionTriggerType === "repeat" ? "repeat" : "once",
                actionRepeatCount:
                  action.actionTriggerType === "repeat"
                    ? normalizeKeyTriggerActionRepeatCount(
                        action.actionRepeatCount,
                        2,
                      )
                    : 1,
                executionScope:
                  action.executionScope === "current" ||
                  action.executionScope === "other" ||
                  action.executionScope === "specific"
                    ? action.executionScope
                    : action.otherTabsOnly === true
                      ? "other"
                      : action.currentTabOnly === true
                        ? "current"
                        : "all",
                currentTabOnly: action.currentTabOnly === true,
                otherTabsOnly: action.otherTabsOnly === true,
                specificTargetTabIds: Array.from(
                  new Set(
                    (action.specificTargetTabIds ?? []).filter((id) =>
                      Number.isFinite(id),
                    ),
                  ),
                ),
                specificTargetTabNames: Array.from(
                  new Set(
                    (action.specificTargetTabNames ?? []).filter(
                      (name): name is string =>
                        typeof name === "string" && name.trim().length > 0,
                    ),
                  ),
                ),
              }));

              return {
                ...profile,
                id: createImportedKeyTriggerProfileId(),
                profileIdentifier: nextProfileIdentifier,
                name:
                  typeof profile.name === "string" &&
                  profile.name.trim().length > 0
                    ? profile.name.trim()
                    : `Profile ${presetIndex + 1}`,
                executionScope:
                  profile.executionScope === "current" ||
                  profile.executionScope === "other" ||
                  profile.executionScope === "specific"
                    ? profile.executionScope
                    : normalizedSpecificTargetTabIds.length > 0
                      ? "specific"
                      : profile.otherTabsOnly === true
                        ? "other"
                        : profile.currentTabOnly === true
                          ? "current"
                          : "all",
                currentTabOnly: profile.currentTabOnly === true,
                otherTabsOnly: profile.otherTabsOnly === true,
                specificTargetTabIds: normalizedSpecificTargetTabIds,
                specificTargetTabNames: normalizedSpecificTargetTabNames,
                specificTargetTabId: normalizedSpecificTargetTabIds[0] ?? null,
                specificTargetTabName:
                  normalizedSpecificTargetTabNames[0] ?? null,
                actions: normalizedActions,
              };
            });

            const presetNameBase =
              typeof preset.name === "string" && preset.name.trim().length > 0
                ? preset.name.trim()
                : `Preset ${presetIndex + 1}`;

            const importedPreset: KeyTriggerPreset = {
              id: createImportedKeyTriggerPresetId(),
              name: buildUniqueNameWithCounter(
                presetNameBase,
                existingPresetNames,
                "Preset",
              ),
              switchShortcut:
                typeof preset.switchShortcut === "string"
                  ? preset.switchShortcut.trim()
                  : "",
              profiles: importedProfiles,
            };

            if (typeof preset.id === "string" && preset.id.trim().length > 0) {
              importedPresetIdMap.set(preset.id, importedPreset.id);
            }
            importedPresetIds.add(importedPreset.id);
            importedPresets.push(importedPreset);
          },
        );

        if (importedPresets.length > 0) {
          setKeyTriggerPresets((prev) => [...prev, ...importedPresets]);
          if (typeof (parsed as any).selectedKeyTriggerPresetId === "string") {
            const remappedPresetId = importedPresetIdMap.get(
              (parsed as any).selectedKeyTriggerPresetId,
            );
            if (remappedPresetId) {
              setSelectedKeyTriggerPresetId(remappedPresetId);
            }
          }
        }
      } else if (
        Array.isArray(parsed.keyTriggerProfiles) &&
        parsed.keyTriggerProfiles.length > 0
      ) {
        const existingKeyTriggerProfileByIdentifier = new Map(
          keyTriggerProfiles
            .map((profile) => {
              const identifier = profile.profileIdentifier?.trim() ?? "";
              return identifier.length > 0
                ? ([identifier, profile] as const)
                : null;
            })
            .filter(
              (entry): entry is readonly [string, KeyTriggerProfile] =>
                entry !== null,
            ),
        );
        const existingKeyTriggerProfileSignatures = new Set(
          keyTriggerProfiles.map((profile) =>
            buildKeyTriggerProfileSignature(profile),
          ),
        );
        const keyTriggerImportedToNewProfileId = new Map<string, string>();
        const incomingKtProfiles: KeyTriggerProfile[] = [];
        const skippedKeyTriggerDuplicates: string[] = [];

        (parsed.keyTriggerProfiles as KeyTriggerProfile[]).forEach(
          (profile, profileIndex) => {
            const importedProfileIdentifier =
              typeof profile.profileIdentifier === "string"
                ? profile.profileIdentifier.trim()
                : "";

            if (importedProfileIdentifier) {
              const matchedExistingProfile =
                existingKeyTriggerProfileByIdentifier.get(
                  importedProfileIdentifier,
                );
              if (matchedExistingProfile) {
                skippedKeyTriggerDuplicates.push(
                  profile.name?.trim() || matchedExistingProfile.name,
                );
                if (
                  typeof profile.id === "string" &&
                  profile.id.trim().length > 0
                ) {
                  keyTriggerImportedToNewProfileId.set(
                    profile.id,
                    matchedExistingProfile.id,
                  );
                }
                return;
              }
            }

            const normalizedActions: KeyTriggerAction[] = (
              Array.isArray(profile.actions) ? profile.actions : []
            ).map((action, actionIndex) => ({
              ...action,
              id: createImportedKeyTriggerActionId(),
              name: action.name?.trim() || `Action ${actionIndex + 1}`,
              key: action.key?.trim() || "",
              delayMs: Math.max(0, Math.round(action.delayMs || 0)),
              enabled: action.enabled !== false,
              actionTriggerType:
                action.actionTriggerType === "repeat" ? "repeat" : "once",
              actionRepeatCount:
                action.actionTriggerType === "repeat"
                  ? normalizeKeyTriggerActionRepeatCount(
                      action.actionRepeatCount,
                      2,
                    )
                  : 1,
              executionScope:
                action.executionScope === "current" ||
                action.executionScope === "other" ||
                action.executionScope === "specific"
                  ? action.executionScope
                  : action.otherTabsOnly === true
                    ? "other"
                    : action.currentTabOnly === true
                      ? "current"
                      : "all",
              currentTabOnly: action.currentTabOnly === true,
              otherTabsOnly: action.otherTabsOnly === true,
              specificTargetTabIds: Array.from(
                new Set(
                  (action.specificTargetTabIds ?? []).filter((id) =>
                    Number.isFinite(id),
                  ),
                ),
              ),
              specificTargetTabNames: Array.from(
                new Set(
                  (action.specificTargetTabNames ?? []).filter(
                    (name): name is string =>
                      typeof name === "string" && name.trim().length > 0,
                  ),
                ),
              ),
            }));

            const normalizedSpecificTargetTabIds = Array.from(
              new Set(
                (Array.isArray(profile.specificTargetTabIds)
                  ? profile.specificTargetTabIds
                  : Number.isFinite(profile.specificTargetTabId)
                    ? [profile.specificTargetTabId as number]
                    : []
                ).filter((id) => Number.isFinite(id)),
              ),
            );
            const normalizedSpecificTargetTabNames = Array.from(
              new Set(
                (Array.isArray(profile.specificTargetTabNames)
                  ? profile.specificTargetTabNames
                  : typeof profile.specificTargetTabName === "string" &&
                      profile.specificTargetTabName.trim().length > 0
                    ? [profile.specificTargetTabName]
                    : []
                ).filter(
                  (name): name is string =>
                    typeof name === "string" && name.trim().length > 0,
                ),
              ),
            );

            const normalizedProfile: KeyTriggerProfile = {
              id: createImportedKeyTriggerProfileId(),
              profileIdentifier:
                importedProfileIdentifier ||
                createImportedKeyTriggerProfileIdentifier(),
              name:
                profile.name?.trim() ||
                `Imported key-trigger ${profileIndex + 1}`,
              enabled: profile.enabled !== false,
              triggerType:
                profile.triggerType === "toggle"
                  ? "toggle"
                  : profile.triggerType === "repeat"
                    ? "repeat"
                    : "once",
              repeatCount:
                profile.triggerType === "repeat"
                  ? normalizeKeyTriggerRunCount(profile.repeatCount, 2)
                  : 1,
              triggerKey: profile.triggerKey?.trim() || "",
              executionScope:
                profile.executionScope === "current" ||
                profile.executionScope === "other" ||
                profile.executionScope === "specific"
                  ? profile.executionScope
                  : profile.specificTargetTabId !== undefined &&
                      profile.specificTargetTabId !== null
                    ? "specific"
                    : profile.otherTabsOnly === true
                      ? "other"
                      : profile.currentTabOnly === true
                        ? "current"
                        : "all",
              currentTabOnly: profile.currentTabOnly === true,
              otherTabsOnly: profile.otherTabsOnly === true,
              specificTargetTabIds: normalizedSpecificTargetTabIds,
              specificTargetTabNames: normalizedSpecificTargetTabNames,
              specificTargetTabId: normalizedSpecificTargetTabIds[0] ?? null,
              specificTargetTabName:
                normalizedSpecificTargetTabNames[0] ?? null,
              delayMode:
                profile.delayMode === "synchronous"
                  ? "synchronous"
                  : "sequential",
              actions: normalizedActions,
            };

            const signature =
              buildKeyTriggerProfileSignature(normalizedProfile);
            if (existingKeyTriggerProfileSignatures.has(signature)) {
              skippedKeyTriggerDuplicates.push(normalizedProfile.name);
              return;
            }

            existingKeyTriggerProfileSignatures.add(signature);
            if (normalizedProfile.profileIdentifier) {
              existingKeyTriggerProfileByIdentifier.set(
                normalizedProfile.profileIdentifier,
                normalizedProfile,
              );
            }
            incomingKtProfiles.push(normalizedProfile);

            if (
              typeof profile.id === "string" &&
              profile.id.trim().length > 0
            ) {
              keyTriggerImportedToNewProfileId.set(
                profile.id,
                normalizedProfile.id,
              );
            }
          },
        );

        if (incomingKtProfiles.length > 0) {
          if (keyTriggerPresets.length === 0) {
            const defaultPresetId = "kt-preset-default";
            setKeyTriggerPresets([
              {
                id: defaultPresetId,
                name: "Default",
                switchShortcut: "",
                profiles: incomingKtProfiles,
              },
            ]);
            setSelectedKeyTriggerPresetId(defaultPresetId);
            setKeyTriggerProfiles(incomingKtProfiles);
            importWarnings.push(
              `Migrated ${incomingKtProfiles.length} legacy key-trigger profile${incomingKtProfiles.length > 1 ? "s" : ""} into preset "Default".`,
            );
          } else {
            const targetPresetId = keyTriggerPresets.some(
              (preset) => preset.id === selectedKeyTriggerPresetId,
            )
              ? selectedKeyTriggerPresetId
              : keyTriggerPresets[0].id;

            setKeyTriggerPresets((prev) =>
              prev.map((preset) =>
                preset.id === targetPresetId
                  ? {
                      ...preset,
                      profiles: [...preset.profiles, ...incomingKtProfiles],
                    }
                  : preset,
              ),
            );
            setKeyTriggerProfiles((prev) => [...prev, ...incomingKtProfiles]);
          }
        }

        if (
          parsed.keyTriggerCharacterProfileMapping &&
          typeof parsed.keyTriggerCharacterProfileMapping === "object"
        ) {
          const importedMapping = parsed.keyTriggerCharacterProfileMapping;
          const nextMapping: Record<string, string> = {};

          Object.entries(importedMapping).forEach(
            ([characterName, profileId]) => {
              if (
                typeof characterName !== "string" ||
                characterName.trim().length === 0 ||
                typeof profileId !== "string"
              ) {
                return;
              }

              const remappedId =
                keyTriggerImportedToNewProfileId.get(profileId);
              if (remappedId) {
                nextMapping[characterName.trim()] = remappedId;
              }
            },
          );

          if (Object.keys(nextMapping).length > 0) {
            setKeyTriggerCharacterProfileMapping((prev) => ({
              ...prev,
              ...nextMapping,
            }));
          }
        }

        if (skippedKeyTriggerDuplicates.length > 0) {
          importWarnings.push(
            `Skipped ${skippedKeyTriggerDuplicates.length} duplicate key-trigger profile${skippedKeyTriggerDuplicates.length > 1 ? "s" : ""}.`,
          );
        }
      } else if (
        parsed.keyTriggerCharacterProfileMapping &&
        typeof parsed.keyTriggerCharacterProfileMapping === "object"
      ) {
        const validProfileIds = new Set(
          keyTriggerProfiles.map((profile) => profile.id),
        );
        const filteredImportedMapping: Record<string, string> = {};

        Object.entries(parsed.keyTriggerCharacterProfileMapping).forEach(
          ([characterName, profileId]) => {
            if (
              typeof characterName === "string" &&
              characterName.trim().length > 0 &&
              typeof profileId === "string" &&
              validProfileIds.has(profileId)
            ) {
              filteredImportedMapping[characterName.trim()] = profileId;
            }
          },
        );

        if (Object.keys(filteredImportedMapping).length > 0) {
          setKeyTriggerCharacterProfileMapping((prev) => ({
            ...prev,
            ...filteredImportedMapping,
          }));
        }
      }

      if (
        (parsed as any).keyTriggerCharacterPresetMapping &&
        typeof (parsed as any).keyTriggerCharacterPresetMapping === "object"
      ) {
        const validPresetIds = new Set([
          ...keyTriggerPresets.map((preset) => preset.id),
          ...importedPresetIds,
        ]);
        const filteredImportedPresetMapping: Record<string, string> = {};

        Object.entries(
          (parsed as any).keyTriggerCharacterPresetMapping,
        ).forEach(([characterName, presetId]) => {
          if (
            typeof characterName === "string" &&
            characterName.trim().length > 0 &&
            typeof presetId === "string"
          ) {
            const remappedPresetId =
              importedPresetIdMap.get(presetId) ?? presetId;
            if (validPresetIds.has(remappedPresetId)) {
              filteredImportedPresetMapping[characterName.trim()] =
                remappedPresetId;
            }
          }
        });

        if (Object.keys(filteredImportedPresetMapping).length > 0) {
          setKeyTriggerCharacterPresetMapping((prev) => ({
            ...prev,
            ...filteredImportedPresetMapping,
          }));
        }
      }

      if (
        typeof (parsed as any).selectedKeyTriggerPresetId === "string" &&
        [
          ...keyTriggerPresets.map((preset) => preset.id),
          ...Array.from(importedPresetIds),
        ].includes(
          importedPresetIdMap.get((parsed as any).selectedKeyTriggerPresetId) ??
            (parsed as any).selectedKeyTriggerPresetId,
        )
      ) {
        setSelectedKeyTriggerPresetId(
          importedPresetIdMap.get((parsed as any).selectedKeyTriggerPresetId) ??
            (parsed as any).selectedKeyTriggerPresetId,
        );
      }

      const importedSelectedTabIds = Array.isArray(
        parsed.selectedKeyTriggerTabIds,
      )
        ? parsed.selectedKeyTriggerTabIds.filter((id): id is number =>
            Number.isFinite(id),
          )
        : [];
      const importedSelectedTabNames = Array.isArray(
        parsed.selectedKeyTriggerTabNames,
      )
        ? parsed.selectedKeyTriggerTabNames.filter(
            (name): name is string =>
              typeof name === "string" && name.trim().length > 0,
          )
        : [];

      if (
        importedSelectedTabIds.length > 0 ||
        importedSelectedTabNames.length > 0
      ) {
        const availableTabIdSet = new Set(
          keyTriggerCharacters.map((tab) => tab.id),
        );
        const availableTabNames = new Set(importedSelectedTabNames);
        const nameMatchedIds = keyTriggerCharacters
          .filter((tab) => availableTabNames.has(tab.name))
          .map((tab) => tab.id);

        const mergedSelectedIds = Array.from(
          new Set([
            ...importedSelectedTabIds.filter((id) => availableTabIdSet.has(id)),
            ...nameMatchedIds,
          ]),
        );

        if (mergedSelectedIds.length > 0) {
          setSelectedKeyTriggerTabIds(mergedSelectedIds);
        }
      }

      if (
        parsed.mapperCharacterProfileMapping &&
        typeof parsed.mapperCharacterProfileMapping === "object"
      ) {
        const importedMapperMapping = parsed.mapperCharacterProfileMapping;

        const filteredMapperMapping: Record<string, string> = {};
        Object.entries(importedMapperMapping).forEach(
          ([characterName, profileId]) => {
            if (
              typeof characterName === "string" &&
              characterName.trim().length > 0 &&
              typeof profileId === "string"
            ) {
              const remappedId = mapperImportedToNewProfileId.get(profileId);
              if (remappedId) {
                filteredMapperMapping[characterName.trim()] = remappedId;
              }
            }
          },
        );

        if (Object.keys(filteredMapperMapping).length > 0) {
          setMapperCharacterProfileMapping((prev) => ({
            ...prev,
            ...filteredMapperMapping,
          }));
        }
      }

      if (parsed.settings && typeof parsed.settings === "object") {
        setSettings(baseImportedSettings);
      }

      if (parsed.uiState && typeof parsed.uiState === "object") {
        const nextPaletteShape = parsed.uiState.selectedPaletteShape;
        if (
          nextPaletteShape === "rectangle" ||
          nextPaletteShape === "circle" ||
          nextPaletteShape === "ellipse" ||
          nextPaletteShape === "triangle" ||
          nextPaletteShape === "diamond" ||
          nextPaletteShape === "pentagon" ||
          nextPaletteShape === "hexagon" ||
          nextPaletteShape === "octagon" ||
          nextPaletteShape === "star" ||
          nextPaletteShape === "pill" ||
          nextPaletteShape === "arrow" ||
          nextPaletteShape === "trapezoid"
        ) {
          setSelectedPaletteShape(nextPaletteShape);
        }

        const nextUtilityTab = parsed.uiState.selectedUtilityTab;
        if (
          nextUtilityTab === "key-mapper" ||
          nextUtilityTab === "key-trigger" ||
          nextUtilityTab === "auto-awaken"
        ) {
          setActiveUtilityTab(nextUtilityTab);
        }

        if (
          parsed.uiState.dialogRect &&
          typeof parsed.uiState.dialogRect === "object"
        ) {
          const nextRect = parsed.uiState.dialogRect;
          const x = Number(nextRect.x);
          const y = Number(nextRect.y);
          const width = Number(nextRect.width);
          const height = Number(nextRect.height);

          setDialogRect({
            x: Number.isFinite(x) ? x : DEFAULT_DIALOG_RECT.x,
            y: Number.isFinite(y) ? y : DEFAULT_DIALOG_RECT.y,
            width: Number.isFinite(width)
              ? Math.max(360, width)
              : DEFAULT_DIALOG_RECT.width,
            height: Number.isFinite(height)
              ? Math.max(430, height)
              : DEFAULT_DIALOG_RECT.height,
          });
        }
      }

      if (
        importedProfiles.length === 0 &&
        !(
          Array.isArray(parsed.keyTriggerProfiles) &&
          parsed.keyTriggerProfiles.length > 0
        ) &&
        !(
          Array.isArray(parsed.selectedKeyTriggerTabIds) &&
          parsed.selectedKeyTriggerTabIds.length > 0
        ) &&
        !(
          Array.isArray(parsed.selectedKeyTriggerTabNames) &&
          parsed.selectedKeyTriggerTabNames.length > 0
        ) &&
        !(
          parsed.keyTriggerCharacterProfileMapping &&
          typeof parsed.keyTriggerCharacterProfileMapping === "object" &&
          Object.keys(parsed.keyTriggerCharacterProfileMapping).length > 0
        ) &&
        !(parsed.settings && typeof parsed.settings === "object") &&
        !(parsed.uiState && typeof parsed.uiState === "object") &&
        !(
          parsed.mapperCharacterProfileMapping &&
          typeof parsed.mapperCharacterProfileMapping === "object" &&
          Object.keys(parsed.mapperCharacterProfileMapping).length > 0
        )
      ) {
        Modal.error({
          className: "fm-confirm-modal",
          title: "Invalid import payload",
          content:
            "Please provide a valid tool-config JSON export with profiles, settings, or key-trigger data.",
          zIndex: 2147483647,
        });
        return;
      }

      setImportText("");
      setImportOpen(false);

      if (importWarnings.length > 0) {
        modal.warning({
          className: "fm-confirm-modal",
          title: "Some import items were skipped",
          content: importWarnings.join(" "),
          zIndex: 2147483647,
        });
      }
    } catch {
      Modal.error({
        className: "fm-confirm-modal",
        title: "Invalid import payload",
        content: "Please provide a valid tool-config JSON export.",
        zIndex: 2147483647,
      });
    }
  };

  const applyImport = () => {
    if (!canImportNow) {
      Modal.error({
        className: "fm-confirm-modal",
        title: "Cannot import tool config",
        content:
          importAnalysis.parseError ||
          "Please provide a valid tool-config JSON export.",
        zIndex: 2147483647,
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

    performImportWithName(
      hasKeyMapperProfiles ? suggestedName : "Imported",
      importText,
    );
  };

  const handleThemeChange = (value: ThemeMode) => {
    if (!isThemeMode(value)) {
      return;
    }

    setSettings((prev) => ({ ...prev, theme: value }));
  };

  const algorithm = isDarkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm;

  useEffect(() => {
    const bodyClass = "fm-dark-theme";
    if (isDarkTheme) {
      document.body.classList.add(bodyClass);
      return () => {
        document.body.classList.remove(bodyClass);
      };
    }

    document.body.classList.remove(bodyClass);
  }, [isDarkTheme]);

  useEffect(() => {
    const overlayRoot = document.getElementById(ROOT_ID);
    if (!overlayRoot) {
      return;
    }

    let appliedCursor: string | null = null;

    const readCursorVariable = (
      name: string,
      fallback: string,
      element?: Element | null,
    ): string => {
      const fromElement = element
        ? window.getComputedStyle(element).getPropertyValue(name).trim()
        : "";
      if (fromElement) {
        return fromElement;
      }

      const fromRoot = window
        .getComputedStyle(overlayRoot)
        .getPropertyValue(name)
        .trim();
      if (fromRoot) {
        return fromRoot;
      }

      const fromBody = window
        .getComputedStyle(document.body)
        .getPropertyValue(name)
        .trim();
      return fromBody || fallback;
    };

    const resolveOverlayCursor = (
      target: EventTarget | null,
    ): string | null => {
      if (rotateIdRef.current) {
        return null;
      }

      if (!(target instanceof Element) || !target.closest(`#${ROOT_ID}`)) {
        return null;
      }

      if (target.closest(".fm-automation-snipper")) {
        return "crosshair";
      }

      if (
        target.closest(
          ".react-resizable-handle-nw, .react-resizable-handle-se, .fm-resize-handle-tl, .fm-resize-handle-br",
        )
      ) {
        return readCursorVariable(
          "--fm-cursor-diag-primary",
          "nwse-resize",
          target,
        );
      }

      if (
        target.closest(
          ".react-resizable-handle-ne, .react-resizable-handle-sw, .fm-resize-handle-tr, .fm-resize-handle-bl",
        )
      ) {
        return readCursorVariable(
          "--fm-cursor-diag-secondary",
          "nesw-resize",
          target,
        );
      }

      if (
        target.closest(
          ".react-resizable-handle-n, .react-resizable-handle-s, .fm-resize-handle-t, .fm-resize-handle-b",
        )
      ) {
        return readCursorVariable("--fm-cursor-vertical", "ns-resize", target);
      }

      if (
        target.closest(
          ".react-resizable-handle-e, .react-resizable-handle-w, .fm-resize-handle-r, .fm-resize-handle-l",
        )
      ) {
        return readCursorVariable(
          "--fm-cursor-horizontal",
          "ew-resize",
          target,
        );
      }

      if (
        target.closest(
          [
            ".fm-shape-shortcut-input",
            ".fm-shape-context-input",
            ".fm-global-shortcut-input",
            ".ant-input",
            "input.ant-input",
            ".ant-input-number-input",
            "input",
            "textarea",
          ].join(", "),
        )
      ) {
        return readCursorVariable("--fm-cursor-input", "text", target);
      }

      if (
        target.closest(
          [
            ".fm-dialog",
            ".fm-panel",
            ".fm-toolbar",
            ".fm-shape",
            ".fm-shape-shell",
            ".fm-shape-fill",
            ".fm-shape-hit-area",
            ".fm-close-btn",
            ".fm-shortcut-input-shell",
            ".fm-shape-context-action",
            ".fm-rotate-handle",
          ].join(", "),
        )
      ) {
        return readCursorVariable("--fm-cursor-base", "auto", target);
      }

      return null;
    };

    const applyOverlayCursor = (target: EventTarget | null) => {
      const nextCursor = resolveOverlayCursor(target);

      if (!nextCursor) {
        if (appliedCursor !== null && !rotateIdRef.current) {
          document.body.style.cursor = "";
          appliedCursor = null;
        }
        return;
      }

      if (appliedCursor === nextCursor) {
        return;
      }

      document.body.style.cursor = nextCursor;
      appliedCursor = nextCursor;
    };

    const clearOverlayCursor = () => {
      if (appliedCursor !== null && !rotateIdRef.current) {
        document.body.style.cursor = "";
        appliedCursor = null;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      applyOverlayCursor(event.target);
    };

    const onPointerLeave = (event: PointerEvent) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Element && nextTarget.closest(`#${ROOT_ID}`)) {
        applyOverlayCursor(nextTarget);
        return;
      }

      clearOverlayCursor();
    };

    overlayRoot.addEventListener("pointermove", onPointerMove, true);
    overlayRoot.addEventListener("pointerover", onPointerMove, true);
    overlayRoot.addEventListener("pointerout", onPointerLeave, true);

    return () => {
      overlayRoot.removeEventListener("pointermove", onPointerMove, true);
      overlayRoot.removeEventListener("pointerover", onPointerMove, true);
      overlayRoot.removeEventListener("pointerout", onPointerLeave, true);
      clearOverlayCursor();
    };
  }, [rotateIdRef]);

  return (
    <ConfigProvider
      theme={{
        algorithm,
        token: resolvedTheme.token,
      }}
    >
      <App>
        {modalContextHolder}
        <div
          className={`fm-relative fm-size-full ${isDarkTheme ? "fm-dark fm-theme-dark" : "fm-theme-light"}`}
          style={
            {
              ["--fm-accent" as "--fm-accent"]: resolvedTheme.accent,
              ["--fm-theme-bg-base" as "--fm-theme-bg-base"]:
                resolvedTheme.token.colorBgBase,
              ["--fm-theme-bg-container" as "--fm-theme-bg-container"]:
                resolvedTheme.token.colorBgContainer,
              ["--fm-theme-bg-elevated" as "--fm-theme-bg-elevated"]:
                resolvedTheme.token.colorBgElevated,
              ["--fm-theme-bg-layout" as "--fm-theme-bg-layout"]:
                resolvedTheme.token.colorBgLayout,
              ["--fm-theme-text" as "--fm-theme-text"]:
                resolvedTheme.token.colorText,
              ["--fm-theme-text-secondary" as "--fm-theme-text-secondary"]:
                resolvedTheme.token.colorTextSecondary,
              ["--fm-theme-border" as "--fm-theme-border"]:
                resolvedTheme.token.colorBorder,
              ["--fm-theme-border-secondary" as "--fm-theme-border-secondary"]:
                resolvedTheme.token.colorBorderSecondary,
              ["--fm-theme-fill" as "--fm-theme-fill"]:
                resolvedTheme.token.colorFillSecondary,
              ["--fm-theme-fill-strong" as "--fm-theme-fill-strong"]:
                resolvedTheme.token.colorFillTertiary,
              ["--fm-theme-fill-soft" as "--fm-theme-fill-soft"]:
                resolvedTheme.token.colorFillQuaternary,
              ["--fm-theme-primary" as "--fm-theme-primary"]:
                resolvedTheme.token.colorPrimary,
              ["--fm-theme-primary-bg" as "--fm-theme-primary-bg"]:
                resolvedTheme.token.colorPrimaryBg,
              ["--fm-theme-success" as "--fm-theme-success"]:
                resolvedTheme.token.colorSuccess,
              ["--fm-theme-success-bg" as "--fm-theme-success-bg"]:
                resolvedTheme.token.colorSuccessBg,
              ["--fm-theme-warning" as "--fm-theme-warning"]:
                resolvedTheme.token.colorWarning,
              ["--fm-theme-warning-bg" as "--fm-theme-warning-bg"]:
                resolvedTheme.token.colorWarningBg,
              ["--fm-theme-error" as "--fm-theme-error"]:
                resolvedTheme.token.colorError,
              ["--fm-theme-error-bg" as "--fm-theme-error-bg"]:
                resolvedTheme.token.colorErrorBg,
              ["--fm-theme-info-bg" as "--fm-theme-info-bg"]:
                resolvedTheme.token.colorInfoBg,
            } as CSSProperties
          }
        >
          <ShapeOverlay
            overlayVisible={overlayVisible}
            dialogVisible={dialogVisible}
            shapesVisible={shapesVisible || autoAwakenTemporaryShape !== null}
            shapes={visibleShapes}
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
            onFactoryResetConfiguration={factoryResetConfiguration}
            onRestoreDialogConfiguration={restoreKeyMapperProfilesFromBackup}
            settings={settings}
            toggleMode={toggleMode}
            addKeyMap={addKeyMap}
            profiles={profiles}
            selectedProfile={selectedProfile}
            onSelectProfileChange={(value) => {
              requestProfileSwitch(value);
            }}
            onCreateProfileWithName={createProfile}
            duplicateSelectedProfile={duplicateSelectedProfile}
            onRenameProfileWithName={renameSelectedProfile}
            deleteSelectedProfile={deleteSelectedProfile}
            activeUtilityTab={activeUtilityTab}
            onActiveUtilityTabChange={setActiveUtilityTab}
            selectedPaletteShape={selectedPaletteShape}
            setSelectedPaletteShape={setSelectedPaletteShape}
            handleThemeChange={handleThemeChange}
            setShapes={setShapes}
            normalizeShape={normalizeShape}
            setSettings={setSettings}
            exportMappings={exportMappings}
            setImportOpen={setImportOpen}
            captureGlobalShortcut={captureGlobalShortcut}
            globalShortcutErrors={globalShortcutErrors}
            keyTriggerPresets={keyTriggerPresets}
            selectedKeyTriggerPresetId={selectedKeyTriggerPresetId}
            setKeyTriggerPresets={setKeyTriggerPresets}
            setSelectedKeyTriggerPresetId={setSelectedKeyTriggerPresetId}
            keyTriggerCharacters={keyTriggerCharacters}
            selectedKeyTriggerTabIds={selectedKeyTriggerTabIds}
            onSelectedKeyTriggerTabIdsChange={setSelectedKeyTriggerTabIds}
            keyTriggerCharacterPresetMapping={keyTriggerCharacterPresetMapping}
            setKeyTriggerCharacterPresetMapping={
              setKeyTriggerCharacterPresetMapping
            }
            keyTriggerCharacterProfileMapping={
              keyTriggerCharacterProfileMapping
            }
            setKeyTriggerCharacterProfileMapping={
              setKeyTriggerCharacterProfileMapping
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
            accessLoading={accessControl.loading}
            subscriptionPlan={accessControl.plan}
            accessRole={accessControl.role}
            canManageAccess={accessControl.canManageAccess}
            canManageAdmins={accessControl.canManageAdmins}
            canGenerateTokens={accessControl.canGenerateTokens}
            hasToolAccess={accessControl.hasToolAccess}
            accessReason={accessControl.reason}
            tokenExpiresAtIso={accessControl.tokenExpiresAtIso}
            accessLastCheckedAtIso={accessLastCheckedAtIso}
            accessSource={accessControl.accessSource}
            onGenerateSubscriptionToken={handleGenerateSubscriptionToken}
            onListSubscriptionTokens={handleListSubscriptionTokens}
            onRevokeSubscriptionToken={handleRevokeSubscriptionToken}
            onDeleteSubscriptionToken={handleDeleteSubscriptionToken}
            onRefreshAccessControl={refreshAccessControl}
            featureAccess={{
              keyTrigger: canUseKeyTrigger,
              autoHoly: canUseAutoHoly,
              autoPills: canUseAutoPills,
              autoAwaken: canUseAutoAwaken,
              syncMouse: canUseSyncMouseEvents,
            }}
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
            }}
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

  const resolveExtensionAssetUrl = (assetPath: string) =>
    typeof chrome !== "undefined" && chrome.runtime?.getURL
      ? chrome.runtime.getURL(assetPath)
      : assetPath;

  const rootElement = document.createElement("div");
  rootElement.id = ROOT_ID;
  const cursorVariables = {
    "--fm-cursor-base": `url("${resolveExtensionAssetUrl("curbase.cur")}"), auto`,
    "--fm-cursor-input": `url("${resolveExtensionAssetUrl("edit.cur")}"), text`,
    "--fm-cursor-diag-primary": `url("${resolveExtensionAssetUrl("cur00001.cur")}"), nwse-resize`,
    "--fm-cursor-diag-secondary": `url("${resolveExtensionAssetUrl("cur00002.cur")}"), nesw-resize`,
    "--fm-cursor-vertical": `url("${resolveExtensionAssetUrl("resize_h.cur")}"), ns-resize`,
    "--fm-cursor-horizontal": `url("${resolveExtensionAssetUrl("hori.cur")}"), ew-resize`,
  } as const;

  Object.entries(cursorVariables).forEach(([name, value]) => {
    rootElement.style.setProperty(name, value);
    document.body.style.setProperty(name, value);
  });

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

void (async () => {
  await storage.initialize();
  mount();
})();
