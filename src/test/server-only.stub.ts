// Test stub for the `server-only` package.
//
// `server-only` throws on import outside a React Server Component build to keep
// server code off the client. Vitest imports modules as plain ESM, with no RSC
// context, so the real package would throw the moment a test pulls in a module
// that guards itself with `import 'server-only'` (e.g. the Coach adapter). The
// guarantee it provides is a build-time concern; under test it is a no-op.
export {};
