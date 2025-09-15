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
    ws.on("error", console.error);

    ws.on("message", function message(data) {
      console.info("received: %s", data);
    });
  });

  await server.listen(8765);
  console.info("WebSocket server started on ws://localhost:8765");
}

main();
