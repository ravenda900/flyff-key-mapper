import { randomBytes, createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

const VALID_ROLES = new Set(["user", "admin", "superadmin"]);
const VALID_PLANS = new Set(["free", "pro", "elite"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_BYTE_LENGTH = 24;
const TOKEN_COLLECTION = "subscriptionTokens";

const PLAN_DURATION_DAYS = {
  free: 7,
  pro: 30,
  elite: 90,
};

const parseForwardedIp = (raw) => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return "";
  }

  return (
    raw
      .split(",")
      .map((part) => part.trim())
      .find((part) => part.length > 0) ?? ""
  );
};

const resolveRequesterIp = (request, actorIp) => {
  const byHeader = parseForwardedIp(
    request.rawRequest?.headers?.["x-forwarded-for"],
  );
  if (byHeader) {
    return byHeader;
  }

  if (
    typeof request.rawRequest?.ip === "string" &&
    request.rawRequest.ip.trim().length > 0
  ) {
    return request.rawRequest.ip.trim();
  }

  if (typeof actorIp === "string" && actorIp.trim().length > 0) {
    return actorIp.trim();
  }

  return "";
};

const hashToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

const createToken = () => randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");

const addDaysIso = (days) => {
  const next = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
};

const resolveRole = (value) => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "superadmin") {
    return "superadmin";
  }
  if (normalized === "admin") {
    return "admin";
  }
  return "user";
};

const resolvePlan = (value) => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "pro") {
    return "pro";
  }
  if (normalized === "elite") {
    return "elite";
  }
  return "free";
};

const normalizeStatus = (value) => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "inactive" ? "inactive" : "active";
};

const getEpochMs = (value) => {
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
    const parsed = value.getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    typeof value.toMillis === "function"
  ) {
    const parsed = value.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const loadRequesterAccess = async (request, actorIp) => {
  const requesterIp = resolveRequesterIp(request, actorIp);
  if (!requesterIp) {
    throw new HttpsError(
      "permission-denied",
      "Unable to determine requester IP.",
    );
  }

  const db = getFirestore();
  const whitelistSnapshot = await db.doc(`whitelist/${requesterIp}`).get();
  if (!whitelistSnapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "Requester IP is not whitelisted.",
    );
  }

  const whitelistData = whitelistSnapshot.data() ?? {};
  const role = resolveRole(whitelistData.role);
  const enabled = whitelistData.enabled !== false;
  const blocked = whitelistData.blocked === true;
  const canGenerateTokens =
    role === "superadmin" || whitelistData.canGenerateTokens === true;

  return {
    requesterIp,
    role,
    enabled,
    blocked,
    canGenerateTokens,
  };
};

const assertSuperadminRequester = async (request, actorIp) => {
  const requester = await loadRequesterAccess(request, actorIp);
  if (
    !requester.enabled ||
    requester.blocked ||
    requester.role !== "superadmin"
  ) {
    throw new HttpsError(
      "permission-denied",
      "Superadmin whitelist role is required.",
    );
  }
  return requester;
};

const assertTokenIssuerRequester = async (request, actorIp) => {
  const requester = await loadRequesterAccess(request, actorIp);
  if (!requester.enabled || requester.blocked || !requester.canGenerateTokens) {
    throw new HttpsError(
      "permission-denied",
      "Token issuer privileges are required.",
    );
  }
  return requester;
};

const buildTokenValidationResult = (data) => {
  if (!data) {
    return {
      valid: false,
      plan: "free",
      expiresAtIso: null,
      reason: "Invalid subscription token.",
    };
  }

  const expiresAtMs = getEpochMs(data.expiresAt);
  if (expiresAtMs === null || Date.now() > expiresAtMs) {
    return {
      valid: false,
      plan: "free",
      expiresAtIso:
        typeof data.expiresAt === "string" && data.expiresAt.trim().length > 0
          ? data.expiresAt
          : null,
      reason: "Subscription token has expired.",
    };
  }

  if (normalizeStatus(data.status) !== "active") {
    return {
      valid: false,
      plan: "free",
      expiresAtIso:
        typeof data.expiresAt === "string" && data.expiresAt.trim().length > 0
          ? data.expiresAt
          : null,
      reason: "Subscription token is inactive.",
    };
  }

  return {
    valid: true,
    plan: resolvePlan(data.plan),
    expiresAtIso:
      typeof data.expiresAt === "string" && data.expiresAt.trim().length > 0
        ? data.expiresAt
        : null,
    reason: null,
  };
};

