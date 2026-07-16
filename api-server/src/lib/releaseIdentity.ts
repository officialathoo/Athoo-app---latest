export interface ReleaseIdentity {
  service: string;
  environment: string;
  version: string;
  commitSha: string | null;
  buildId: string | null;
}

function clean(value: unknown, max = 160): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._:@/+-]/g, "-")
    .slice(0, max);
}

function first(...values: unknown[]): string {
  for (const value of values) {
    const candidate = clean(value);
    if (candidate) return candidate;
  }
  return "";
}

function cleanCommit(value: unknown): string | null {
  const candidate = clean(value, 64).toLowerCase();
  return /^[a-f0-9]{7,64}$/.test(candidate) ? candidate : null;
}

export function getReleaseIdentity(): ReleaseIdentity {
  const commitSha = cleanCommit(
    first(
      process.env.RELEASE_COMMIT_SHA,
      process.env.RENDER_GIT_COMMIT,
      process.env.GITHUB_SHA,
      process.env.VERCEL_GIT_COMMIT_SHA,
    ),
  );
  return {
    service: first(process.env.RELEASE_SERVICE_NAME, process.env.RENDER_SERVICE_NAME, "athoo-api"),
    environment: first(process.env.DEPLOYMENT_ENVIRONMENT, process.env.APP_ENV, process.env.NODE_ENV, "development"),
    version: first(process.env.RELEASE_VERSION, process.env.npm_package_version, "unversioned"),
    commitSha,
    buildId: first(process.env.RELEASE_BUILD_ID, process.env.RENDER_DEPLOY_ID, process.env.GITHUB_RUN_ID) || null,
  };
}
