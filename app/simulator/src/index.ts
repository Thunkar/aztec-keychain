import { pino } from "pino";

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { initSerial } from "./modes/serial.ts";
import { initServer } from "./modes/web.ts";

const argv = await yargs(hideBin(process.argv))
  .options({
    port: { type: "string", default: "/dev/cu.usbmodem1101" },
    mode: { type: "string", default: "web" },
  })
  .parse();

const simMode: "web" | "serial" = argv.mode === "web" ? "web" : "serial";

async function main() {
  const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    transport: {
      target: "pino-pretty",
    },
  });

  if (simMode === "serial") {
    initSerial(argv.port, logger);
  } else {
    await initServer(logger);
  }
}

main();
