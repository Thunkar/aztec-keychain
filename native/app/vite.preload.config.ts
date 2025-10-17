import { defineConfig, loadEnv } from "vite";
import { resolve } from "path";

// https://vitejs.dev/config
export default ({ mode }) =>
  defineConfig({
    define: {
      "process.env": JSON.stringify({
        // Our pino logger gets confused by electron, and tries to use the
        // default nodejs transports in a web worker. This breaks everything since
        // this app runs with nodeIntegration: false,
        // so for the time being I'm using the escape hatch of making @aztec/foundation pino
        // logger think we're in a jest test. Hehe.
        JEST_WORKER_ID: 1,
        LOG_LEVEL: "verbose",
        BB_WASM_PATH:
          mode !== "PROD"
            ? resolve(
                __dirname,
                "./node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz"
              )
            : undefined,
      }),
    },
    build: {
      rollupOptions: {
        // This is required due to unfortunate electron-forge weirdness
        external: ["@aztec/kv-store/lmdb-v2", "@aztec/bb.js"],
      },
    },
  });
