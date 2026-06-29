import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");

  return {
    base: "./",
    plugins: [react(), wasm()],
    define: {
      global: "globalThis",
      "process.env.NODE_ENV": JSON.stringify(mode),
    },
    resolve: {
      alias: {
        buffer: path.resolve(__dirname, "../../node_modules/buffer/"),
        process: path.resolve(__dirname, "../../node_modules/process/browser.js"),
        stream: path.resolve(__dirname, "../../node_modules/stream-browserify/index.js"),
      },
      dedupe: ["@stellar/stellar-base", "@stellar/stellar-sdk"],
    },
    optimizeDeps: {
      include: ["@stellar/stellar-sdk", "buffer", "process", "stream-browserify"],
      exclude: ["@noir-lang/noir_js", "@noir-lang/acvm_js", "@noir-lang/noirc_abi", "@aztec/bb.js"],
      esbuildOptions: { define: { global: "globalThis" }, target: "esnext" },
    },
    build: {
      outDir: "dist",
      target: "esnext",
      commonjsOptions: { transformMixedEsModules: true },
      rollupOptions: {
        output: {
          manualChunks: {
            stellar: ["@stellar/stellar-sdk"],
            noir: ["@noir-lang/noir_js", "@aztec/bb.js"],
          },
        },
      },
    },
    assetsInclude: ["**/*.wasm"],
    server: {
      port: Number(env.VITE_DEV_PORT || 5190),
    },
  };
});
