import fs from "node:fs/promises";
import path from "node:path";

const VALID_MODES = new Set(["spark", "blaze"]);

const usage = () => {
  console.error(
    [
      "Usage:",
      "  node scripts/switch-access-mode.mjs --mode <spark|blaze>",
      "",
      "Examples:",
      "  node scripts/switch-access-mode.mjs --mode spark",
      "  node scripts/switch-access-mode.mjs --mode blaze",
    ].join("\n"),
  );
};

const parseArgs = (argv) => {
  const result = { _: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (typeof next === "undefined" || next.startsWith("--")) {
      result[key] = true;
      continue;
    }

    result[key] = next;
    i += 1;
  }

  return result;
};

const setEnvValue = (source, key, value) => {
  const normalized = source.replace(/\r\n/g, "\n");
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(normalized)) {
    return normalized.replace(pattern, `${key}=${value}`);
  }

  const trimmed = normalized.trimEnd();
  return `${trimmed}\n${key}=${value}\n`;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const modeRaw = typeof args.mode === "string" ? args.mode : args._[0];
  const mode = typeof modeRaw === "string" ? modeRaw.trim().toLowerCase() : "";

  if (!VALID_MODES.has(mode)) {
    usage();
    process.exitCode = 1;
    return;
  }

  const root = process.cwd();
  const rulesTemplatePath = path.join(root, `firestore.rules.${mode}`);
  const rulesTargetPath = path.join(root, "firestore.rules");
  const envLocalPath = path.join(root, ".env.local");

  const rulesContent = await fs.readFile(rulesTemplatePath, "utf8");
  await fs.writeFile(rulesTargetPath, rulesContent, "utf8");

  let envLocal = "";
  try {
    envLocal = await fs.readFile(envLocalPath, "utf8");
  } catch (error) {
    if (
      !(
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      )
    ) {
      throw error;
    }
  }

  const nextEnv = setEnvValue(envLocal, "VITE_ACCESS_CONTROL_MODE", mode);
  await fs.writeFile(envLocalPath, nextEnv, "utf8");

  console.log(`Switched access mode to ${mode}.`);
  console.log("Updated files:");
  console.log("- firestore.rules");
  console.log("- .env.local (VITE_ACCESS_CONTROL_MODE)");
  console.log("");
  console.log("Next steps:");
  console.log("1) npm run firebase:rules");
  if (mode === "blaze") {
    console.log("2) npm run firebase:functions");
  }
  console.log("3) Restart the app/build process if running.");
};

main().catch((error) => {
  console.error("Failed to switch access mode.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
