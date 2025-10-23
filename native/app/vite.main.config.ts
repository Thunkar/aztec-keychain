import { defineConfig } from "vite";
import { resolve } from "path";
import { tmpdir } from "os";

const isDev = process.env.NODE_ENV !== "production";

const BB_WASM_PATH = isDev
  ? resolve(__dirname, "./bb/barretenberg-threads.wasm.gz")
  : "__RESOURCES_PATH__/bb/barretenberg-threads.wasm.gz";

const BB_BINARY_PATH = isDev
  ? resolve(__dirname, "./bb/bb")
  : "__RESOURCES_PATH__/bb/bb";

const BB_WORKING_DIRECTORY = resolve(tmpdir(), "bb");

// https://vitejs.dev/config
export default defineConfig({
  define: {
    "process.env": JSON.stringify({
      // Our pino logger gets confused by electron, and tries to use the
      // default nodejs transports in a web worker. This breaks everything since
      // this app runs with nodeIntegration: false,
      // so for the time being I'm using the escape hatch of making @aztec/foundation pino
      // logger think we're in a jest test. Hehe.
      JEST_WORKER_ID: "1",
      LOG_LEVEL: "verbose",
      BB_WASM_PATH,
      BB_BINARY_PATH,
      BB_WORKING_DIRECTORY,
    }),
  },
});
