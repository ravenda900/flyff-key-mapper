import { getApp, getApps, initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

export type SubscriptionPlan = "free" | "pro" | "elite";
export type AccessRole = "user" | "admin" | "superadmin";

export type AccessFeature =
  | "keyTrigger"
  | "autoHoly"
  | "autoPills"
  | "autoAwaken"
  | "syncMouse"
  | "experimentalFeatures";

export type AccessControlState = {
  loading: boolean;
  ipAddress: string | null;
  whitelisted: boolean;
  hasToolAccess: boolean;
  accessSource: "none" | "whitelist" | "token";
  plan: SubscriptionPlan;
  role: AccessRole;
  canManageAccess: boolean;
  canManageAdmins: boolean;
  canGenerateTokens: boolean;
  tokenExpiresAtIso: string | null;
  features: Record<AccessFeature, boolean>;
  reason: string | null;
};

export type AccessUpdatePayload = {
  targetIp: string;
  whitelisted: boolean;
  plan: SubscriptionPlan;
  expiresAtIso?: string | null;
};

export type RoleUpdatePayload = {
  targetIp: string;
  role: AccessRole;
};

export type ClaimsByEmailPayload = {
  email: string;
  role: AccessRole;
  ip?: string | null;
};

export type ClaimsLookupByEmailPayload = {
  email: string;
};

export type ClaimsLookupResult = {
  uid: string;
  email: string;
  claims: {
    role?: string;
    ip?: string;
  };
};

export type TokenValidationResult = {
  valid: boolean;
  plan: SubscriptionPlan;
  expiresAtIso: string | null;
  reason: string | null;
};

export type TokenGenerationPayload = {
  plan: SubscriptionPlan;
};

export type TokenGenerationResult = {
  token: string;
  plan: SubscriptionPlan;
  expiresAtIso: string;
};

export type SubscriptionTokenRecord = {
  tokenHash: string;
  plan: SubscriptionPlan;
  expiresAt: string | null;
  createdAt: string | null;
  createdByIp: string | null;
  isExpired: boolean;
};

export type WhitelistUserRecord = {
  ip: string;
  name: string | null;
  role: AccessRole;
  updatedAtIso: string | null;
};

export type WhitelistUserUpsertPayload = {
  targetIp: string;
  previousIp?: string | null;
  name?: string | null;
  role: AccessRole;
};

const PLAN_FEATURES: Record<SubscriptionPlan, AccessFeature[]> = {
  free: [],
  pro: ["keyTrigger", "autoHoly", "autoPills", "syncMouse"],
  elite: [
    "keyTrigger",
    "autoHoly",
    "autoPills",
    "syncMouse",
    "autoAwaken",
    "experimentalFeatures",
  ],
};

const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined,
};

const TOKEN_COLLECTION = "subscriptionTokens";
const ACCESS_CONTROL_MODE =
  ((import.meta.env.VITE_ACCESS_CONTROL_MODE as string | undefined) ?? "spark")
    .trim()
    .toLowerCase() === "blaze"
    ? "blaze"
    : "spark";
const PLAN_DURATION_DAYS: Record<SubscriptionPlan, number> = {
  free: 7,
  pro: 30,
  elite: 90,
};

const isFirebaseConfigReady = () =>
  Boolean(
    FIREBASE_CONFIG.apiKey &&
    FIREBASE_CONFIG.authDomain &&
    FIREBASE_CONFIG.projectId &&
    FIREBASE_CONFIG.appId,
  );

const getFirebaseApp = () => {
  if (!isFirebaseConfigReady()) {
    return null;
  }

  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(FIREBASE_CONFIG);
};

const buildFeatureFlags = (
  plan: SubscriptionPlan,
): Record<AccessFeature, boolean> => {
  const enabled = new Set(PLAN_FEATURES[plan]);

  return {
    keyTrigger: enabled.has("keyTrigger"),
    autoHoly: enabled.has("autoHoly"),
    autoPills: enabled.has("autoPills"),
    autoAwaken: enabled.has("autoAwaken"),
    syncMouse: enabled.has("syncMouse"),
    experimentalFeatures: enabled.has("experimentalFeatures"),
  };
};

