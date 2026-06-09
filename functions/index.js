import { randomBytes, createHash } from "node:crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

const VALID_ROLES = new Set(["user", "admin", "superadmin"]);
const VALID_ISSUABLE_ROLES = new Set(["user", "admin"]);
const VALID_PLANS = new Set(["free", "pro", "elite", "unlimited"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_BYTE_LENGTH = 24;
const TOKEN_COLLECTION = "subscriptionTokens";
const TOKEN_MAX_BOUND_USERS = 3;

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
  if (normalized === "unlimited") {
    return "unlimited";
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

const parseRequesterContext = (request, actorIp) => {
  const requesterIp = resolveRequesterIp(request, actorIp);
  const requesterRole = resolveRole(
    request.auth?.token?.role ?? request.data?.requesterRole,
  );

  return {
    requesterIp,
    requesterRole,
  };
};

const assertSuperadminRequester = (request, actorIp) => {
  const requester = parseRequesterContext(request, actorIp);
  if (requester.requesterRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Superadmin role is required.");
  }
  return requester;
};

const assertTokenIssuerRequester = (request, actorIp) => {
  const requester = parseRequesterContext(request, actorIp);
  if (
    requester.requesterRole !== "admin" &&
    requester.requesterRole !== "superadmin"
  ) {
    throw new HttpsError(
      "permission-denied",
      "Admin or superadmin role is required.",
    );
  }
  return requester;
};

const buildTokenValidationResult = (data) => {
  if (!data) {
    return {
      valid: false,
      plan: "free",
      role: "user",
      expiresAtIso: null,
      reason: "Invalid subscription token.",
    };
  }

  const plan = resolvePlan(data.plan);
  const role = resolveRole(data.role);

  const expiresAtMs = getEpochMs(data.expiresAt);
  if (
    plan !== "unlimited" &&
    (expiresAtMs === null || Date.now() > expiresAtMs)
  ) {
    return {
      valid: false,
      plan: "free",
      role: "user",
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
      role: "user",
      expiresAtIso:
        typeof data.expiresAt === "string" && data.expiresAt.trim().length > 0
          ? data.expiresAt
          : null,
      reason: "Subscription token is inactive.",
    };
  }

  return {
    valid: true,
    plan,
    role,
    expiresAtIso:
      typeof data.expiresAt === "string" && data.expiresAt.trim().length > 0
        ? data.expiresAt
        : null,
    reason: null,
  };
};

const normalizeBoundIps = (boundIps, boundIp) => {
  const candidates = Array.isArray(boundIps)
    ? boundIps
    : typeof boundIp === "string"
      ? [boundIp]
      : [];

  const unique = [];
  for (const entry of candidates) {
    if (typeof entry !== "string") {
      continue;
    }

    const trimmed = entry.trim();
    if (!trimmed || unique.includes(trimmed)) {
      continue;
    }

    unique.push(trimmed);
  }

  return unique;
};

const validateTokenForRequester = async ({ db, tokenHash, requesterIp }) => {
  const tokenRef = db.collection(TOKEN_COLLECTION).doc(tokenHash);
  const snapshot = await tokenRef.get();

  if (!snapshot.exists) {
    return {
      valid: false,
      plan: "free",
      role: "user",
      expiresAtIso: null,
      reason: "Invalid subscription token.",
    };
  }

  const baseResult = buildTokenValidationResult(snapshot.data() ?? null);
  if (!baseResult.valid) {
    return baseResult;
  }

  const tokenData = snapshot.data() ?? {};
  const plan = resolvePlan(tokenData.plan);

  if (plan === "unlimited") {
    return baseResult;
  }

  if (!requesterIp) {
    return {
      valid: false,
      plan: "free",
      role: "user",
      expiresAtIso: baseResult.expiresAtIso,
      reason:
        "Unable to verify user identity for this subscription token. Please retry when your public IP is available.",
    };
  }

  const boundIps = normalizeBoundIps(tokenData.boundIps, tokenData.boundIp);
  if (
    !boundIps.includes(requesterIp) &&
    boundIps.length >= TOKEN_MAX_BOUND_USERS
  ) {
    return {
      valid: false,
      plan: "free",
      role: "user",
      expiresAtIso: baseResult.expiresAtIso,
      reason: "This subscription token has reached its maximum of 3 users.",
    };
  }

  try {
    await db.runTransaction(async (transaction) => {
      const txSnapshot = await transaction.get(tokenRef);
      if (!txSnapshot.exists) {
        throw new Error("TOKEN_NOT_FOUND");
      }

      const txData = txSnapshot.data() ?? {};
      const txResult = buildTokenValidationResult(txData);
      if (!txResult.valid) {
        throw new Error(`TOKEN_INVALID:${txResult.reason ?? "UNKNOWN"}`);
      }

      const txPlan = resolvePlan(txData.plan);
      if (txPlan === "unlimited") {
        return;
      }

      const boundIps = normalizeBoundIps(txData.boundIps, txData.boundIp);

      const nowIso = new Date().toISOString();
      if (!boundIps.includes(requesterIp)) {
        if (boundIps.length >= TOKEN_MAX_BOUND_USERS) {
          throw new Error("TOKEN_USER_LIMIT_REACHED");
        }

        const updatedBoundIps = [...boundIps, requesterIp];
        transaction.update(tokenRef, {
          boundIps: updatedBoundIps,
          boundIp: updatedBoundIps[0] ?? null,
          boundAt: nowIso,
          lastValidatedAt: nowIso,
        });
        return;
      }

      transaction.update(tokenRef, {
        lastValidatedAt: nowIso,
      });
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TOKEN_BINDING_FAILED";

    if (message === "TOKEN_USER_LIMIT_REACHED") {
      return {
        valid: false,
        plan: "free",
        role: "user",
        expiresAtIso: baseResult.expiresAtIso,
        reason: "This subscription token has reached its maximum of 3 users.",
      };
    }

    if (message.startsWith("TOKEN_INVALID:")) {
      return {
        valid: false,
        plan: "free",
        role: "user",
        expiresAtIso: baseResult.expiresAtIso,
        reason:
          message.slice("TOKEN_INVALID:".length) ||
          "Subscription token is invalid.",
      };
    }

    if (message === "TOKEN_NOT_FOUND") {
      return {
        valid: false,
        plan: "free",
        role: "user",
        expiresAtIso: null,
        reason: "Invalid subscription token.",
      };
    }

    return {
      valid: false,
      plan: "free",
      role: "user",
      expiresAtIso: baseResult.expiresAtIso,
      reason: "Unable to validate subscription token at this time.",
    };
  }

  return baseResult;
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

  assertSuperadminRequester(request, actorIp);

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

  assertSuperadminRequester(request, actorIp);

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
    const role = resolveRole(request.data?.role);
    const actorIp =
      typeof request.data?.requesterIp === "string"
        ? request.data.requesterIp.trim()
        : "";

    if (!VALID_PLANS.has(plan)) {
      throw new HttpsError("invalid-argument", "A valid plan is required.");
    }

    if (!VALID_ISSUABLE_ROLES.has(role)) {
      throw new HttpsError(
        "invalid-argument",
        "Role must be either user or admin.",
      );
    }

    const requester = assertTokenIssuerRequester(request, actorIp);

    const token = createToken();
    const tokenHash = hashToken(token);
    const expiresAtIso =
      plan === "unlimited" ? null : addDaysIso(PLAN_DURATION_DAYS[plan]);

    const db = getFirestore();
    await db.collection(TOKEN_COLLECTION).doc(tokenHash).set(
      {
        tokenHash,
        plan,
        role,
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
      role,
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
        role: "user",
        expiresAtIso: null,
        reason: "No subscription token provided.",
      };
    }

    const tokenHash = hashToken(token);
    const db = getFirestore();
    const actorIp =
      typeof request.data?.requesterIp === "string"
        ? request.data.requesterIp.trim()
        : "";
    const requesterIp = resolveRequesterIp(request, actorIp);

    return validateTokenForRequester({
      db,
      tokenHash,
      requesterIp,
    });
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
  const tokenValidation = subscriptionToken
    ? await (async () => {
        const tokenHash = hashToken(subscriptionToken);
        return validateTokenForRequester({
          db,
          tokenHash,
          requesterIp,
        });
      })()
    : {
        valid: false,
        plan: "free",
        role: "user",
        expiresAtIso: null,
        reason: null,
      };

  if (tokenValidation.valid) {
    const role = resolveRole(tokenValidation.role);
    return {
      ipAddress: requesterIp,
      whitelisted: false,
      hasToolAccess: true,
      accessSource: "token",
      plan: resolvePlan(tokenValidation.plan),
      role,
      canManageAccess: role === "admin" || role === "superadmin",
      canManageAdmins: role === "superadmin",
      canGenerateTokens: role === "admin" || role === "superadmin",
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
    role: "user",
    canManageAccess: false,
    canManageAdmins: false,
    canGenerateTokens: false,
    tokenExpiresAtIso: null,
    reason: tokenValidation.reason ?? "No valid subscription token was found.",
  };
});

export const listSubscriptionTokens = onCall(
  { cors: true },
  async (request) => {
    const actorIp =
      typeof request.data?.requesterIp === "string"
        ? request.data.requesterIp.trim()
        : "";

    const requester = assertTokenIssuerRequester(request, actorIp);

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
          role: resolveRole(data.role),
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

    const requester = assertTokenIssuerRequester(request, actorIp);

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
