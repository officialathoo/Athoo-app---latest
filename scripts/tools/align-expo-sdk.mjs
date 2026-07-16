#!/usr/bin/env node
// Kept as the maintenance alias. The repair command also normalizes pnpm's
// dependency layout, removes duplicate CLI installations, selects a WebRTC
// config-plugin release whose peer range matches the installed Expo SDK, and
// validates Metro on Windows.
await import("./repair-expo-toolchain.mjs");
