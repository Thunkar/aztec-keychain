import { createServer } from "http";
import express, { type Request, type Response, json } from "express";
import { pinoHttp } from "pino-http";
import cors from "cors";
import { secp256r1 } from "@noble/curves/p256";
import { Logger } from "pino";
import {
  Account,
  AccountIndex,
  CurrentSignatureRequest,
  MSK_LENGTH,
  SALT_LENGTH,
  Settings,
  settings,
  state,
} from "../state.js";
import { randomBytes } from "crypto";
import { WebSocketServer } from "ws";

export async function initServer(logger: Logger) {
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

  app.post(
    "/accounts",
    (req: Request<any, any, AccountIndex>, res: Response) => {
      const { index } = req.body;
      state.status = 1;
      const sk = secp256r1.utils.randomPrivateKey();
      const pk = secp256r1.getPublicKey(sk);
      state.accounts[index] = {
        msk: Array.from(randomBytes(MSK_LENGTH)),
        salt: Array.from(randomBytes(SALT_LENGTH)),
        sk: Array.from(sk),
        pk: Array.from(pk),
        index,
      };
      state.status = 0;
      res.status(200).send("Ok");
    }
  );

  app.get(
    "/accounts",
    (
      req: Request<any, any, any, AccountIndex>,
      res: Response<Omit<Account, "sk">>
    ) => {
      const { index } = req.query;
      const account = state.accounts[index];
      res.status(200).json({
        index,
        pk: account.pk,
        salt: account.salt,
        msk: account.msk,
      });
    }
  );

  type SignatureRequestUserReponse = { accepted: boolean };

  app.post(
    "/signature",
    (req: Request<any, any, SignatureRequestUserReponse>, res: Response) => {
      state.status = 0;
      res.status(200).send("Ok");
    }
  );

  app.get(
    "/signature",
    (req: Request, res: Response<CurrentSignatureRequest>) => {
      res.status(200).json(state.currentSignatureRequest);
    }
  );

  app.post("/settings", (req: Request<any, any, Settings>, res: Response) => {
    settings.SSID = req.body.SSID;
    settings.password = req.body.password;
    res.status(200).send("Ok");
  });

  app.get("/settings", (req: Request, res: Response<Settings>) => {
    res.status(200).json(settings);
  });

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