export const assignClaimsByEmail = onCall({ cors: true }, async (request) => {
  const email =
    typeof request.data?.email === "string"
      ? request.data.email.trim().toLowerCase()
      : "";
  const role =
    typeof request.data?.role === "string"
      ? request.data.role.trim().toLowerCase()
      : "";
  const ip = typeof request.data?.ip === "string" ? request.data.ip.trim() : "";
  const actorIp =
    typeof request.data?.actorIp === "string"
      ? request.data.actorIp.trim()
      : "";

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError(
      "invalid-argument",
      "A valid target email is required.",
    );
  }

  if (!VALID_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "A valid role is required.");
  }

  await assertSuperadminRequester(request, actorIp);

  const auth = getAuth();
  const targetUser = await auth.getUserByEmail(email);
  const claims = {
    role,
    ...(ip ? { ip } : {}),
  };

  await auth.setCustomUserClaims(targetUser.uid, claims);

  return {
    ok: true,
    uid: targetUser.uid,
    email,
    claims,
  };
});

export const getClaimsByEmail = onCall({ cors: true }, async (request) => {
  const email =
    typeof request.data?.email === "string"
      ? request.data.email.trim().toLowerCase()
      : "";
  const actorIp =
    typeof request.data?.actorIp === "string"
      ? request.data.actorIp.trim()
      : "";

  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError(
      "invalid-argument",
      "A valid target email is required.",
    );
  }

  await assertSuperadminRequester(request, actorIp);

  const auth = getAuth();
  const targetUser = await auth.getUserByEmail(email);
  const claims = targetUser.customClaims ?? {};

  return {
    ok: true,
    uid: targetUser.uid,
    email,
    claims: {
      role: typeof claims.role === "string" ? claims.role : undefined,
      ip: typeof claims.ip === "string" ? claims.ip : undefined,
    },
  };
});

export const generateSubscriptionToken = onCall(
  { cors: true },
  async (request) => {
    const plan = resolvePlan(request.data?.plan);
    const actorIp =
      typeof request.data?.requesterIp === "string"
        ? request.data.requesterIp.trim()
        : "";

    if (!VALID_PLANS.has(plan)) {
      throw new HttpsError("invalid-argument", "A valid plan is required.");
    }

    const requester = await assertTokenIssuerRequester(request, actorIp);

    const token = createToken();
    const tokenHash = hashToken(token);
    const expiresAtIso = addDaysIso(PLAN_DURATION_DAYS[plan]);

    const db = getFirestore();
    await db.collection(TOKEN_COLLECTION).doc(tokenHash).set(
      {
        tokenHash,
        plan,
        status: "active",
        expiresAt: expiresAtIso,
        createdAt: new Date().toISOString(),
        createdByIp: requester.requesterIp,
      },
      { merge: true },
    );

    return {
      token,
      plan,
      expiresAtIso,
    };
  },
);

export const validateSubscriptionToken = onCall(
  { cors: true },
  async (request) => {
    const token =
      typeof request.data?.token === "string" ? request.data.token.trim() : "";

    if (!token) {
      return {
        valid: false,
        plan: "free",
        expiresAtIso: null,
        reason: "No subscription token provided.",
      };
    }

    const tokenHash = hashToken(token);
    const db = getFirestore();
    const snapshot = await db.collection(TOKEN_COLLECTION).doc(tokenHash).get();

    if (!snapshot.exists) {
      return {
        valid: false,
        plan: "free",
        expiresAtIso: null,
        reason: "Invalid subscription token.",
      };
    }

    return buildTokenValidationResult(snapshot.data() ?? null);
  },
);

