import { app, BrowserWindow, MessageChannelMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { ipcMain, utilityProcess } from "electron/main";
import { WalletInternalProxy } from "./wallet-internal-proxy";
import { inspect } from "node:util";

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
      preload: path.join(__dirname, "preload.js"),
      sandbox: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
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

  const wsServer = utilityProcess.fork(path.join(__dirname, "ws-worker.js"));
  const wallet = utilityProcess.fork(path.join(__dirname, "wallet-worker.js"));

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
  const internalMethods = [
    "getAccounts",
    "getSenders",
    "registerSender",
    "getTxReceipt",
    "createAccount",
    "getInteractions",
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
