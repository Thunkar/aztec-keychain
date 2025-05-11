import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { viteSingleFile } from "vite-plugin-singlefile";
import { viteStaticCopy } from "vite-plugin-static-copy";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    nodePolyfills({ include: ["buffer"] }),
    react({
      jsxImportSource: "@emotion/react",
    }),
    viteStaticCopy({
      targets: [
        {
          src: "../../contracts/artifacts/EcdsaRAccount.json.gz",
          dest: "assets",
        },
      ],
    }),
    viteSingleFile(),
  ],
});
