import { spawn } from "node:child_process";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = { ...process.env, NODE_ENV: "development" };

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(pnpmCommand, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Command failed with exit code ${code}`)));
  });
}

await run(["run", "build"]);
await run(["run", "start"]);
