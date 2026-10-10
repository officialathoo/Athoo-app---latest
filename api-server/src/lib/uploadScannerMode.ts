export type UploadScannerMode =
  | "required"
  | "signature-only";

export function uploadScannerTemporaryBypassEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return String(
    environment.UPLOAD_SCANNER_TEMPORARY_BYPASS || "",
  )
    .trim()
    .toLowerCase() === "true";
}

export function resolveUploadScannerMode(
  environment: NodeJS.ProcessEnv = process.env,
): UploadScannerMode {
  const deployed = ["production", "staging"].includes(
    String(environment.NODE_ENV || "")
      .trim()
      .toLowerCase(),
  );

  // Temporary stabilization switch. It disables only the external antivirus
  // dependency while preserving quarantine, locked snapshots, size limits,
  // magic-byte/MIME validation and active-content checks. Readiness and final
  // production certification remain blocked while this switch is enabled.
  if (
    deployed &&
    uploadScannerTemporaryBypassEnabled(environment)
  ) {
    return "signature-only";
  }

  if (deployed) {
    return "required";
  }

  return String(
    environment.UPLOAD_SCAN_MODE || "signature-only",
  )
    .trim()
    .toLowerCase() === "required"
    ? "required"
    : "signature-only";
}
