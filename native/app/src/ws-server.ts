import { createServer } from "http";
import express, { json } from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

async function main() {
  const app = express();
  app.use(cors());
  app.use(json());

  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    process.parentPort.on("message", (message: any) => {
      console.log("Sending message to ws client:", message.data);
      ws.send(message.data);
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    });

    ws.on("message", (data) => {
      process.parentPort.postMessage(data.toString("utf-8"));
    });
  });

  await server.listen(8765);
  console.info("WebSocket server started on ws://localhost:8765");
}

main();
