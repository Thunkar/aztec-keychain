import { WebSocketServer } from "ws";
import { pino } from "pino";
import { createServer } from "http";
import express, { type Request, type Response, json } from "express";
import { pinoHttp } from "pino-http";
import cors from "cors";
import { secp256r1 } from "@noble/curves/p256";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SerialPort } from "serialport";

const argv = await yargs(hideBin(process.argv))
  .options({
    port: { type: "string", default: "/dev/cu.usbmodem1101" },
    mode: { type: "string", default: "web" },
  })
  .parse();

const simMode: "web" | "serial" = argv.mode === "web" ? "web" : "serial";

async function main() {
  const logger = pino({
    transport: {
      target: "pino-pretty",
    },
  });

  if (simMode === "serial") {
    const port = new SerialPort({ path: argv.port, baudRate: 115200 });

    port.on("open", () => {
      logger.info("Serial port opened");
    });

    const signRequest = {
      type: 0, // 0 -> sign
      data: {
        pk: [
          48, 168, 141, 176, 41, 177, 184, 221, 197, 48, 91, 58, 26, 192, 122,
          155, 251, 228, 76, 87, 101, 192, 82, 239, 37, 216, 52, 91, 129, 87,
          55, 132, 83, 234, 49, 249, 44, 139, 117, 245, 48, 161, 160, 140, 211,
          121, 86, 141, 34, 225, 20, 255, 1, 212, 149, 128, 192, 96, 51, 189,
          25, 248, 42, 23,
        ],
        msg: "amessagewith32charactersforsure1"
          .split("")
          .map((char) => char.charCodeAt(0)),
      },
    };

    port.write(JSON.stringify(signRequest));

    port.on("data", (data) => {
      logger.info(data);
    });
  } else {
    const app = express();
    app.use(cors());
    app.use(json());
    app.use(
      pinoHttp({
        logger,
        serializers: {
          req(req) {
            return {
              body: req.raw.body,
              url: req.raw.url,
              method: req.raw.method,
            };
          },
        },
      })
    );

    const MAX_KEYS = 5;
    const PK_LENGTH = 64;
    const SK_LENGTH = 32;

    type KeyIndex = { index: number };
    type Key = { sk: number[]; pk: number[]; index: number };

    type State = {
      keys: Key[];
      status: 0 | 1 | 2; // 0 -> IDLE, 1 -> GENERATING KEY, 2 -> SIGNING
    };
    const state: State = {
      keys: Array(MAX_KEYS)
        .fill(0)
        .map((_, i) => ({
          pk: Array(PK_LENGTH).fill(255),
          sk: Array(SK_LENGTH).fill(255),
          index: i,
        })),
      status: 0,
    };

    app.post("/keys", (req: Request<any, any, KeyIndex>, res: Response) => {
      const { index } = req.body;
      state.status = 1;
      const sk = secp256r1.utils.randomPrivateKey();
      const pk = secp256r1.getPublicKey(sk);
      state.keys[index] = { sk: Array.from(sk), pk: Array.from(pk), index };
      res.status(200).send("Ok");
    });

    app.get(
      "/keys",
      (
        req: Request<any, any, any, KeyIndex>,
        res: Response<Omit<Key, "sk">>
      ) => {
        const { index } = req.query;
        const key = state.keys[index];
        res.status(200).json({ index, pk: key.pk });
      }
    );

    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
      ws.on("error", logger.error);

      ws.on("message", function message(data) {
        logger.info("received: %s", data);
      });
    });

    await server.listen(8080);

    logger.info("Server listening on port 8080");

    setInterval(() => {
      const newState = [state.status].map((s) => s.toString()).join(",");
      wss.clients.forEach((client) => {
        client.send(newState);
      });
    }, 50);
  }
}

main();
