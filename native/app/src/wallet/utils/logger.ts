import { createLogger, type Logger } from "@aztec/aztec.js/log";
import type { MessagePortMain } from "electron";
import { jsonStringify } from "@aztec/foundation/json-rpc";

const logLevel = [
  "silent",
  "fatal",
  "error",
  "warn",
  "info",
  "verbose",
  "debug",
  "trace",
] as const;
type LogLevel = (typeof logLevel)[number];

export function createProxyLogger(
  prefix: string,
  logPort: MessagePortMain
): Logger {
  return new Proxy(createLogger(prefix), {
    get: (target, prop) => {
      if (logLevel.includes(prop as (typeof logLevel)[number])) {
        return function (this: Logger, ...data: Parameters<Logger[LogLevel]>) {
          const loggingFn = prop as LogLevel;
          const args = [loggingFn, prefix, ...data];
          logPort.postMessage({ type: "log", args: jsonStringify(args) });
          target[loggingFn].call(this, ...[data[0], data[1]]);
        };
      } else {
        return target[prop];
      }
    },
  });
}
