export interface CleanUploadCompletion {
  success?: unknown;
  objectPath?: unknown;
  size?: unknown;
  contentType?: unknown;
  sha256?: unknown;
  securityStatus?: unknown;
}

const cleanObjectPathPattern =
  /^\/objects\/uploads\/(?:private|shared)\/[^/]+\//;

export function validatedCleanUploadObjectPath(
  payload: unknown,
): string {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    throw new Error(
      "Uploaded file could not be verified",
    );
  }

  const completion =
    payload as CleanUploadCompletion;

  const objectPath =
    typeof completion.objectPath === "string"
      ? completion.objectPath.trim()
      : "";

  const size =
    Number(completion.size);

  const contentType =
    typeof completion.contentType === "string"
      ? completion.contentType.trim()
      : "";

  const sha256 =
    typeof completion.sha256 === "string"
      ? completion.sha256.trim().toLowerCase()
      : "";

  if (
    completion.success !== true ||
    completion.securityStatus !== "clean" ||
    !cleanObjectPathPattern.test(objectPath) ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !contentType ||
    !/^[a-f0-9]{64}$/.test(sha256)
  ) {
    throw new Error(
      "Uploaded file could not be verified",
    );
  }

  return objectPath;
}
