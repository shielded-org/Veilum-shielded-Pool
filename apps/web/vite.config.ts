import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");

  return {
    plugins: [react(), wasm()],
    define: { global: "globalThis" },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        buffer: path.resolve(__dirname, "../../node_modules/buffer/"),
      },
      dedupe: ["@stellar/stellar-base", "@stellar/stellar-sdk"],
    },
    optimizeDeps: {
      include: ["@stellar/stellar-sdk", "buffer"],
      exclude: ["@noir-lang/noir_js", "@noir-lang/acvm_js", "@noir-lang/noirc_abi", "@aztec/bb.js"],
      esbuildOptions: { define: { global: "globalThis" }, target: "esnext" },
    },
    build: { target: "esnext", commonjsOptions: { transformMixedEsModules: true } },
    server: {
      port: 5173,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      proxy: {
        "/api/relayer": {
          target: env.VITE_RELAYER_URL || "http://127.0.0.1:8787",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/relayer/, ""),
        },
        "/api/asp": {
          target: env.VITE_ASP_URL || "http://127.0.0.1:8788",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/asp/, ""),
        },
        "/api/indexer": {
          target: env.VITE_INDEXER_URL || "http://127.0.0.1:8789",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/indexer/, ""),
        },
      },
    },
    assetsInclude: ["**/*.wasm"],
  };
});
