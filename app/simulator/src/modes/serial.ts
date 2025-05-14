import type { Logger } from "pino";

import { SerialPort } from "serialport";
import { inflate } from "pako";
import { MESSAGE_TO_SIGN } from "../state.ts";

export enum CommandType {
  SIGNATURE_REQUEST,
  SIGNATURE_ACCEPTED_RESPONSE,
  SIGNATURE_REJECTED_RESPONSE,
  GET_ACCOUNT_REQUEST,
  GET_ACCOUNT_RESPONSE,
  GET_ACCOUNT_REJECTED,
  GET_ARTIFACT_REQUEST,
  GET_ARTIFACT_RESPONSE_START,
  GET_SENDER_REQUEST,
  GET_SENDER_RESPONSE,
  ERROR,
}

const signRequest = {
  type: CommandType.SIGNATURE_REQUEST,
  data: {
    index: 0,
    pk: [
      69, 99, 176, 132, 253, 126, 44, 31, 46, 251, 206, 200, 141, 31, 158, 154,
      97, 98, 69, 225, 42, 40, 218, 130, 71, 119, 248, 66, 10, 7, 141, 38, 57,
      143, 99, 96, 106, 33, 149, 19, 227, 91, 159, 149, 237, 135, 76, 81, 79,
      20, 154, 92, 137, 252, 165, 188, 172, 216, 111, 229, 26, 240, 223, 211,
    ],
    msg: MESSAGE_TO_SIGN,
  },
};

const accountRequest = {
  type: CommandType.GET_ACCOUNT_REQUEST,
  data: {
    index: -1,
  },
};

const artifactRequest = {
  type: CommandType.GET_ARTIFACT_REQUEST,
};

export function initSerial(portName: string, logger: Logger) {
  const currentData: Buffer[] = [Buffer.alloc(0)];
  const port = new SerialPort({ path: portName, baudRate: 115200 });

  port.on("open", () => {
    logger.info("Serial port open");
  });

  setTimeout(() => {
    port.write(Buffer.from(JSON.stringify(accountRequest)));
    port.drain();
  }, 2000);

  let portMode: "command" | "data" = "command";
  let currentExpectedBytes = 0;
  let currentDataBytesLeft = 0;
  let currentDataTransfer = Buffer.alloc(0);

  port.on("data", async (data: Buffer) => {
    logger.debug("Received data: %s", data.toString("utf-8"));
    let endPosition = data.indexOf(Buffer.from("\n", "utf-8"));
    while (endPosition !== -1) {
      const toAppend = data.subarray(0, endPosition + 1);
      logger.debug("To append: %o", toAppend.toString("utf-8"));
      const lineIndex = currentData.length - 1;
      currentData[lineIndex] = Buffer.concat([
        currentData[lineIndex],
        Buffer.from(toAppend),
      ]);
      currentData.push(Buffer.alloc(0));
      data = data.subarray(endPosition + 1);
      endPosition = data.indexOf(Buffer.from("\n", "utf-8"));
    }

    currentData[currentData.length - 1] = Buffer.concat([
      currentData[currentData.length - 1],
      data,
    ]);

    logger.debug("Serial data buffer size: %d", currentData.length);

    const accumulatedData = currentData.splice(0, currentData.length - 1);

    while (accumulatedData.length > 0) {
      if (portMode === "command") {
        const maybeCommand = accumulatedData.shift()!;
        try {
          const command = JSON.parse(maybeCommand.toString("utf-8").trim());
          if (!command.type) {
            throw new Error("Invalid command");
          }

          logger.info("Parsed command %o", command);

          switch (parseInt(command.type)) {
            case CommandType.GET_ARTIFACT_RESPONSE_START: {
              currentDataTransfer = Buffer.alloc(0);
              currentDataBytesLeft = command.data.size;
              currentExpectedBytes = command.data.size;
              portMode = "data";
              break;
            }
          }
        } catch (err) {
          logger.info(maybeCommand.toString("utf-8").trim());
        }
      } else {
        while (currentDataBytesLeft > 0 && accumulatedData.length > 0) {
          const chunk = accumulatedData.shift()!;
          currentDataBytesLeft -= chunk.length;
          currentDataTransfer = Buffer.concat([currentDataTransfer, chunk]);
          logger.info(
            "Chunk size %d, current data transfer size: %d, remaining bytes: %d",
            chunk.length,
            currentDataTransfer.length,
            currentDataBytesLeft
          );
        }
        if (currentDataBytesLeft <= 0) {
          portMode = "command";
          currentDataTransfer = currentDataTransfer.subarray(
            0,
            currentExpectedBytes
          );
          const uncompressed = await inflate(currentDataTransfer, {
            to: "string",
          });
          const jsonStart = uncompressed.indexOf("{");
          const jsonEnd = uncompressed.lastIndexOf("}");
          logger.info(
            "Uncompressed data: %o",
            JSON.parse(uncompressed.slice(jsonStart, jsonEnd + 1))
          );
        }
      }
    }
  });
}
