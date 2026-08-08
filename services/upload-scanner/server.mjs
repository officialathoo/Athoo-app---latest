import { createServer } from "node:http";
import { createConnection } from "node:net";
import { timingSafeEqual } from "node:crypto";

const PORT = boundedInteger(process.env.PORT, 8080, 1, 65535);
const CLAMD_HOST = String(process.env.CLAMD_HOST || "127.0.0.1").trim();
const CLAMD_PORT = boundedInteger(process.env.CLAMD_PORT, 3310, 1, 65535);
const SCANNER_MAX_BYTES = boundedInteger(process.env.SCANNER_MAX_BYTES, 209715200, 1024, 1073741824);
const SCANNER_MAX_CONCURRENCY = boundedInteger(process.env.SCANNER_MAX_CONCURRENCY, 2, 1, 20);
const SCANNER_TIMEOUT_MS = boundedInteger(process.env.SCANNER_TIMEOUT_MS, 120000, 5000, 300000);
const SCANNER_TOKEN = String(process.env.SCANNER_TOKEN || "").trim();

if (SCANNER_TOKEN.length < 24) {
  throw new Error("SCANNER_TOKEN must be at least 24 characters");
}

let activeScans = 0;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function sendJson(res, statusCode, payload) {
  if (res.headersSent) return;
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

function authorized(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7).trim(), "utf8");
  const expected = Buffer.from(SCANNER_TOKEN, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function writeSocket(socket, chunk) {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new Error("clamd_socket_closed"));
      return;
    }
    const ok = socket.write(chunk, (error) => error ? reject(error) : resolve());
    if (!ok) socket.once("drain", resolve);
  });
}

function connectClamd() {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: CLAMD_HOST, port: CLAMD_PORT });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("clamd_connect_timeout"));
    }, SCANNER_TIMEOUT_MS);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.setTimeout(SCANNER_TIMEOUT_MS, () => socket.destroy(new Error("clamd_timeout")));
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function readClamdResponse(socket) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const cleanup = () => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("end", onEnd);
      socket.removeListener("close", onClose);
    };
    const finish = () => {
      cleanup();
      resolve(Buffer.concat(chunks, total).toString("utf8").replace(/\0+$/g, "").trim());
    };
    const onData = (chunk) => {
      total += chunk.length;
      if (total > 8192) {
        cleanup();
        socket.destroy();
        reject(new Error("clamd_response_too_large"));
        return;
      }
      chunks.push(chunk);
      if (chunk.includes(0)) finish();
    };
    const onError = (error) => { cleanup(); reject(error); };
    const onEnd = () => finish();
    const onClose = () => {
      if (total === 0) {
        cleanup();
        reject(new Error("clamd_closed_without_response"));
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
    socket.once("close", onClose);
  });
}

async function clamdPing() {
  const socket = await connectClamd();
  try {
    const responsePromise = readClamdResponse(socket);
    await writeSocket(socket, Buffer.from("zPING\0", "ascii"));
    const response = await responsePromise;
    return response === "PONG";
  } finally {
    socket.destroy();
  }
}

async function scanRequest(req) {
  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > SCANNER_MAX_BYTES) {
    const error = new Error("request_too_large");
    error.code = "REQUEST_TOO_LARGE";
    throw error;
  }

  const socket = await connectClamd();
  let total = 0;
  try {
    const responsePromise = readClamdResponse(socket);
    await writeSocket(socket, Buffer.from("zINSTREAM\0", "ascii"));

    for await (const value of req) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      total += chunk.length;
      if (total > SCANNER_MAX_BYTES) {
        const error = new Error("request_too_large");
        error.code = "REQUEST_TOO_LARGE";
        throw error;
      }
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(chunk.length, 0);
      await writeSocket(socket, length);
      await writeSocket(socket, chunk);
    }

    await writeSocket(socket, Buffer.alloc(4));
    const response = await responsePromise;

    if (/\bFOUND$/i.test(response)) return { clean: false };
    if (/\bOK$/i.test(response)) return { clean: true };
    throw new Error("clamd_invalid_response");
  } finally {
    socket.destroy();
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://scanner.local");

  if (req.method === "GET" && url.pathname === "/healthz") {
    try {
      const ready = await clamdPing();
      sendJson(res, ready ? 200 : 503, { ok: ready, engine: "clamav" });
    } catch {
      sendJson(res, 503, { ok: false, engine: "clamav" });
    }
    return;
  }

  if (req.method !== "POST" || url.pathname !== "/scan") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  if (!authorized(req)) {
    req.resume();
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }

  if (activeScans >= SCANNER_MAX_CONCURRENCY) {
    req.resume();
    sendJson(res, 429, { error: "scanner_busy" });
    return;
  }

  activeScans += 1;
  try {
    const result = await scanRequest(req);
    sendJson(res, 200, result);
  } catch (error) {
    req.resume();
    if (error?.code === "REQUEST_TOO_LARGE") {
      sendJson(res, 413, { error: "request_too_large" });
    } else {
      sendJson(res, 503, { error: "scanner_unavailable" });
    }
  } finally {
    activeScans -= 1;
  }
});

server.requestTimeout = SCANNER_TIMEOUT_MS + 10000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "upload_scanner_ready", port: PORT, engine: "clamav" }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ event: "upload_scanner_shutdown", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));