/**
 * Runs a service's async bootstrap function, logging and exiting the process
 * on any startup failure — a rejected/thrown `bootstrap()` must not be
 * silently swallowed (the `void bootstrap()` bug this fixes across a
 * service's own `main.ts`), and calling `.catch()` inline at every call site
 * is exactly the kind of copy-pasted cross-cutting concern this package
 * exists to centralize instead.
 */
export function bootstrapService(bootstrap: () => Promise<void>): void {
  bootstrap().catch((err) => {
    console.error('Fatal error during startup:', err);
    process.exit(1);
  });
}
