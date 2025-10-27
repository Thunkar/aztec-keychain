import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import { Walker, DepType } from "flora-colossus";
import type { Module } from "flora-colossus";
import fsp from "node:fs/promises";
import path from "node:path";

type CopyClass<T> = {
  [P in keyof T]: T[P];
};

type CustomWalker = CopyClass<Walker> & {
  modules: Module[];
  walkDependenciesForModule: (
    moduleRoot: string,
    depType: DepType
  ) => Promise<void>;
};

const externalDependencies = ["@aztec/kv-store", "@aztec/bb.js"];

// Map to swap dependency names: key = dependency name to copy, value = source package name
const dependencyMap: Record<string, string> = {
  // Example: "@some/package": "@some/other-package"
  "@spalladino/viem": "viem",
};

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    extraResource: ["./bb"],
  },
  hooks: {
    async packageAfterCopy(_forgeConfig, buildPath) {
      const depsToCopy = new Set<string>(externalDependencies);

      const sourceNodeModulesPath = path.resolve(__dirname, "node_modules");
      const destNodeModulesPath = path.resolve(buildPath, "node_modules");

      console.log(`Copying external dependencies and their transitive deps...`);
      console.log(`External dependencies: ${externalDependencies.join(", ")}`);

      for (const dep of externalDependencies) {
        const walker = new Walker(
          path.join(sourceNodeModulesPath, dep)
        ) as unknown as CustomWalker;

        await walker.walkDependenciesForModule(
          path.join(sourceNodeModulesPath, dep),
          DepType.PROD
        );

        walker.modules.forEach((treeDep) => {
          depsToCopy.add(treeDep.name);
        });
      }

      console.log(
        `Total packages to copy (including transitive): ${depsToCopy.size}`
      );

      await Promise.all(
        Array.from(depsToCopy.values()).map(async (packageName) => {
          // Use mapped source if available, otherwise use the original package name
          const sourcePackageName = dependencyMap[packageName] || packageName;
          const sourcePath = path.join(
            sourceNodeModulesPath,
            sourcePackageName
          );
          const destPath = path.join(destNodeModulesPath, packageName);

          await fsp.mkdir(path.dirname(destPath), { recursive: true });
          await fsp.cp(sourcePath, destPath, {
            recursive: true,
            preserveTimestamps: true,
          });
        })
      );

      console.log("✓ External dependencies copied successfully");
    },
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/ipc/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
        {
          entry: "src/workers/ws-worker.ts",
          config: "vite.preload.config.ts",
        },
        {
          entry: "src/workers/wallet-worker.ts",
          config: "vite.preload.config.ts",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
