import { createServer } from "http";
import express, { json } from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import type { MessagePortMain } from "electron";

async function main() {
  const app = express();
  app.use(cors());
  app.use(json());

  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  let externalPort: MessagePortMain;

  const handleWalletEvent = (event: any) => {
    const { origin, content } = event.data;
    if (origin !== "wallet") {
      return;
    }
    wss.clients.forEach((client) => client.send(content));
  };

  process.parentPort.once("message", (message: any) => {
    if (message.data.type === "ports" && message.ports?.length) {
      [externalPort] = message.ports;
      externalPort.on("message", (message: any) => handleWalletEvent(message));
      externalPort.start();
    }
  });

  wss.on("connection", (ws) => {
    ws.on("error", (err) => {
      ws.close();
    });

    ws.on("message", (data) => {
      if (data.toString() === "keepalive") {
        return;
      }
      externalPort.postMessage({
        origin: "websocket",
        content: data.toString("utf-8"),
      });
    });
  });

  await server.listen(8765);
}

main();