const getEpochMs = (value: unknown): number | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toMillis" in value &&
    typeof (value as { toMillis: unknown }).toMillis === "function"
  ) {
    const maybeMs = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(maybeMs) ? maybeMs : null;
  }

  return null;
};

const DEFAULT_STATE: AccessControlState = {
  loading: false,
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
  features: buildFeatureFlags("free"),
  reason: "Access is not configured.",
};

const resolveRole = (value: unknown): AccessRole => {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "superadmin") {
    return "superadmin";
  }
  if (normalized === "admin") {
    return "admin";
  }

  return "user";
};

const isValidIpAddress = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6 = /^([0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}$/i;
  return ipv4.test(trimmed) || ipv6.test(trimmed);
};

const requireManageAccessPermission = (actor: AccessControlState) => {
  if (!actor.whitelisted || !actor.canManageAccess) {
    throw new Error("Access denied. Admin privileges are required.");
  }
};

const requireSuperAdminPermission = (actor: AccessControlState) => {
  if (!actor.whitelisted || !actor.canManageAdmins) {
    throw new Error(
      "Access denied. Superadmin privileges are required for role management.",
    );
  }
};

const fetchPublicIp = async (): Promise<string | null> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch("https://api.ipify.org?format=json", {
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const parsed = (await response.json()) as { ip?: unknown };
    return typeof parsed.ip === "string" && parsed.ip.trim().length > 0
      ? parsed.ip.trim()
      : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
};

const toBase64Url = (bytes: Uint8Array): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    const value = (a << 16) | (b << 8) | c;

    output += chars[(value >> 18) & 63];
    output += chars[(value >> 12) & 63];
    output += index + 1 < bytes.length ? chars[(value >> 6) & 63] : "";
    output += index + 2 < bytes.length ? chars[value & 63] : "";
  }

  return output;
};

const createToken = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

const hashToken = async (token: string): Promise<string> => {
  const source = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", source);
  const view = new Uint8Array(digest);
  return Array.from(view)
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
};

const addDaysIso = (days: number): string => {
  const next = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
};

const validateSubscriptionTokenDirect = async (
  app: ReturnType<typeof getFirebaseApp>,
  token: string,
): Promise<TokenValidationResult> => {
  if (!app) {
    return {
      valid: false,
      plan: "free",
      expiresAtIso: null,
      reason: "Firebase is not configured.",
    };
  }

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return {
      valid: false,
      plan: "free",
      expiresAtIso: null,
      reason: null,
    };
  }

  const db = getFirestore(app);
  const tokenHash = await hashToken(trimmedToken);
  const snapshot = await getDoc(doc(db, TOKEN_COLLECTION, tokenHash));
  if (!snapshot.exists()) {
    return {
      valid: false,
      plan: "free",
      expiresAtIso: null,
      reason: "Invalid subscription token.",
    };
  }

  const data = snapshot.data() as {
    plan?: unknown;
    expiresAt?: unknown;
  };
  const expiresAtMs = getEpochMs(data.expiresAt);
  const expiresAtIso =
    typeof data.expiresAt === "string" && data.expiresAt.trim().length > 0
      ? data.expiresAt
      : null;

  if (expiresAtMs === null || Date.now() > expiresAtMs) {
    return {
      valid: false,
      plan: "free",
      expiresAtIso,
      reason: "Subscription token has expired.",
    };
  }

  return {
    valid: true,
    plan: resolvePlan(data.plan),
    expiresAtIso,
    reason: null,
  };
};

const resolvePlan = (value: unknown): SubscriptionPlan => {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "pro") {
    return "pro";
  }
  if (normalized === "elite") {
    return "elite";
  }

  return "free";
};

