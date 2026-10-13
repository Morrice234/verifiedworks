// Metro config: keep the bundler out of the backend server folder.
// backend/ has its own node_modules (Prisma, TypeScript, Express). Without this,
// Metro crawls and watches all of it, which can run Node out of memory on Windows.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const escape = (p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const backendDir = escape(path.resolve(__dirname, 'backend'));

const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  new RegExp(`^${backendDir}([\\\\/].*)?$`),
  /.*\.zip$/,
];

// Each Metro worker is a separate Node process. On a PC that is short on memory,
// several workers transforming files at once can each fail with "out of memory: Zone".
// One worker is slower on a cold start but the lightest. Raise it once memory allows.
config.maxWorkers = 1;

module.exports = config;
