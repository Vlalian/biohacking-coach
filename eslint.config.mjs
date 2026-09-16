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
  // What must not reach a commit (added 2026-09-15, from the ECC comparison in
  // .scratch/research/ecc-workflow-comparison.md §3, where it was a pre-commit
  // hook; here it is a lint rule, because lint is already one of the four
  // Definition-of-Done checks and a rule is cheaper than a hook).
  //
  // `console.error` and `console.warn` stay allowed: `lib/coach-log.ts` is the
  // Coach path's only logging and it writes structured lines to console.error.
  // A stray `console.log` is a debugging leftover, and on the Coach path it is
  // the one way an athlete's words could reach a log line unredacted.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-debugger": "error",
    },
  },
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
]);

export default eslintConfig;
