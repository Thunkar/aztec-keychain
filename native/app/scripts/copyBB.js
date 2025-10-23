const fs = require("fs");
const path = require("path");
const https = require("https");
const { exec } = require("child_process");
const { promisify } = require("util");

const execPromise = promisify(exec);

// Read package.json to get bb.js version
const packageJsonPath = path.join(__dirname, "../package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const bbJsVersion = packageJson.dependencies["@aztec/bb.js"];

if (!bbJsVersion) {
  console.error("✗ @aztec/bb.js version not found in package.json");
  process.exit(1);
}

console.log(`Using bb.js version: ${bbJsVersion}`);

// Determine platform and architecture
function getPlatformArch() {
  const platform = process.platform;
  const arch = process.arch;

  let platformName, archName;

  // Map Node.js platform to GitHub release naming
  switch (platform) {
    case "darwin":
      platformName = "darwin";
      break;
    case "linux":
      platformName = "linux";
      break;
    case "win32":
      platformName = "windows";
      break;
    default:
      console.error(`✗ Unsupported platform: ${platform}`);
      process.exit(1);
  }

  // Map Node.js arch to GitHub release naming
  switch (arch) {
    case "arm64":
      archName = "arm64";
      break;
    case "x64":
      archName = "x86_64";
      break;
    default:
      console.error(`✗ Unsupported architecture: ${arch}`);
      process.exit(1);
  }

  return `${archName}-${platformName}`;
}

// Download file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading from ${url}...`);
    const file = fs.createWriteStream(destPath);

    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirects
          file.close();
          fs.unlinkSync(destPath);
          downloadFile(response.headers.location, destPath)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(destPath);
          reject(
            new Error(`Failed to download: HTTP ${response.statusCode}`)
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        file.close();
        fs.unlinkSync(destPath);
        reject(err);
      });
  });
}

// Extract tar.gz file
async function extractTarGz(tarPath, extractDir) {
  console.log(`Extracting ${tarPath}...`);
  try {
    await execPromise(`tar -xzf "${tarPath}" -C "${extractDir}"`);
    console.log("✓ Extraction complete");
  } catch (error) {
    console.error(`✗ Failed to extract: ${error.message}`);
    throw error;
  }
}

// Main function
async function main() {
  // Source paths
  const BB_WASM_SOURCE = path.resolve(
    __dirname,
    "../node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz"
  );

  // Destination directory - will be packaged with the app
  const RESOURCES_DIR = path.join(__dirname, "..");
  const BB_DIR = path.join(RESOURCES_DIR, "bb");
  const TEMP_DIR = path.join(BB_DIR, "temp");

  // Create directories if they don't exist
  if (!fs.existsSync(BB_DIR)) {
    fs.mkdirSync(BB_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Copy WASM file
  const wasmDest = path.join(BB_DIR, "barretenberg-threads.wasm.gz");
  console.log(`Copying WASM from ${BB_WASM_SOURCE} to ${wasmDest}`);
  if (fs.existsSync(BB_WASM_SOURCE)) {
    fs.copyFileSync(BB_WASM_SOURCE, wasmDest);
    console.log("✓ WASM file copied successfully");
  } else {
    console.error(`✗ WASM file not found at ${BB_WASM_SOURCE}`);
    process.exit(1);
  }

  // Download and extract BB binary
  const platformArch = getPlatformArch();
  const tarballName = `barretenberg-${platformArch}.tar.gz`;
  const downloadUrl = `https://github.com/AztecProtocol/aztec-packages/releases/download/${bbJsVersion}/${tarballName}`;
  const tarballPath = path.join(TEMP_DIR, tarballName);

  try {
    // Download the tarball
    await downloadFile(downloadUrl, tarballPath);
    console.log("✓ Download complete");

    // Extract the tarball directly to the BB directory
    // Note: We extract directly instead of copying from temp to avoid issues with
    // fs.copyFileSync() which can corrupt the binary on macOS by not preserving
    // all necessary file attributes
    await extractTarGz(tarballPath, BB_DIR);

    // Verify the bb binary exists
    const binaryName = process.platform === "win32" ? "bb.exe" : "bb";
    const binaryDest = path.join(BB_DIR, binaryName);

    if (fs.existsSync(binaryDest)) {
      // Make sure the binary is executable (Unix-like systems)
      if (process.platform !== "win32") {
        fs.chmodSync(binaryDest, 0o755);
      }
      console.log("✓ BB binary installed successfully");
    } else {
      console.error(`✗ BB binary not found after extraction at ${binaryDest}`);
      process.exit(1);
    }

    // Clean up temp directory
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log("✓ Temporary files cleaned up");

    console.log("\n✓ All files copied successfully to ./bb/");
  } catch (error) {
    console.error(`✗ Error: ${error.message}`);
    // Clean up on error
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
    process.exit(1);
  }
}

main();
