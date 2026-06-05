import admin from "firebase-admin";

const VALID_ROLES = new Set(["user", "admin", "superadmin"]);

const usage = () => {
  console.error(
    [
      "Usage:",
      "  node scripts/set-firebase-claims-by-email.mjs --email <firebase-email> --role <user|admin|superadmin> [--ip <public-ip>]",
      "",
      "Examples:",
      "  node scripts/set-firebase-claims-by-email.mjs --email admin@example.com --role admin",
      "  node scripts/set-firebase-claims-by-email.mjs --email admin@example.com --role superadmin --ip 203.0.113.10",
    ].join("\n"),
  );
};

const parseArgs = (argv) => {
  const result = {
    _: [],
  };

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

const isValidEmail = (value) => {
  const trimmed = String(value ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
};

const isValidIpAddress = (value) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return false;
  }

  const ipv4 =
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const ipv6 = /^([0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}$/i;
  return ipv4.test(trimmed) || ipv6.test(trimmed);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const positional = Array.isArray(args._) ? args._ : [];
  const email =
    typeof args.email === "string"
      ? args.email.trim()
      : typeof positional[0] === "string"
        ? positional[0].trim()
        : "";
  const role =
    typeof args.role === "string"
      ? args.role.trim().toLowerCase()
      : typeof positional[1] === "string"
        ? positional[1].trim().toLowerCase()
        : "";
  const ip =
    typeof args.ip === "string"
      ? args.ip.trim()
      : typeof positional[2] === "string"
        ? positional[2].trim()
        : "";

  if (!isValidEmail(email) || !VALID_ROLES.has(role)) {
    usage();
    process.exitCode = 1;
    return;
  }

  if (ip && !isValidIpAddress(ip)) {
    console.error("Invalid IP address.");
    process.exitCode = 1;
    return;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  const user = await admin.auth().getUserByEmail(email);
  const nextClaims = {
    role,
    ...(ip ? { ip } : {}),
  };

  await admin.auth().setCustomUserClaims(user.uid, nextClaims);
  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        uid: user.uid,
        claims: nextClaims,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error("Failed to set custom claims by email.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
