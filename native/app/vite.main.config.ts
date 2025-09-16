import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["lmdb", "@aztec/kv-store/lmdb-v2", "@aztec/bb.js"],
    },
  },
});
