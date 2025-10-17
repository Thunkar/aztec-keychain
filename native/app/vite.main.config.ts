import { defineConfig } from "vite";

// In development, use the paths from environment variables
// In production, use placeholders that will be replaced at runtime
const isDev = process.env.NODE_ENV !== "production";

const BB_WASM_PATH = isDev
  ? process.env.BB_WASM_PATH
  : "__RESOURCES_PATH__/bb/barretenberg-threads.wasm.gz";

const BB_BINARY_PATH = isDev
  ? process.env.BB_BINARY_PATH
  : "__RESOURCES_PATH__/bb/bb";

const BB_WORKING_DIRECTORY = isDev
  ? process.env.BB_WORKING_DIRECTORY || "/tmp/bb"
  : "__APP_PATH__/bb-temp";

// https://vitejs.dev/config
export default defineConfig({
  define: {
    "process.env": JSON.stringify({
      // Our pino logger gets confused by electron, and tries to use the
      // default nodejs transports in a web worker. This breaks everything since
      // this app runs with nodeIntegration: false,
      // so for the time being I'm using the escape hatch of making @aztec/foundation pino
      // logger think we're in a jest test. Hehe.
      JEST_WORKER_ID: 1,
      LOG_LEVEL: "verbose",
      BB_WASM_PATH,
      BB_BINARY_PATH,
      BB_WORKING_DIRECTORY,
    }),
  },
});
