module.exports = function (api) {
  api.cache(true);

  const nodePath = require('path');

  // expo-router 6 + SDK 54: babel-preset-expo from SDK 54 does not inline
  // any of expo-router 6's compile-time env vars. We replace them all here
  // so require.context() receives valid literals before Metro validates them.
  const appRoot = nodePath.resolve(__dirname, 'app');

  // EXPO_ROUTER_IMPORT_MODE controls how modules inside require.context are loaded.
  // 'sync' = eager (all routes bundled upfront) — correct for native Android/iOS.
  // 'lazy' is only used for web/server builds.
  const importMode = 'sync';

  function expoRouterEnvPlugin({ types: t }) {
    const replacements = {
      EXPO_ROUTER_APP_ROOT: t.stringLiteral(appRoot),
      EXPO_ROUTER_IMPORT_MODE: t.stringLiteral(importMode),
    };

    return {
      visitor: {
        MemberExpression(p) {
          if (
            t.isMemberExpression(p.node.object) &&
            t.isIdentifier(p.node.object.object, { name: 'process' }) &&
            t.isIdentifier(p.node.object.property, { name: 'env' }) &&
            t.isIdentifier(p.node.property) &&
            replacements[p.node.property.name]
          ) {
            p.replaceWith(replacements[p.node.property.name]);
          }
        },
      },
    };
  }

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      expoRouterEnvPlugin,
      'react-native-reanimated/plugin',
    ],
  };
};