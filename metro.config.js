const { ServerResponse } = require('http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql'); // Drizzle migrations

// Web: expo-sqlite runs as WebAssembly and needs SharedArrayBuffer, which browsers only allow when the page is sent
// with these two headers. Whatever hosts the exported site must send them too (app.json does it for EAS Hosting).
config.resolver.assetExts.push('wasm');
// ponytail: patches every response of the dev server. The documented hook (server.enhanceMiddleware) only reaches
// Metro's own responses, and Expo answers the page itself. Go back to the hook if Expo CLI starts passing the page through it.
const writeHead = ServerResponse.prototype.writeHead;
ServerResponse.prototype.writeHead = function (...args) {
  if (!this.headersSent) {
    this.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    this.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }
  return writeHead.apply(this, args);
};

module.exports = config;