export const resolveAccessControlState = async (options?: {
  subscriptionToken?: string;
}): Promise<AccessControlState> => {
  const app = getFirebaseApp();
  if (!app) {
    return {
      ...DEFAULT_STATE,
      reason:
        "Firebase is not configured. Set VITE_FIREBASE_* env values to enable whitelist and subscriptions.",
    };
  }

  const ipAddress = await fetchPublicIp();
  if (!ipAddress) {
    return {
      ...DEFAULT_STATE,
      reason:
        "Unable to determine public IP address. Access check could not be completed.",
    };
  }

  try {
    if (ACCESS_CONTROL_MODE === "blaze") {
      const functions = getFunctions(app);
      const callable = httpsCallable<
        { requesterIp: string; subscriptionToken?: string },
        Omit<AccessControlState, "loading" | "features"> & {
          ipAddress: string | null;
        }
      >(functions, "resolveAccessControl");

      const response = await callable({
        requesterIp: ipAddress,
        subscriptionToken: options?.subscriptionToken ?? "",
      });
      const data = response.data;
      const resolvedRole = resolveRole(data.role);

      return {
        loading: false,
        ipAddress: data.ipAddress,
        whitelisted: data.whitelisted,
        hasToolAccess: data.hasToolAccess,
        accessSource: data.accessSource,
        plan: resolvePlan(data.plan),
        role: resolvedRole,
        canManageAccess: data.canManageAccess === true,
        canManageAdmins: data.canManageAdmins === true,
        canGenerateTokens:
          resolvedRole === "superadmin" || resolvedRole === "admin",
        tokenExpiresAtIso:
          typeof data.tokenExpiresAtIso === "string" &&
          data.tokenExpiresAtIso.trim().length > 0
            ? data.tokenExpiresAtIso
            : null,
        features: buildFeatureFlags(resolvePlan(data.plan)),
        reason:
          typeof data.reason === "string" && data.reason.trim().length > 0
            ? data.reason
            : null,
      };
    }

    const db = getFirestore(app);
    const whitelistSnapshot = await getDoc(doc(db, "whitelist", ipAddress));
    const hasWhitelistDoc = whitelistSnapshot.exists();

    let role: AccessRole = "user";
    let canManageAccess = false;
    let canManageAdmins = false;
    let canGenerateTokens = false;
    let isWhitelisted = false;

    if (hasWhitelistDoc) {
      const whitelistData = whitelistSnapshot.data() as {
        role?: unknown;
      };

      role = resolveRole(whitelistData.role);
      canManageAccess = role === "superadmin";
      canManageAdmins = role === "superadmin";
      canGenerateTokens = role === "superadmin" || role === "admin";
      isWhitelisted = true;
    }

    if (isWhitelisted) {
      const plan: SubscriptionPlan = "elite";

      return {
        loading: false,
        ipAddress,
        whitelisted: true,
        hasToolAccess: true,
        accessSource: "whitelist",
        plan,
        role,
        canManageAccess,
        canManageAdmins,
        canGenerateTokens,
        tokenExpiresAtIso: null,
        features: buildFeatureFlags(plan),
        reason: null,
      };
    }

    const tokenValidation = await validateSubscriptionTokenDirect(
      app,
      options?.subscriptionToken ?? "",
    );

    if (tokenValidation.valid) {
      return {
        loading: false,
        ipAddress,
        whitelisted: false,
        hasToolAccess: true,
        accessSource: "token",
        plan: tokenValidation.plan,
        role: "user",
        canManageAccess: false,
        canManageAdmins: false,
        canGenerateTokens: false,
        tokenExpiresAtIso: tokenValidation.expiresAtIso,
        features: buildFeatureFlags(tokenValidation.plan),
        reason: null,
      };
    }

    return {
      ...DEFAULT_STATE,
      ipAddress,
      role,
      canManageAccess,
      canManageAdmins,
      canGenerateTokens,
      reason:
        tokenValidation.reason ??
        (hasWhitelistDoc
          ? `Your IP address exists in whitelist records but access could not be resolved. Detected IP: ${ipAddress}`
          : `Your IP address is not whitelisted and no valid subscription token was found. Detected IP: ${ipAddress}`),
    };
  } catch {
    return {
      ...DEFAULT_STATE,
      ipAddress,
      reason: `Unable to read access data from Firebase. Access denied. Detected IP: ${ipAddress}`,
    };
  }
};

