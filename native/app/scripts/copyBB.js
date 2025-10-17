const fs = require("fs");
const path = require("path");

// Source paths from environment variables or defaults
const BB_WASM_SOURCE = path.resolve(
  __dirname,
  "../node_modules/@aztec/bb.js/dest/node/barretenberg_wasm/barretenberg-threads.wasm.gz"
);
const BB_BINARY_SOURCE =
  process.env.BB_BINARY_PATH ||
  path.join(
    process.env.HOME,
    "Repos/aztec-packages/barretenberg/cpp/build/bin/bb"
  );

// Destination directory - will be packaged with the app
const RESOURCES_DIR = path.join(__dirname, "..");
const BB_DIR = path.join(RESOURCES_DIR, "bb");

// Create directories if they don't exist
if (!fs.existsSync(RESOURCES_DIR)) {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });
}
if (!fs.existsSync(BB_DIR)) {
  fs.mkdirSync(BB_DIR, { recursive: true });
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

// Copy BB binary
const binaryDest = path.join(BB_DIR, "bb");
console.log(`Copying BB binary from ${BB_BINARY_SOURCE} to ${binaryDest}`);
if (fs.existsSync(BB_BINARY_SOURCE)) {
  fs.copyFileSync(BB_BINARY_SOURCE, binaryDest);
  // Make sure the binary is executable
  fs.chmodSync(binaryDest, 0o755);
  console.log("✓ BB binary copied successfully");
} else {
  console.error(`✗ BB binary not found at ${BB_BINARY_SOURCE}`);
  process.exit(1);
}

console.log("\n✓ All files copied successfully to ./bb/");
