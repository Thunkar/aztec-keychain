import { defineConfig } from "vite";

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // This is required due to unfortunate electron-forge weirdness
      external: ["@aztec/kv-store/lmdb-v2", "@aztec/bb.js"],
    },
  },
});