export const updateWhitelistAndSubscription = async (
  actor: AccessControlState,
  payload: AccessUpdatePayload,
): Promise<void> => {
  requireManageAccessPermission(actor);

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const targetIp = payload.targetIp.trim();
  if (!isValidIpAddress(targetIp)) {
    throw new Error("Please enter a valid target IP address.");
  }

  const db = getFirestore(app);
  const whitelistRef = doc(db, "whitelist", targetIp);
  const existingWhitelist = await getDoc(whitelistRef);
  const existingRole = existingWhitelist.exists()
    ? resolveRole((existingWhitelist.data() as { role?: unknown }).role)
    : "user";

  const nextPlan = resolvePlan(payload.plan);

  if (payload.whitelisted) {
    await setDoc(
      whitelistRef,
      {
        role: existingRole,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.ipAddress,
      },
      { merge: true },
    );
  } else {
    await deleteDoc(whitelistRef);
  }
  await setDoc(
    doc(db, "subscriptions", targetIp),
    {
      plan: nextPlan,
      expiresAt:
        payload.expiresAtIso && payload.expiresAtIso.trim().length > 0
          ? payload.expiresAtIso.trim()
          : addDaysIso(PLAN_DURATION_DAYS[nextPlan]),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.ipAddress,
    },
    { merge: true },
  );
};

export const updateUserRole = async (
  actor: AccessControlState,
  payload: RoleUpdatePayload,
): Promise<void> => {
  requireSuperAdminPermission(actor);

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const targetIp = payload.targetIp.trim();
  if (!isValidIpAddress(targetIp)) {
    throw new Error("Please enter a valid target IP address.");
  }

  const db = getFirestore(app);
  const role = resolveRole(payload.role);

  await setDoc(
    doc(db, "whitelist", targetIp),
    {
      role,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.ipAddress,
    },
    { merge: true },
  );
};

export const generateSubscriptionToken = async (
  actor: AccessControlState,
  payload: TokenGenerationPayload,
): Promise<TokenGenerationResult> => {
  if (!actor.hasToolAccess || !actor.canGenerateTokens) {
    throw new Error("Access denied. Token generation privileges are required.");
  }

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const plan = resolvePlan(payload.plan);

  if (ACCESS_CONTROL_MODE === "blaze") {
    const functions = getFunctions(app);
    const callable = httpsCallable<
      {
        plan: SubscriptionPlan;
        requesterIp: string;
      },
      TokenGenerationResult
    >(functions, "generateSubscriptionToken");

    const response = await callable({
      plan,
      requesterIp: actor.ipAddress ?? "",
    });

    const data = response.data;
    return {
      token: data.token,
      plan: resolvePlan(data.plan),
      expiresAtIso: data.expiresAtIso,
    };
  }

  const token = createToken();
  const tokenHash = await hashToken(token);
  const expiresAtIso = addDaysIso(PLAN_DURATION_DAYS[plan]);
  const db = getFirestore(app);

  await setDoc(
    doc(db, TOKEN_COLLECTION, tokenHash),
    {
      tokenHash,
      plan,
      expiresAt: expiresAtIso,
      createdAt: new Date().toISOString(),
      createdByIp: actor.ipAddress,
    },
    { merge: true },
  );

  return {
    token,
    plan,
    expiresAtIso,
  };
};

