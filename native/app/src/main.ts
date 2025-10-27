import { app, BrowserWindow, MessageChannelMain } from "electron";
import { join } from "node:path";
import started from "electron-squirrel-startup";
import { ipcMain, utilityProcess } from "electron/main";
import { WalletInternalProxy } from "./ipc/wallet-internal-proxy";
import { inspect } from "node:util";
import fs, { mkdirSync } from "node:fs";
import os from "node:os";

// Setup logging to file for debugging
const wallet_dir = join(os.homedir(), "keychain");
mkdirSync(wallet_dir, { recursive: true });
const logFile = join(wallet_dir, "aztec-keychain-debug.log");
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function writeLog(level: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${level}] ${args
    .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
    .join(" ")}\n`;

  fs.appendFileSync(logFile, message);
  if (level === "ERROR") {
    originalConsoleError(...args);
  } else {
    originalConsoleLog(...args);
  }
}

console.log = (...args: any[]) => writeLog("INFO", ...args);
console.error = (...args: any[]) => writeLog("ERROR", ...args);

console.log(`=== App Starting ===`);
console.log(`Log file: ${logFile}`);

// Replace placeholder paths with actual runtime paths for packaged app
if (app.isPackaged) {
  const resourcesPath = process.resourcesPath;

  console.log("=== Path Resolution ===");
  console.log("process.resourcesPath:", resourcesPath);
  console.log("process.cwd():", process.cwd());
  console.log("__dirname:", __dirname);

  // Replace placeholders in environment variables
  if (process.env.BB_WASM_PATH?.includes("__RESOURCES_PATH__")) {
    process.env.BB_WASM_PATH = process.env.BB_WASM_PATH.replace(
      "__RESOURCES_PATH__",
      resourcesPath
    );
  }
  if (process.env.BB_BINARY_PATH?.includes("__RESOURCES_PATH__")) {
    process.env.BB_BINARY_PATH = process.env.BB_BINARY_PATH.replace(
      "__RESOURCES_PATH__",
      resourcesPath
    );
  }

  console.log("BB_BINARY_PATH:", process.env.BB_BINARY_PATH);
  console.log("BB_WASM_PATH:", process.env.BB_WASM_PATH);
  console.log(
    "BB_WORKING_DIRECTORY (from env):",
    process.env.BB_WORKING_DIRECTORY
  );

  // Verify binary exists and is executable
  try {
    const stats = fs.statSync(process.env.BB_BINARY_PATH!);
    console.log(
      `BB binary found: ${stats.size} bytes, mode: ${stats.mode.toString(8)}`
    );
  } catch (error: any) {
    console.error("BB binary check failed:", error.message);
  }

  // Ensure BB_WORKING_DIRECTORY is set to a writable location
  const bbWorkingDir = join(os.tmpdir(), "bb");
  process.env.BB_WORKING_DIRECTORY = bbWorkingDir;
  console.log("BB_WORKING_DIRECTORY (updated):", bbWorkingDir);

  // Set CRS_PATH to the same directory so bb can write .bb-crs there
  process.env.CRS_PATH = bbWorkingDir;
  console.log("CRS_PATH (set):", bbWorkingDir);

  // Create the working directory if it doesn't exist
  try {
    if (!fs.existsSync(bbWorkingDir)) {
      fs.mkdirSync(bbWorkingDir, { recursive: true });
      console.log("Created BB_WORKING_DIRECTORY");
    }
  } catch (error: any) {
    console.error("Failed to create BB_WORKING_DIRECTORY:", error.message);
  }
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      sandbox: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
  return mainWindow;
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", async () => {
  const mainWindow = createWindow();
  const { port1: externalPort1, port2: externalPort2 } =
    new MessageChannelMain();
  const { port1: internalPort1, port2: internalPort2 } =
    new MessageChannelMain();
  const { port1: walletLogPort1, port2: walletLogPort2 } =
    new MessageChannelMain();

  const wsServer = utilityProcess.fork(join(__dirname, "ws-worker.js"));

  // Convert all process.env values to strings (Electron requirement)
  const filteredEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && value !== null) {
      // Convert to string to handle cases where env vars are numbers
      filteredEnv[key] = String(value);
    }
  }

  const wallet = utilityProcess.fork(join(__dirname, "wallet-worker.js"), [], {
    env: filteredEnv,
  });

  wsServer.postMessage({ type: "ports" }, [externalPort1]);
  wallet.postMessage({ type: "ports" }, [
    externalPort2,
    internalPort1,
    walletLogPort1,
  ]);

  wsServer.on("exit", () => {
    console.error("ws server process died");
    process.exit(1);
  });

  wallet.on("exit", () => {
    console.error("wallet process died");
    process.exit(1);
  });

  walletLogPort2.start();
  walletLogPort2.on("message", (event) => {
    const { type, args } = event.data;
    if (type !== "log") {
      return;
    }
    const sanitizedArgs = JSON.parse(args);
    const dataObject = sanitizedArgs.pop();
    console.log(`${sanitizedArgs.join(" ")} ${inspect(dataObject)}`);
  });

  const walletProxy = WalletInternalProxy.create(internalPort2);
  walletProxy.onWalletUpdate((event) => {
    mainWindow.webContents.send("wallet-update", event);
  });
  walletProxy.onAuthorizationRequest((event) => {
    mainWindow.webContents.send("authorization-request", event);
  });
  const internalMethods = [
    "getAccounts",
    "getAddressBook",
    "registerSender",
    "getTxReceipt",
    "createAccount",
    "getInteractions",
    "getExecutionTrace",
    "resolveAuthorization",
    "listAuthorizedApps",
    "getAppAuthorizations",
    "updateAccountAuthorization",
    "revokeAuthorization",
    "revokeAppAuthorizations",
  ];
  for (const method of internalMethods) {
    ipcMain.handle(method, async (_event, args) => {
      return walletProxy[method](...(args ? JSON.parse(args) : []));
    });
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
