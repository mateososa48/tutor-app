import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored builds (pdf.js worker, Signalsmith Stretch) and Playwright's scratch output.
    "public/vendor/**",
    ".playwright-mcp/**",
    // The LiveKit voice agent is its own Node package (agent/package.json).
    "agent/**",
  ]),
]);

export default eslintConfig;
