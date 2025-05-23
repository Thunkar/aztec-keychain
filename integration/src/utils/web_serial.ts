import type { Logger } from '@aztec/aztec.js/log';
import { inflate } from 'pako';
import { parse, stringify } from 'buffer-json';

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

type Command = {
  type: CommandType;
  data: any;
};

export async function sendCommandAndParseResponse(command: Command, logger: Logger): Promise<Command> {
  if ('serial' in navigator) {
    let port;
    const existingPorts = await (navigator.serial as any).getPorts();
    if (existingPorts.length > 0) {
      port = existingPorts[0];
    } else {
      port = await (navigator.serial as any).requestPort();
    }
    await port.open({ baudRate: 115200, bufferSize: 2 ** 18 });
    const currentData = [Buffer.alloc(0)];

    const writer = port.writable.getWriter();
    const message = Buffer.from(stringify(command));
    await writer.write(message);
    writer.releaseLock();

    const reader = port.readable.getReader();
    let response;

    let portMode: 'command' | 'data' = 'command';
    let currentDataBytesLeft = 0;
    let currentDataTransfer = Buffer.alloc(0);
    let currentCommand: Command | undefined;

    while (!response) {
      const { value } = await reader.read();

      let data: Buffer = Buffer.from(value as Uint8Array);

      let endPosition = data.indexOf(Buffer.from('\n', 'utf-8'));
      while (endPosition !== -1) {
        const toAppend = data.subarray(0, endPosition + 1);
        const lineIndex = currentData.length - 1;
        currentData[lineIndex] = Buffer.concat([currentData[lineIndex], Buffer.from(toAppend)]);
        currentData.push(Buffer.alloc(0));
        data = data.subarray(endPosition + 1);
        endPosition = data.indexOf(Buffer.from('\n', 'utf-8'));
      }

      currentData[currentData.length - 1] = Buffer.concat([currentData[currentData.length - 1], data]);
      const accumulatedData = currentData.splice(0, currentData.length - 1);

      while (accumulatedData.length > 0) {
        if (portMode === 'command') {
          const maybeCommand = accumulatedData.shift()!;
          try {
            currentCommand = parse(maybeCommand.toString('utf-8').trim());
            if (!currentCommand!.type) {
              throw new Error('Invalid command');
            }

            logger.verbose(`Parsed command of type ${currentCommand!.type}`, currentCommand!);

            switch (currentCommand!.type) {
              case CommandType.GET_ARTIFACT_RESPONSE_START: {
                currentDataTransfer = Buffer.alloc(0);
                currentDataBytesLeft = currentCommand!.data.size;
                portMode = 'data';
                logger.verbose(`Starting data transfer, bytes left: ${currentDataBytesLeft}`);
                break;
              }
              default: {
                response = currentCommand;
                reader.releaseLock();
              }
            }
          } catch {
            logger.debug(maybeCommand.toString('utf-8').trim());
          }
        } else {
          while (currentDataBytesLeft > 0 && accumulatedData.length > 0) {
            const chunk = accumulatedData.shift()!;
            currentDataBytesLeft -= chunk.length;
            currentDataTransfer = Buffer.concat([currentDataTransfer, chunk]);
          }
          if (currentDataBytesLeft <= 0) {
            portMode = 'command';
            currentDataTransfer = currentDataTransfer.subarray(0, currentCommand?.data.size);
            const uncompressed = inflate(currentDataTransfer, {
              to: 'string',
            });
            const jsonStart = uncompressed.indexOf('{');
            const jsonEnd = uncompressed.lastIndexOf('}');
            currentCommand!.data = {
              ...currentCommand!.data,
              data: parse(uncompressed.slice(jsonStart, jsonEnd + 1)),
            };
            logger.verbose('Data transfer complete, enriching response');
            response = currentCommand;
            reader.releaseLock();
          }
        }
      }
    }
    await port.close();
    return response;
  } else {
    throw new Error('Web Serial API is not supported in this browser.');
  }
}