export const assignClaimsByEmail = async (
  actor: AccessControlState,
  payload: ClaimsByEmailPayload,
): Promise<{ uid: string; email: string }> => {
  if (ACCESS_CONTROL_MODE !== "blaze") {
    throw new Error(
      "Assign Claims by Email requires Blaze mode with deployed Cloud Functions.",
    );
  }

  requireSuperAdminPermission(actor);

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const email = payload.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please enter a valid target email address.");
  }

  const role = resolveRole(payload.role);
  const ip = typeof payload.ip === "string" ? payload.ip.trim() : "";
  if (ip && !isValidIpAddress(ip)) {
    throw new Error("Please enter a valid claim IP address.");
  }

  const functions = getFunctions(app);
  const callable = httpsCallable<
    {
      email: string;
      role: AccessRole;
      ip: string | null;
      actorIp: string;
    },
    { uid: string; email: string }
  >(functions, "assignClaimsByEmail");

  const response = await callable({
    email,
    role,
    ip: ip || null,
    actorIp: actor.ipAddress ?? "",
  });

  return response.data;
};

export const lookupClaimsByEmail = async (
  actor: AccessControlState,
  payload: ClaimsLookupByEmailPayload,
): Promise<ClaimsLookupResult> => {
  if (ACCESS_CONTROL_MODE !== "blaze") {
    throw new Error(
      "Lookup Claims by Email requires Blaze mode with deployed Cloud Functions.",
    );
  }

  requireSuperAdminPermission(actor);

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const email = payload.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Please enter a valid target email address.");
  }

  const functions = getFunctions(app);
  const callable = httpsCallable<
    {
      email: string;
      actorIp: string;
    },
    ClaimsLookupResult
  >(functions, "getClaimsByEmail");

  const response = await callable({
    email,
    actorIp: actor.ipAddress ?? "",
  });

  return response.data;
};

export const listSubscriptionTokens = async (
  actor: AccessControlState,
): Promise<SubscriptionTokenRecord[]> => {
  if (!actor.canGenerateTokens) {
    throw new Error("You do not have permission to list subscription tokens.");
  }

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  if (ACCESS_CONTROL_MODE === "blaze") {
    const functions = getFunctions(app);
    const callable = httpsCallable<
      { requesterIp: string },
      { tokens: SubscriptionTokenRecord[] }
    >(functions, "listSubscriptionTokens");

    const response = await callable({ requesterIp: actor.ipAddress ?? "" });
    return response.data.tokens;
  }

  const db = getFirestore(app);
  const snapshot =
    actor.role === "superadmin"
      ? await getDocs(collection(db, TOKEN_COLLECTION))
      : await getDocs(
          query(
            collection(db, TOKEN_COLLECTION),
            where("createdByIp", "==", actor.ipAddress ?? ""),
          ),
        );

  return snapshot.docs
    .map((tokenDoc) => {
      const data = tokenDoc.data() as {
        plan?: unknown;
        expiresAt?: unknown;
        createdAt?: unknown;
        createdByIp?: unknown;
      };
      const expiresAtMs = getEpochMs(data.expiresAt);
      const isExpired = expiresAtMs !== null && Date.now() > expiresAtMs;
      return {
        tokenHash: tokenDoc.id,
        plan: resolvePlan(data.plan),
        expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
        createdByIp:
          typeof data.createdByIp === "string" ? data.createdByIp : null,
        isExpired,
      };
    })
    .sort((left, right) => {
      const leftMs = getEpochMs(left.createdAt) ?? 0;
      const rightMs = getEpochMs(right.createdAt) ?? 0;
      return rightMs - leftMs;
    });
};

export const revokeSubscriptionToken = async (
  actor: AccessControlState,
  tokenHash: string,
): Promise<void> => {
  if (!actor.canGenerateTokens) {
    throw new Error(
      "You do not have permission to revoke subscription tokens.",
    );
  }

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  if (ACCESS_CONTROL_MODE === "blaze") {
    const functions = getFunctions(app);
    const callable = httpsCallable<
      { tokenHash: string; requesterIp: string },
      { ok: boolean }
    >(functions, "revokeSubscriptionToken");

    await callable({ tokenHash, requesterIp: actor.ipAddress ?? "" });
    return;
  }

  const db = getFirestore(app);
  await updateDoc(doc(db, TOKEN_COLLECTION, tokenHash), {
    expiresAt: new Date().toISOString(),
    revokedAt: new Date().toISOString(),
    revokedByIp: actor.ipAddress ?? "",
  });
};

