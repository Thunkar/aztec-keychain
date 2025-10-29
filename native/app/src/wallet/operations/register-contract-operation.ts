import {
  ExternalOperation,
  type PrepareResult,
  type PersistenceConfig,
} from "./base-operation";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type {
  ContractInstanceWithAddress,
  ContractInstantiationData,
} from "@aztec/stdlib/contract";
import {
  getContractInstanceFromInstantiationParams,
  computePartialAddress,
} from "@aztec/stdlib/contract";
import type { ContractArtifact } from "@aztec/stdlib/abi";
import type { Fr } from "@aztec/foundation/fields";
import type { ContractInstanceAndArtifact } from "@aztec/aztec.js/wallet";
import type { PXE } from "@aztec/pxe/server";
import {
  WalletInteraction,
  type WalletInteractionType,
} from "../types/wallet-interaction";
import type { DecodingCache } from "../decoding/decoding-cache";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";

// Type for the possible instance data inputs
type RegisterContractInstanceData =
  | AztecAddress
  | ContractInstanceWithAddress
  | ContractInstantiationData
  | ContractInstanceAndArtifact;

// Arguments tuple for the operation
type RegisterContractArgs = [
  instanceData: RegisterContractInstanceData,
  artifact?: ContractArtifact,
  secretKey?: Fr,
];

// Result type for the operation
type RegisterContractResult = ContractInstanceWithAddress;

// Execution data stored between prepare and execute phases
interface RegisterContractExecutionData {
  instanceData: RegisterContractInstanceData;
  artifact?: ContractArtifact;
  secretKey?: Fr;
}

// Display data for authorization UI
type RegisterContractDisplayData = {
  contractAddress: AztecAddress;
  contractName: string;
} & Record<string, unknown>;

/**
 * RegisterContract operation implementation.
 *
 * Handles contract registration with the following features:
 * - Checks if contract is already registered (early return)
 * - Resolves contract name for display
 * - Registers contract with PXE
 */
export class RegisterContractOperation extends ExternalOperation<
  RegisterContractArgs,
  RegisterContractResult,
  RegisterContractExecutionData,
  RegisterContractDisplayData
> {
  protected interactionManager: InteractionManager;

  constructor(
    private pxe: PXE,
    private decodingCache: DecodingCache,
    interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager
  ) {
    super();
    this.interactionManager = interactionManager;
  }

  async check(
    instanceData: RegisterContractInstanceData,
    artifact?: ContractArtifact,
    _secretKey?: Fr
  ): Promise<RegisterContractResult | undefined> {
    // Resolve contract address
    const contractAddress = await this.decodingCache.resolveContractAddress(
      instanceData,
      artifact
    );

    // Check if already registered (early return case)
    const metadata = await this.pxe.getContractMetadata(contractAddress);
    if (metadata.contractInstance) {
      return metadata.contractInstance; // Early return - no interaction created
    }

    return undefined; // Continue with normal flow
  }

  async createInteraction(
    instanceData: RegisterContractInstanceData,
    artifact?: ContractArtifact,
    _secretKey?: Fr
  ): Promise<WalletInteraction<WalletInteractionType>> {
    // Create interaction with simple title from args only
    const contractAddress = await this.decodingCache.resolveContractAddress(
      instanceData,
      artifact
    );

    const contractName = await this.decodingCache.resolveContractName(
      instanceData,
      artifact,
      contractAddress
    );

    const interaction = WalletInteraction.from({
      type: "registerContract",
      status: "PREPARING",
      complete: false,
      title: `Register ${contractName}`,
      description: `Address: ${contractAddress.toString()}`,
    });

    await this.interactionManager.storeAndEmit(interaction);

    return interaction;
  }

  async prepare(
    instanceData: RegisterContractInstanceData,
    artifact?: ContractArtifact,
    secretKey?: Fr
  ): Promise<
    PrepareResult<
      RegisterContractResult,
      RegisterContractDisplayData,
      RegisterContractExecutionData
    >
  > {
    // Resolve contract address
    const contractAddress = await this.decodingCache.resolveContractAddress(
      instanceData,
      artifact
    );

    // Resolve contract name for display
    const contractName = await this.decodingCache.resolveContractName(
      instanceData,
      artifact,
      contractAddress
    );

    return {
      displayData: { contractAddress, contractName },
      executionData: { instanceData, artifact, secretKey },
    };
  }

  async requestAuthorization(
    displayData: RegisterContractDisplayData,
    _persistence?: PersistenceConfig
  ): Promise<void> {
    // Update interaction with detailed title and status
    await this.emitProgress("REQUESTING AUTHORIZATION");

    await this.authorizationManager.requestAuthorization([
      {
        id: crypto.randomUUID(),
        appId: this.authorizationManager.appId,
        method: "registerContract",
        params: {
          contractAddress: displayData.contractAddress,
          contractName: displayData.contractName,
        },
        timestamp: Date.now(),
      },
    ]);
  }

  async execute(
    executionData: RegisterContractExecutionData
  ): Promise<RegisterContractResult> {
    const { instanceData, artifact, secretKey } = executionData;

    // Type guards
    const isInstanceWithAddress = (
      data: RegisterContractInstanceData
    ): data is ContractInstanceWithAddress =>
      typeof data === "object" &&
      data !== null &&
      "address" in data &&
      !("instance" in data);
    const isContractInstantiationData = (
      data: RegisterContractInstanceData
    ): data is ContractInstantiationData =>
      typeof data === "object" && data !== null && "salt" in data;
    const isContractInstanceAndArtifact = (
      data: RegisterContractInstanceData
    ): data is ContractInstanceAndArtifact =>
      typeof data === "object" &&
      data !== null &&
      "instance" in data &&
      "artifact" in data;

    let instance: ContractInstanceWithAddress;

    if (isContractInstanceAndArtifact(instanceData)) {
      // Already has instance and artifact
      instance = instanceData.instance;
      await this.pxe.registerContract(instanceData);
    } else if (isInstanceWithAddress(instanceData)) {
      // Has instance with address
      instance = instanceData;
      await this.pxe.registerContract({ artifact, instance });
    } else if (isContractInstantiationData(instanceData)) {
      // Need to create instance from instantiation data
      if (!artifact) {
        throw new Error(
          `Contract artifact must be provided when registering a contract using instantiation data`
        );
      }
      instance = await getContractInstanceFromInstantiationParams(
        artifact,
        instanceData
      );
      await this.pxe.registerContract({ artifact, instance });
    } else {
      // instanceData is AztecAddress
      if (!artifact) {
        throw new Error(
          `Contract artifact must be provided when registering a contract from an address`
        );
      }
      instance = await this.pxe.getContractInstance(instanceData);
      if (!instance) {
        throw new Error(
          `No contract instance found for address: ${instanceData}`
        );
      }
      await this.pxe.registerContract({ artifact, instance });
    }

    // Register secret key if provided
    if (secretKey) {
      await this.pxe.registerAccount(
        secretKey,
        await computePartialAddress(instance)
      );
    }

    await this.emitProgress("SUCCESS", undefined, true);
    return instance;
  }
}
