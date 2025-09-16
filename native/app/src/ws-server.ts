import { createServer } from "http";
import express, { json } from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import type { MessagePortMain } from "electron";
import e from "express";

async function main() {
  const app = express();
  app.use(cors());
  app.use(json());

  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  let externalPort: MessagePortMain;

  const handleWalletEvent = (event: any) => {
    console.log("Sending message to ws clients:", event.data);
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
      console.error("WebSocket error:", err);
      ws.close();
    });

    ws.on("message", (data) => {
      console.log("Received message from ws client:", data.toString("utf-8"));
      externalPort.postMessage({
        origin: "websocket",
        content: data.toString("utf-8"),
      });
    });
  });

  await server.listen(8765);
  console.info("WebSocket server started on ws://localhost:8765");
}

main();
