import type {
  Aliased,
  AztecAddress,
  ContractArtifact,
  ContractInstanceWithAddress,
  ContractInstanceAndArtifact,
  ContractInstantiationData,
  SendMethodOptions,
  SimulateMethodOptions,
  AuthWitness,
  ProfileMethodOptions,
  Fr,
  IntentInnerHash,
  IntentAction,
  ContractFunctionInteraction,
} from "@aztec/aztec.js";
import type { ExecutionPayload } from "@aztec/entrypoints/payload";
import { contextBridge, ipcRenderer } from "electron";
import type { GasSettings } from "@aztec/stdlib/gas";
import type {
  Tx,
  TxHash,
  TxProfileResult,
  TxProvingResult,
  TxReceipt,
  TxSimulationResult,
  UtilitySimulationResult,
} from "@aztec/stdlib/tx";
import type {
  ContractClassMetadata,
  ContractMetadata,
  EventMetadataDefinition,
} from "@aztec/stdlib/interfaces/client";

contextBridge.exposeInMainWorld("walletAPI", {
  getContractClassMetadata(
    id: Fr,
    includeArtifact?: boolean
  ): Promise<ContractClassMetadata> {
    return ipcRenderer.invoke("getContractClassMetadata", [
      id,
      includeArtifact,
    ]);
  },
  getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    return ipcRenderer.invoke("getContractMetadata", [address]);
  },
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    return ipcRenderer.invoke("getTxReceipt", [txHash]);
  },
  getPrivateEvents<T>(
    contractAddress: AztecAddress,
    eventMetadata: EventMetadataDefinition,
    from: number,
    numBlocks: number,
    recipients: AztecAddress[]
  ): Promise<T[]> {
    return ipcRenderer.invoke("getPrivateEvents", [
      contractAddress,
      eventMetadata,
      from,
      numBlocks,
      recipients,
    ]);
  },
  getPublicEvents<T>(
    eventMetadata: EventMetadataDefinition,
    from: number,
    limit: number
  ): Promise<T[]> {
    return ipcRenderer.invoke("getPublicEvents", [eventMetadata, from, limit]);
  },
  registerSender(address: AztecAddress, alias?: string): Promise<AztecAddress> {
    return ipcRenderer.invoke("registerSender", [address, alias]);
  },
  getSenders(): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getSenders");
  },
  getAccounts(): Promise<Aliased<AztecAddress>[]> {
    return ipcRenderer.invoke("getAccounts");
  },
  registerContract(
    instanceData:
      | AztecAddress
      | ContractInstanceWithAddress
      | ContractInstantiationData
      | ContractInstanceAndArtifact,
    artifact?: ContractArtifact
  ): Promise<ContractInstanceWithAddress> {
    return ipcRenderer.invoke("registerContract", [instanceData, artifact]);
  },
  estimateGas(
    exec: ExecutionPayload,
    opts: Omit<SendMethodOptions, "estimateGas">
  ): Promise<Pick<GasSettings, "gasLimits" | "teardownGasLimits">> {
    return ipcRenderer.invoke("estimateGas", [exec, opts]);
  },
  simulateTx(
    exec: ExecutionPayload,
    opts: SimulateMethodOptions
  ): Promise<TxSimulationResult> {
    return ipcRenderer.invoke("simulateTx", [exec, opts]);
  },
  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[]
  ): Promise<UtilitySimulationResult> {
    return ipcRenderer.invoke("simulateUtility", [
      functionName,
      args,
      to,
      authwits,
    ]);
  },
  profileTx(
    exec: ExecutionPayload,
    opts: ProfileMethodOptions
  ): Promise<TxProfileResult> {
    return ipcRenderer.invoke("profileTx", [exec, opts]);
  },
  proveTx(
    exec: ExecutionPayload,
    opts: SendMethodOptions
  ): Promise<TxProvingResult> {
    return ipcRenderer.invoke("proveTx", [exec, opts]);
  },
  sendTx(tx: Tx): Promise<TxHash> {
    return ipcRenderer.invoke("sendTx", [tx]);
  },
  createAuthWit(
    from: AztecAddress,
    messageHashOrIntent:
      | Fr
      | Buffer<ArrayBuffer>
      | IntentInnerHash
      | IntentAction
  ): Promise<AuthWitness> {
    return ipcRenderer.invoke("createAuthWit", [from, messageHashOrIntent]);
  },
  setPublicAuthWit(
    from: AztecAddress,
    messageHashOrIntent:
      | Fr
      | Buffer<ArrayBuffer>
      | IntentInnerHash
      | IntentAction,
    authorized: boolean
  ): Promise<ContractFunctionInteraction> {
    return ipcRenderer.invoke("setPublicAuthWit", [
      from,
      messageHashOrIntent,
      authorized,
    ]);
  },
});
