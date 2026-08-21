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
  // Fixture modules build invented data byte by byte so the decode and render
  // paths can be tested without a real export. Both carry a "TEST FIXTURES
  // ONLY" comment at the top — and a comment does not stop an import
  // (CodeRabbit, PR #35), so the rule is enforced here instead: a wrong import
  // fails `npm run lint` rather than shipping a synthetic-data path into the
  // bundle, where it could reach a real athlete's record.
  //
  // Scoped to app code. Test files are the legitimate consumers and are
  // exempted below.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/fit-fixture",
                "./fit-fixture",
                "**/synthetic-fixtures",
                "./synthetic-fixtures",
              ],
              message:
                "Test fixtures only. This module builds invented data; importing it from app code risks synthetic data reaching a real athlete's record.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