export const deleteSubscriptionToken = async (
  actor: AccessControlState,
  tokenHash: string,
): Promise<void> => {
  if (!actor.canGenerateTokens) {
    throw new Error(
      "You do not have permission to delete subscription tokens.",
    );
  }

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const db = getFirestore(app);
  const tokenRef = doc(db, TOKEN_COLLECTION, tokenHash);
  const tokenSnapshot = await getDoc(tokenRef);
  if (!tokenSnapshot.exists()) {
    return;
  }

  const createdByIp = (tokenSnapshot.data() as { createdByIp?: unknown })
    .createdByIp;

  if (
    actor.role !== "superadmin" &&
    (!actor.ipAddress || createdByIp !== actor.ipAddress)
  ) {
    throw new Error("You can only delete subscription tokens you created.");
  }

  await deleteDoc(tokenRef);
};

export const listWhitelistUsers = async (
  actor: AccessControlState,
): Promise<WhitelistUserRecord[]> => {
  requireSuperAdminPermission(actor);

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const db = getFirestore(app);
  const whitelistSnapshot = await getDocs(collection(db, "whitelist"));

  return whitelistSnapshot.docs
    .map((entry) => {
      const data = entry.data() as {
        name?: unknown;
        role?: unknown;
        updatedAt?: unknown;
      };
      const role = resolveRole(data.role);
      const name =
        typeof data.name === "string" && data.name.trim().length > 0
          ? data.name.trim()
          : null;

      return {
        ip: entry.id,
        name,
        role,
        updatedAtIso:
          typeof data.updatedAt === "string" ? data.updatedAt : null,
      } satisfies WhitelistUserRecord;
    })
    .filter((entry) => entry.role !== "superadmin")
    .sort((left, right) => {
      const leftMs = getEpochMs(left.updatedAtIso) ?? 0;
      const rightMs = getEpochMs(right.updatedAtIso) ?? 0;
      return rightMs - leftMs;
    });
};

export const upsertWhitelistUser = async (
  actor: AccessControlState,
  payload: WhitelistUserUpsertPayload,
): Promise<void> => {
  requireSuperAdminPermission(actor);

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const targetIp = payload.targetIp.trim();
  if (!isValidIpAddress(targetIp)) {
    throw new Error("Please enter a valid target IP address.");
  }

  const previousIp = (payload.previousIp ?? "").trim();
  if (previousIp && previousIp !== targetIp && !isValidIpAddress(previousIp)) {
    throw new Error("Please enter a valid previous IP address.");
  }

  const role = resolveRole(payload.role);

  const db = getFirestore(app);

  await setDoc(
    doc(db, "whitelist", targetIp),
    {
      name:
        typeof payload.name === "string" && payload.name.trim().length > 0
          ? payload.name.trim()
          : null,
      role,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.ipAddress,
    },
    { merge: true },
  );

  if (previousIp && previousIp !== targetIp) {
    await deleteDoc(doc(db, "whitelist", previousIp));
  }
};

export const deleteWhitelistUser = async (
  actor: AccessControlState,
  targetIp: string,
): Promise<void> => {
  requireSuperAdminPermission(actor);

  const app = getFirebaseApp();
  if (!app) {
    throw new Error("Firebase is not configured.");
  }

  const normalizedIp = targetIp.trim();
  if (!isValidIpAddress(normalizedIp)) {
    throw new Error("Please enter a valid target IP address.");
  }

  const db = getFirestore(app);
  await deleteDoc(doc(db, "whitelist", normalizedIp));
  await deleteDoc(doc(db, "subscriptions", normalizedIp));
};
