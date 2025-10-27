import { decodeFromAbi } from "@aztec/aztec.js/abi";
import { type Aliased } from "@aztec/aztec.js/wallet";
import { CallAuthorizationRequest } from "@aztec/aztec.js/authorization";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import {
  FunctionCall,
  getFunctionArtifact,
  type AbiDecoded,
} from "@aztec/stdlib/abi";
import type { OffchainEffect } from "@aztec/stdlib/tx";
import type { DecodingCache } from "./decoding-cache";

export interface ReadableCallAuthorization {
  contract: {
    name: string;
    address: string;
  };
  function: string;
  caller: {
    alias: string;
    address: string;
  };
  parameters: Array<{
    name: string;
    value: string;
  }>;
  rawData: {
    caller: AztecAddress;
    innerHash: any;
    functionCall: FunctionCall;
    parameters: Array<{
      name: string;
      value: AbiDecoded;
    }>;
  };
}

export class CallAuthorizationFormatter {
  constructor(private cache: DecodingCache) {}

  private formatAbiValue(value: AbiDecoded): string {
    if (value === null || value === undefined) {
      return "null";
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (typeof value === "object" && "toString" in value) {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return `[${value.map((v) => this.formatAbiValue(v)).join(", ")}]`;
    }

    if (typeof value === "object") {
      return JSON.stringify(value, (_, v) =>
        typeof v === "bigint" ? v.toString() : v
      );
    }

    return String(value);
  }

  async parseCallAuthorizationFromEffect(effect: OffchainEffect) {
    let callAuthorizationRequest: CallAuthorizationRequest | undefined;
    try {
      callAuthorizationRequest = await CallAuthorizationRequest.fromFields(
        effect.data
      );
      const instance = await this.cache.getContractMetadata(
        effect.contractAddress
      );
      const artifact = await this.cache.getContractArtifact(
        instance.contractInstance!.currentContractClassId
      );
      const functionAbi = await getFunctionArtifact(
        artifact,
        callAuthorizationRequest.functionSelector
      );
      const callData = decodeFromAbi(
        functionAbi.parameters.map((param) => param.type),
        callAuthorizationRequest.args
      ) as AbiDecoded[];
      const parameters = functionAbi.parameters.map((param, i) => ({
        name: param.name,
        value: callData[i],
      }));
      return {
        caller: callAuthorizationRequest.msgSender,
        innerHash: callAuthorizationRequest.innerHash,
        parameters,
        functionCall: new FunctionCall(
          functionAbi.name,
          effect.contractAddress,
          callAuthorizationRequest.functionSelector,
          functionAbi.functionType,
          functionAbi.isStatic,
          false,
          callAuthorizationRequest.args,
          functionAbi.returnTypes
        ),
      };
    } catch (error) {
      return undefined;
    }
  }

  async formatCallAuthorizationForDisplay(auth: {
    caller: AztecAddress;
    innerHash: any;
    parameters: Array<{
      name: string;
      value: AbiDecoded;
    }>;
    functionCall: FunctionCall;
  }): Promise<ReadableCallAuthorization> {
    const contractAddress = auth.functionCall.to;
    const functionName = auth.functionCall.name;

    // Get contract alias/name
    const contractName = await this.cache.getAddressAlias(contractAddress);

    // Get caller alias
    const callerAlias = await this.cache.getAddressAlias(auth.caller);

    // Format parameters
    const parameters = await Promise.all(
      auth.parameters.map(async (param) => {
        let formattedValue = this.formatAbiValue(param.value);

        // If the value looks like an address, try to get its alias
        if (
          param.value &&
          typeof param.value === "object" &&
          "toString" in param.value
        ) {
          const valueStr = param.value.toString();
          if (valueStr.startsWith("0x") && valueStr.length === 66) {
            try {
              const addr = AztecAddress.fromString(valueStr);
              const alias = await this.cache.getAddressAlias(addr);
              formattedValue = `${alias} (${formattedValue.slice(0, 10)}...${formattedValue.slice(-8)})`;
            } catch {
              // Not a valid address, use original formatted value
            }
          }
        }

        return {
          name: param.name || "arg",
          value: formattedValue,
        };
      })
    );

    return {
      contract: {
        name: contractName,
        address: contractAddress.toString(),
      },
      function: functionName,
      caller: {
        alias: callerAlias,
        address: auth.caller.toString(),
      },
      parameters,
      rawData: auth,
    };
  }

  async formatCallAuthorizationsForDisplay(
    callAuthorizations: Array<
      | {
          caller: AztecAddress;
          innerHash: any;
          parameters: Array<{
            name: string;
            value: AbiDecoded;
          }>;
          functionCall: FunctionCall;
        }
      | undefined
    >
  ): Promise<ReadableCallAuthorization[]> {
    const formattedCalls = await Promise.all(
      callAuthorizations
        .filter(Boolean)
        .map((auth) => this.formatCallAuthorizationForDisplay(auth!))
    );

    return formattedCalls;
  }
}
