/**
 * Production-safe application logger.
 *
 * Development builds keep detailed diagnostics. Production builds avoid
 * printing tokens, request payloads, provider responses, call identifiers,
 * media contents, or raw exceptions to the device log.
 */
const isDevelopment = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";

type LogValue = unknown;

function safeScope(scope: string): string {
  return String(scope || "application").replace(/[^a-z0-9:_ -]/gi, "").slice(0, 80) || "application";
}

export const appLogger = {
  debug(scope: string, ...values: LogValue[]) {
    if (isDevelopment) console.debug(`[Athoo:${safeScope(scope)}]`, ...values);
  },
  info(scope: string, ...values: LogValue[]) {
    if (isDevelopment) console.info(`[Athoo:${safeScope(scope)}]`, ...values);
  },
  warn(scope: string, ...values: LogValue[]) {
    if (isDevelopment) console.warn(`[Athoo:${safeScope(scope)}]`, ...values);
    else console.warn(`[Athoo:${safeScope(scope)}] A recoverable issue occurred.`);
  },
  error(scope: string, ...values: LogValue[]) {
    if (isDevelopment) console.error(`[Athoo:${safeScope(scope)}]`, ...values);
    else console.error(`[Athoo:${safeScope(scope)}] An unexpected issue occurred.`);
  },
};
