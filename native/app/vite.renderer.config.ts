import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { PolyfillOptions, nodePolyfills } from "vite-plugin-node-polyfills";

const nodePolyfillsFix = (options?: PolyfillOptions | undefined): Plugin => {
  return {
    ...nodePolyfills(options),
    /* @ts-ignore */
    resolveId(source: string) {
      const m =
        /^vite-plugin-node-polyfills\/shims\/(buffer|global|process)$/.exec(
          source
        );
      if (m) {
        return `./node_modules/vite-plugin-node-polyfills/shims/${m[1]}/dist/index.cjs`;
      }
    },
  };
};

// https://vitejs.dev/config
export default defineConfig({
  server: {
    port: 5174,
  },
  plugins: [
    react({
      jsxImportSource: "@emotion/react",
    }),
    nodePolyfillsFix({ include: ["buffer", "path"] }),
  ],
});
