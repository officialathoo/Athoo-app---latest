import { logger } from "./logger";
import { getConfiguredStorageProvider } from "./storageProvider";
import { isOwnedUploadObjectPath, normalizeStoredObjectPath } from "./storageSecurity";

export function cleanupReplacedOwnedMedia(previousValue: unknown, nextValue: unknown, userId: string): void {
  const previous = normalizeStoredObjectPath(previousValue);
  const next = normalizeStoredObjectPath(nextValue);
  if (!previous || previous === next || !isOwnedUploadObjectPath(previous, userId, ["private", "shared"])) return;
  queueMicrotask(() => {
    getConfiguredStorageProvider().deleteObject(previous).catch((error) => {
      logger.warn({ err: error, objectPath: previous, userId }, "failed to clean replaced owned media");
    });
  });
}
