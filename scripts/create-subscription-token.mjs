import { randomBytes, createHash } from "node:crypto";
import admin from "firebase-admin";

const VALID_ROLES = new Set(["user", "admin", "superadmin"]);
const VALID_PLANS = new Set(["free", "pro", "elite", "unlimited"]);
const PLAN_DURATION_DAYS = {
  free: 7,
  pro: 30,
  elite: 90,
};

const usage = () => {
  console.error(
    [
      "Usage:",
      "  node scripts/create-subscription-token.mjs --role <user|admin|superadmin> [--plan <free|pro|elite|unlimited>] [--createdByIp <ip>]",
      "",
      "Notes:",
      "  - Default plan is unlimited (no expiry).",
      "  - For plan=unlimited, expiresAt is null.",
      "",
      "Examples:",
      "  node scripts/create-subscription-token.mjs --role superadmin",
      "  node scripts/create-subscription-token.mjs --role admin",
      "  node scripts/create-subscription-token.mjs --role user",
      "  node scripts/create-subscription-token.mjs --role admin --plan pro",
    ].join("\n"),
  );
};

const parseArgs = (argv) => {
  const result = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (typeof next === "undefined" || next.startsWith("--")) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    index += 1;
  }

  return result;
};

const resolveRole = (value) => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_ROLES.has(normalized) ? normalized : "";
};

const resolvePlan = (value) => {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return VALID_PLANS.has(normalized) ? normalized : "unlimited";
};

const addDaysIso = (days) => {
  const next = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return next.toISOString();
};

const createToken = () => randomBytes(24).toString("base64url");

const hashToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    usage();
    return;
  }

  const positional = Array.isArray(args._) ? args._ : [];
  const role = resolveRole(
    typeof args.role === "string" ? args.role : positional[0],
  );
  const plan = resolvePlan(
    typeof args.plan === "string" ? args.plan : positional[1],
  );
  const createdByIp =
    typeof args.createdByIp === "string" ? args.createdByIp.trim() : "";

  if (!role) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  const token = createToken();
  const tokenHash = hashToken(token);
  const expiresAt =
    plan === "unlimited" ? null : addDaysIso(PLAN_DURATION_DAYS[plan]);

  const payload = {
    tokenHash,
    plan,
    role,
    status: "active",
    expiresAt,
    createdAt: new Date().toISOString(),
    createdByIp: createdByIp || null,
  };

  await admin
    .firestore()
    .collection("subscriptionTokens")
    .doc(tokenHash)
    .set(payload, { merge: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        token,
        tokenHash,
        plan,
        role,
        expiresAt,
        collection: "subscriptionTokens",
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error("Failed to create subscription token.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
