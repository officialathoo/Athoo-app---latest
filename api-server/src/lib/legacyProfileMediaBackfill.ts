import path from "node:path";
import {
  isOwnedUploadObjectPath,
  normalizeStoredObjectPath,
  safeUploadName,
  validateUploadPolicy,
  type UploadScope,
} from "./storageSecurity.ts";

export const
LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRMATION =
  "BACKFILL_ONE_LEGACY_PROFILE_MEDIA";

export type LegacyProfileMediaCandidate = {
  userId: string;
  profileImage: string;
  hasSecurityRecord: boolean;
};

export type ClassifiedLegacyProfileMedia =
  | {
      ok: true;
      userId: string;
      objectPath: string;
      scope: UploadScope;
      originalName: string;
    }
  | {
      ok: false;
      reason:
        | "missing_user_id"
        | "missing_object_path"
        | "security_record_exists"
        | "owner_path_mismatch"
        | "unsupported_profile_extension";
    };

export type LegacyProfileMediaBackfillOptions = {
  execute: boolean;
  dryRun: boolean;
  limit: number;
};

export function classifyLegacyProfileMediaCandidate(
  candidate: LegacyProfileMediaCandidate,
): ClassifiedLegacyProfileMedia {
  const userId =
    String(candidate.userId || "").trim();

  if (!userId) {
    return {
      ok: false,
      reason: "missing_user_id",
    };
  }

  const objectPath =
    normalizeStoredObjectPath(
      candidate.profileImage,
    );

  if (!objectPath) {
    return {
      ok: false,
      reason: "missing_object_path",
    };
  }

  if (candidate.hasSecurityRecord) {
    return {
      ok: false,
      reason: "security_record_exists",
    };
  }

  const scopes: UploadScope[] = [
    "shared",
    "private",
  ];

  const scope = scopes.find((value) =>
    isOwnedUploadObjectPath(
      objectPath,
      userId,
      [value],
    ),
  );

  if (!scope) {
    return {
      ok: false,
      reason: "owner_path_mismatch",
    };
  }

  const originalName = safeUploadName(
    path.posix.basename(objectPath),
  );

  if (
    !/\.(?:jpe?g|png|webp)$/i.test(
      originalName,
    )
  ) {
    return {
      ok: false,
      reason:
        "unsupported_profile_extension",
    };
  }

  return {
    ok: true,
    userId,
    objectPath,
    scope,
    originalName,
  };
}

export function validateLegacyProfileMediaMetadata(
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

  const policyError = validateUploadPolicy({
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

export function parseLegacyProfileMediaBackfillOptions(
  args: string[],
  environment: NodeJS.ProcessEnv =
    process.env,
): LegacyProfileMediaBackfillOptions {
  let execute = false;
  let limit = 1;

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
        parsed > 10
      ) {
        throw new Error(
          "LEGACY_PROFILE_MEDIA_INVALID_LIMIT",
        );
      }

      limit = parsed;
      continue;
    }

    throw new Error(
      "LEGACY_PROFILE_MEDIA_UNKNOWN_ARGUMENT",
    );
  }

  if (execute) {
    if (
      environment
        .LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRM !==
      LEGACY_PROFILE_MEDIA_BACKFILL_CONFIRMATION
    ) {
      throw new Error(
        "LEGACY_PROFILE_MEDIA_CONFIRMATION_REQUIRED",
      );
    }

    if (limit !== 1) {
      throw new Error(
        "LEGACY_PROFILE_MEDIA_EXECUTE_LIMIT_MUST_BE_ONE",
      );
    }
  }

  return {
    execute,
    dryRun: !execute,
    limit,
  };
}

export function safeLegacyBackfillErrorCode(
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