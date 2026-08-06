import path from "node:path";
import {
  normalizeStoredObjectPath,
  safeUploadName,
  validateUploadPolicy,
  type UploadScope,
} from "./storageSecurity.ts";

export const
LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRMATION =
  "BACKFILL_ONE_LEGACY_REFERENCED_MEDIA";

export type LegacyReferencedMediaScopePolicy =
  | "PRIVATE_ONLY"
  | "SHARED_ONLY"
  | "PRIVATE_OR_SHARED";

export type LegacyReferencedMediaCandidate = {
  ownerId: string;
  objectPath: string;
  expectedScopePolicy:
    LegacyReferencedMediaScopePolicy;
  hasSecurityRecord: boolean;
  referenceCount: number;
};

export type ClassifiedLegacyReferencedMedia =
  | {
      ok: true;
      ownerId: string;
      objectPath: string;
      scope: UploadScope;
      originalName: string;
      referenceCount: number;
    }
  | {
      ok: false;
      reason:
        | "missing_owner_id"
        | "missing_object_path"
        | "invalid_reference_count"
        | "security_record_exists"
        | "invalid_upload_path"
        | "owner_path_mismatch"
        | "scope_policy_mismatch"
        | "unsupported_media_extension";
    };

export type LegacyReferencedMediaBackfillOptions = {
  execute: boolean;
  dryRun: boolean;
  limit: number;
};

function scopeMatchesPolicy(
  scope: UploadScope,
  policy: LegacyReferencedMediaScopePolicy,
): boolean {
  if (policy === "PRIVATE_ONLY") {
    return scope === "private";
  }

  if (policy === "SHARED_ONLY") {
    return scope === "shared";
  }

  return (
    scope === "private" ||
    scope === "shared"
  );
}

export function classifyLegacyReferencedMediaCandidate(
  candidate: LegacyReferencedMediaCandidate,
): ClassifiedLegacyReferencedMedia {
  const ownerId =
    String(candidate.ownerId || "").trim();

  if (!ownerId) {
    return {
      ok: false,
      reason: "missing_owner_id",
    };
  }

  const objectPath =
    normalizeStoredObjectPath(
      candidate.objectPath,
    );

  if (!objectPath) {
    return {
      ok: false,
      reason: "missing_object_path",
    };
  }

  const referenceCount =
    Number(candidate.referenceCount);

  if (
    !Number.isInteger(referenceCount) ||
    referenceCount < 1
  ) {
    return {
      ok: false,
      reason: "invalid_reference_count",
    };
  }

  if (candidate.hasSecurityRecord) {
    return {
      ok: false,
      reason: "security_record_exists",
    };
  }

  const pathMatch = objectPath.match(
    /^\/objects\/uploads\/(private|shared)\/([^/]+)\//,
  );

  if (!pathMatch) {
    return {
      ok: false,
      reason: "invalid_upload_path",
    };
  }

  const scope =
    pathMatch[1] as UploadScope;

  const encodedOwnerId =
    String(pathMatch[2] || "").trim();

  if (encodedOwnerId !== ownerId) {
    return {
      ok: false,
      reason: "owner_path_mismatch",
    };
  }

  if (
    !scopeMatchesPolicy(
      scope,
      candidate.expectedScopePolicy,
    )
  ) {
    return {
      ok: false,
      reason: "scope_policy_mismatch",
    };
  }

  const originalName = safeUploadName(
    path.posix.basename(objectPath),
  );

  if (
    !/\.(?:jpe?g|png|webp|pdf|mp4|mov|m4v)$/i.test(
      originalName,
    )
  ) {
    return {
      ok: false,
      reason: "unsupported_media_extension",
    };
  }

  return {
    ok: true,
    ownerId,
    objectPath,
    scope,
    originalName,
    referenceCount,
  };
}

export function validateLegacyReferencedMediaMetadata(
  originalName: string,
  contentLength: unknown,
  contentType: unknown,
):
  | {
      ok: true;
      size: number;
      contentType: string;
    }
  | {
      ok: false;
      reason: string;
    } {
  const size = Number(contentLength);

  const normalizedType = String(
    contentType || "",
  )
    .trim()
    .toLowerCase();

  const policyError =
    validateUploadPolicy({
      name: originalName,
      size,
      contentType: normalizedType,
    });

  if (policyError) {
    return {
      ok: false,
      reason: policyError,
    };
  }

  return {
    ok: true,
    size,
    contentType: normalizedType,
  };
}

export function parseLegacyReferencedMediaBackfillOptions(
  args: string[],
  environment: NodeJS.ProcessEnv =
    process.env,
): LegacyReferencedMediaBackfillOptions {
  let execute = false;
  let limit = 20;

  for (const argument of args) {
    if (argument === "--dry-run") {
      execute = false;
      continue;
    }

    if (argument === "--execute") {
      execute = true;
      continue;
    }

    if (
      argument.startsWith("--limit=")
    ) {
      const parsed = Number(
        argument.slice("--limit=".length),
      );

      if (
        !Number.isInteger(parsed) ||
        parsed < 1 ||
        parsed > 50
      ) {
        throw new Error(
          "LEGACY_REFERENCED_MEDIA_INVALID_LIMIT",
        );
      }

      limit = parsed;
      continue;
    }

    throw new Error(
      "LEGACY_REFERENCED_MEDIA_UNKNOWN_ARGUMENT",
    );
  }

  if (execute) {
    if (
      environment
        .LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRM !==
      LEGACY_REFERENCED_MEDIA_BACKFILL_CONFIRMATION
    ) {
      throw new Error(
        "LEGACY_REFERENCED_MEDIA_CONFIRMATION_REQUIRED",
      );
    }

    if (limit !== 1) {
      throw new Error(
        "LEGACY_REFERENCED_MEDIA_EXECUTE_LIMIT_MUST_BE_ONE",
      );
    }
  }

  return {
    execute,
    dryRun: !execute,
    limit,
  };
}

export function safeLegacyReferencedMediaErrorCode(
  error: unknown,
): string {
  if (!(error instanceof Error)) {
    return "UnknownError";
  }

  const message =
    String(error.message || "").trim();

  if (
    /^[A-Z0-9_:.-]{1,120}$/.test(
      message,
    )
  ) {
    return message;
  }

  return String(
    error.name || "Error",
  )
    .replace(
      /[^a-zA-Z0-9_.:-]/g,
      "_",
    )
    .slice(0, 120);
}