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
    // The POC is legacy CommonJS reference material we are porting into src/
    // (slice 08 ports its prompt logic to TypeScript). It intentionally uses
    // require() and is not held to the app's lint rules — linting it only
    // reports the very patterns the port exists to replace.
    "poc/**",
  ]),
]);

export default eslintConfig;
