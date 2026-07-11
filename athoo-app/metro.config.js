// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Monorepo root (parent of athoo-app/)
const workspaceRoot = path.resolve(__dirname, '..');
const projectRoot = __dirname;

// Explicitly set EXPO_ROUTER_APP_ROOT so babel-preset-expo can inline it
// into _ctx.android.js as a string at compile time.
// Without this, expo-router 6 + SDK 54 leaves it as an unresolved expression
// and require.context() fails because it receives a variable instead of a string.
process.env.EXPO_ROUTER_APP_ROOT = path.resolve(projectRoot, 'app');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// Watch the entire monorepo so Metro sees hoisted node_modules
// and shared packages (lib/, etc.)
config.watchFolders = Array.from(new Set([...(config.watchFolders || []), workspaceRoot]));

// Resolve modules from both the project root AND the workspace root.
// npm workspaces hoist packages to the workspace root by default,
// so without this Metro cannot find hoisted packages.
config.resolver.nodeModulesPaths = Array.from(new Set([
    ...(config.resolver.nodeModulesPaths || []),
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
]));

// Ensure Metro uses the correct project root for Expo Router.
config.projectRoot = projectRoot;

module.exports = config;