import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import oxlint from "eslint-plugin-oxlint";

// Lint runs in two layers (decided 2026-09-22, see docs/rules/definition-of-done.md):
// Oxlint (`.oxlintrc.json`) is the fast pass and carries every rule it can —
// the Next/React/TypeScript presets, the fixture-import ban, the console ban.
// ESLint keeps only what Oxlint cannot express, and the last entry below turns
// off every rule Oxlint already enforces so no file is judged twice.
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
    // Playwright's component harness bundles React itself into this folder;
    // linting the bundle reports React's own internals as hook violations.
    "playwright/.cache/**",
    "test-results/**",
    "playwright-report/**",
  ]),
  // A focused test (`it.only`, `describe.only`, `test.only`) turns the whole
  // suite green by running one file's worth of it. `npm test` would pass and
  // the hardening gate would grade a suite that mostly did not run.
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // The member access itself, not the call: `it.only(...)`, `it.only.each(...)(...)`
          // and `test.only.skip` are all the same act, and the review of
          // 2026-09-15 found `.each` slipping a call-shaped selector.
          selector:
            "MemberExpression[property.name='only'][object.name=/^(it|describe|test)$/]",
          message:
            "A focused test never leaves a branch: it makes the suite pass by not running it.",
        },
        {
          // `it.each(cases).only(...)`: the object is the `.each(...)` call, not
          // the bare name, so the selector above cannot see it (CodeRabbit, PR #65).
          selector:
            "MemberExpression[property.name='only'][object.type='CallExpression'][object.callee.type='MemberExpression'][object.callee.property.name='each'][object.callee.object.name=/^(it|describe|test)$/]",
          message:
            "A focused test never leaves a branch: it makes the suite pass by not running it.",
        },
      ],
    },
  },
  // Must stay last: disables in ESLint every rule `.oxlintrc.json` enables.
  ...oxlint.buildFromOxlintConfigFile("./.oxlintrc.json"),
  // `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comments
  // in the test files now serve Oxlint (which honors the same directive) and
  // look unused to ESLint, because ESLint no longer runs that rule.
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
]);

export default eslintConfig;
