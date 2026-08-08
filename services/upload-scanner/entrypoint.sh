#!/bin/bash
set -euo pipefail

mkdir -p /var/run/clamav /var/lib/clamav
chown -R clamav:clamav /var/run/clamav /var/lib/clamav

# Refuse to start without usable signatures. This keeps the service fail-closed.
freshclam --stdout

# Keep definitions refreshed while the container is running.
freshclam --daemon --foreground --checks=12 --stdout &
FRESHCLAM_PID=$!

clamd --config-file=/etc/clamav/clamd.conf &
CLAMD_PID=$!

cleanup() {
  kill "$CLAMD_PID" "$FRESHCLAM_PID" 2>/dev/null || true
}
trap cleanup EXIT TERM INT

for _ in $(seq 1 120); do
  if node -e 'const net=require("node:net");const nul=String.fromCharCode(0);const s=net.createConnection({host:"127.0.0.1",port:3310},()=>{s.write("zPING"+nul)});s.setTimeout(1000,()=>{s.destroy();process.exit(1)});s.on("data",d=>{const ok=d.toString().split(nul).join("").trim()==="PONG";s.destroy();process.exit(ok?0:1)});s.on("error",()=>process.exit(1));'; then
    break
  fi
  if ! kill -0 "$CLAMD_PID" 2>/dev/null; then
    echo "clamd exited before becoming ready" >&2
    exit 1
  fi
  sleep 1
done

if ! kill -0 "$CLAMD_PID" 2>/dev/null; then
  echo "clamd is not running" >&2
  exit 1
fi

node /opt/athoo-scanner/server.mjs &
NODE_PID=$!

wait -n "$CLAMD_PID" "$NODE_PID"
exit 1