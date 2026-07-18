import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port = rawPort && !Number.isNaN(Number(rawPort)) && Number(rawPort) > 0
  ? Number(rawPort)
  : 5173;

const basePath = process.env.BASE_PATH || "/";

function first(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) return normalized;
  }
  return null;
}

function safeCommit(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{7,64}$/.test(normalized) ? normalized : null;
}

function releaseManifestPlugin(): Plugin {
  const manifest = {
    schemaVersion: 1,
    service: "athoo-admin",
    environment: first(
      process.env.VITE_APP_ENV,
      process.env.APP_ENV,
      process.env.VERCEL_ENV,
      "unknown",
    ),
    version: first(
      process.env.VITE_RELEASE_VERSION,
      process.env.RELEASE_VERSION,
      "unversioned",
    ),
    commitSha: safeCommit(first(
      process.env.VITE_RELEASE_COMMIT_SHA,
      process.env.RELEASE_COMMIT_SHA,
      process.env.VERCEL_GIT_COMMIT_SHA,
      process.env.GITHUB_SHA,
    )),
    buildId: first(
      process.env.VITE_RELEASE_BUILD_ID,
      process.env.RELEASE_BUILD_ID,
      process.env.VERCEL_DEPLOYMENT_ID,
      process.env.GITHUB_RUN_ID,
    ),
    generatedAt: new Date().toISOString(),
  };

  return {
    name: "athoo-admin-release-manifest",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "release.json",
        source: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), releaseManifestPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/recharts/") || id.includes("/node_modules/d3-")) {
            return "charts";
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