export const resolveAccessControl = onCall({ cors: true }, async (request) => {
  const actorIp =
    typeof request.data?.requesterIp === "string"
      ? request.data.requesterIp.trim()
      : "";
  const subscriptionToken =
    typeof request.data?.subscriptionToken === "string"
      ? request.data.subscriptionToken.trim()
      : "";
  const requesterIp = resolveRequesterIp(request, actorIp);

  if (!requesterIp) {
    return {
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
      reason:
        "Unable to determine public IP address. Access check could not be completed.",
    };
  }

  const db = getFirestore();
  const whitelistSnapshot = await db.doc(`whitelist/${requesterIp}`).get();
  const hasWhitelistDoc = whitelistSnapshot.exists;

  let role = "user";
  let canManageAccess = false;
  let canManageAdmins = false;
  let canGenerateTokens = false;
  let isWhitelisted = false;

  if (hasWhitelistDoc) {
    const whitelistData = whitelistSnapshot.data() ?? {};
    role = resolveRole(whitelistData.role);
    canManageAccess = role === "admin" || role === "superadmin";
    canManageAdmins = role === "superadmin";
    canGenerateTokens =
      role === "superadmin" || whitelistData.canGenerateTokens === true;
    isWhitelisted =
      whitelistData.enabled !== false && whitelistData.blocked !== true;
  }

  if (isWhitelisted) {
    const subscriptionSnapshot = await db
      .doc(`subscriptions/${requesterIp}`)
      .get();
    const subscriptionData = subscriptionSnapshot.exists
      ? (subscriptionSnapshot.data() ?? {})
      : null;
    const status = normalizeStatus(subscriptionData?.status);
    const expiresAtMs = getEpochMs(subscriptionData?.expiresAt);

    let plan = resolvePlan(subscriptionData?.plan);
    if (status !== "active") {
      plan = "free";
    }
    if (expiresAtMs !== null && Date.now() > expiresAtMs) {
      plan = "free";
    }

    return {
      ipAddress: requesterIp,
      whitelisted: true,
      hasToolAccess: true,
      accessSource: "whitelist",
      plan,
      role,
      canManageAccess,
      canManageAdmins,
      canGenerateTokens,
      tokenExpiresAtIso: null,
      reason: null,
    };
  }

  const tokenValidation = subscriptionToken
    ? await (async () => {
        const tokenHash = hashToken(subscriptionToken);
        const tokenSnapshot = await db
          .collection(TOKEN_COLLECTION)
          .doc(tokenHash)
          .get();

        if (!tokenSnapshot.exists) {
          return {
            valid: false,
            plan: "free",
            expiresAtIso: null,
            reason: "Invalid subscription token.",
          };
        }

        return buildTokenValidationResult(tokenSnapshot.data() ?? null);
      })()
    : {
        valid: false,
        plan: "free",
        expiresAtIso: null,
        reason: null,
      };

  if (tokenValidation.valid) {
    return {
      ipAddress: requesterIp,
      whitelisted: false,
      hasToolAccess: true,
      accessSource: "token",
      plan: resolvePlan(tokenValidation.plan),
      role: "user",
      canManageAccess: false,
      canManageAdmins: false,
      canGenerateTokens: false,
      tokenExpiresAtIso: tokenValidation.expiresAtIso,
      reason: null,
    };
  }

  return {
    ipAddress: requesterIp,
    whitelisted: false,
    hasToolAccess: false,
    accessSource: "none",
    plan: "free",
    role,
    canManageAccess,
    canManageAdmins,
    canGenerateTokens,
    tokenExpiresAtIso: null,
    reason:
      tokenValidation.reason ??
      (hasWhitelistDoc
        ? "Your IP address is currently blocked and the provided token is invalid."
        : "Your IP address is not whitelisted and no valid subscription token was found."),
  };
});

export const listSubscriptionTokens = onCall(
  { cors: true },
  async (request) => {
    const actorIp =
      typeof request.data?.requesterIp === "string"
        ? request.data.requesterIp.trim()
        : "";

    const requester = await assertTokenIssuerRequester(request, actorIp);

    const db = getFirestore();
    const baseQuery = db.collection(TOKEN_COLLECTION);
    const snapshot =
      requester.role === "superadmin"
        ? await baseQuery.orderBy("createdAt", "desc").limit(100).get()
        : await baseQuery
            .where("createdByIp", "==", requester.requesterIp)
            .limit(100)
            .get();

    const tokens = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const expiresAtMs = getEpochMs(data.expiresAt);
        const isExpired = expiresAtMs !== null && Date.now() > expiresAtMs;

        return {
          tokenHash: doc.id,
          plan: resolvePlan(data.plan),
          status: normalizeStatus(data.status),
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

    return { tokens };
  },
);

export const revokeSubscriptionToken = onCall(
  { cors: true },
  async (request) => {
    const tokenHash =
      typeof request.data?.tokenHash === "string"
        ? request.data.tokenHash.trim()
        : "";
    const actorIp =
      typeof request.data?.requesterIp === "string"
        ? request.data.requesterIp.trim()
        : "";

    if (!tokenHash) {
      throw new HttpsError("invalid-argument", "tokenHash is required.");
    }

    const requester = await assertTokenIssuerRequester(request, actorIp);

    const db = getFirestore();
    const docRef = db.collection(TOKEN_COLLECTION).doc(tokenHash);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Token not found.");
    }

    const tokenData = snapshot.data() ?? {};
    const tokenCreatorIp =
      typeof tokenData.createdByIp === "string" ? tokenData.createdByIp : "";

    if (
      requester.role !== "superadmin" &&
      tokenCreatorIp !== requester.requesterIp
    ) {
      throw new HttpsError(
        "permission-denied",
        "You can only revoke tokens you created.",
      );
    }

    await docRef.update({
      status: "inactive",
      revokedAt: new Date().toISOString(),
      revokedByIp: requester.requesterIp,
    });

    return { ok: true, tokenHash };
  },
);
