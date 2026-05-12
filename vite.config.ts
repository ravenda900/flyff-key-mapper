import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Patches the final content.js after build to replace the dead-code
// `Function("r","regeneratorRuntime = r")` string that bundled
// regenerator-runtime emits. Even though it is guarded by
// `typeof globalThis === "object"` at runtime, Chrome enforces CSP on every
// call to the Function constructor regardless of branch reachability.
function noEvalPlugin(): Plugin {
  return {
    name: "no-eval",
    enforce: "post",
    closeBundle() {
      const target = resolve(__dirname, "dist/assets/content.js");
      try {
        const src = readFileSync(target, "utf8");
        const patched = src.replaceAll(
          `Function("r","regeneratorRuntime = r")`,
          `((r)=>{globalThis.regeneratorRuntime=r})`,
        );
        const patched2 = patched.replaceAll(
          `new Function("return this")`,
          `(()=>globalThis)`,
        );
        if (patched2 !== src) {
          writeFileSync(target, patched2, "utf8");
          console.log("[no-eval] Patched eval patterns in content.js");
        }
      } catch {
        // dist/assets/content.js may not exist during non-build runs
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    noEvalPlugin(),
  ],
  build: {
    rollupOptions: {
      input: {
        content: "src/content/main.tsx",
      },
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/content.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
        manualChunks: undefined,
      },
    },
  },
});
