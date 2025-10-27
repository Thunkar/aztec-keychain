import { ExternalOperation } from "./base-operation";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { ContractInstanceWithAddress, ContractInstantiationData } from "@aztec/stdlib/contract";
import { getContractInstanceFromInstantiationParams, computePartialAddress } from "@aztec/stdlib/contract";
import type { ContractArtifact } from "@aztec/stdlib/abi";
import type { Fr } from "@aztec/foundation/fields";
import type { ContractInstanceAndArtifact } from "@aztec/aztec.js/wallet";
import type { PXE } from "@aztec/pxe/server";
import { WalletInteraction, type WalletInteractionType } from "../types/wallet-interaction";
import type { DecodingCache } from "../decoding/decoding-cache";
import type { InteractionManager } from "../managers/interaction-manager";
import type { AuthorizationManager } from "../managers/authorization-manager";

/**
 * RegisterContract operation implementation.
 *
 * Handles contract registration with the following features:
 * - Checks if contract is already registered (early return)
 * - Resolves contract name for display
 * - Registers contract with PXE
 */
export class RegisterContractOperation extends ExternalOperation<
  [
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
    secretKey?: Fr
  ],
  ContractInstanceWithAddress,
  {
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact;
    artifact?: ContractArtifact;
    secretKey?: Fr;
  }
> {
  constructor(
    private pxe: PXE,
    private decodingCache: DecodingCache,
    private interactionManager: InteractionManager,
    private authorizationManager: AuthorizationManager
  ) {
    super();
  }

  async prepare(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
    secretKey?: Fr
  ): Promise<{
    earlyReturn?: ContractInstanceWithAddress;
    displayData?: { contractAddress: AztecAddress; contractName: string };
    executionData?: {
      instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact;
      artifact?: ContractArtifact;
      secretKey?: Fr;
    };
  }> {
    // Resolve contract address
    const contractAddress = await this.decodingCache.resolveContractAddress(instanceData, artifact);

    // Check if already registered (early return case)
    const metadata = await this.pxe.getContractMetadata(contractAddress);
    if (metadata.contractInstance) {
      return {
        earlyReturn: metadata.contractInstance,
      };
    }

    // Resolve contract name for display
    const contractName = await this.decodingCache.resolveContractName(instanceData, artifact, contractAddress);

    return {
      displayData: { contractAddress, contractName },
      executionData: { instanceData, artifact, secretKey },
    };
  }

  async authorize(
    displayData: { contractAddress: AztecAddress; contractName: string }
  ): Promise<{ interaction: WalletInteraction<WalletInteractionType> }> {
    // Create interaction
    const interaction = WalletInteraction.from({
      type: "registerContract",
      status: "REGISTERING",
      complete: false,
      title: `Register ${displayData.contractName}`,
    });

    await this.interactionManager.storeAndEmit(interaction);

    // Request authorization
    await this.authorizationManager.request("registerContract", {
      contractAddress: displayData.contractAddress,
      contractName: displayData.contractName,
    });

    return { interaction };
  }

  async execute(executionData: {
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact;
    artifact?: ContractArtifact;
    secretKey?: Fr;
  }): Promise<ContractInstanceWithAddress> {
    const { instanceData, artifact, secretKey } = executionData;

    // Type guards
    const isInstanceWithAddress = (data: any): data is ContractInstanceWithAddress =>
      data.address !== undefined;
    const isContractInstantiationData = (data: any): data is ContractInstantiationData =>
      data.salt !== undefined;
    const isContractInstanceAndArtifact = (data: any): data is ContractInstanceAndArtifact =>
      data.instance !== undefined && data.artifact !== undefined;

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
        throw new Error(`Contract artifact must be provided when registering a contract using instantiation data`);
      }
      instance = await getContractInstanceFromInstantiationParams(artifact, instanceData);
      await this.pxe.registerContract({ artifact, instance });
    } else {
      // instanceData is AztecAddress
      if (!artifact) {
        throw new Error(`Contract artifact must be provided when registering a contract from an address`);
      }
      instance = await this.pxe.getContractInstance(instanceData);
      if (!instance) {
        throw new Error(`No contract instance found for address: ${instanceData}`);
      }
      await this.pxe.registerContract({ artifact, instance });
    }

    // Register secret key if provided
    if (secretKey) {
      await this.pxe.registerAccount(secretKey, await computePartialAddress(instance));
    }

    return instance;
  }

  createBatchInteraction(displayData: { contractAddress: AztecAddress; contractName: string }): WalletInteraction<WalletInteractionType> {
    const interaction = WalletInteraction.from({
      type: "registerContract",
      status: "REGISTERING",
      complete: false,
      title: `Register ${displayData.contractName}`,
    });
    // Store immediately - batch always creates interactions
    this.interactionManager.storeAndEmit(interaction);
    return interaction;
  }

  async updateInteractionSuccess(interaction: WalletInteraction<WalletInteractionType>): Promise<void> {
    await this.interactionManager.storeAndEmit(
      interaction.update({
        status: this.getSuccessStatus(),
        complete: true,
      })
    );
  }

  async updateInteractionFailure(interaction: WalletInteraction<WalletInteractionType>, error: unknown): Promise<void> {
    await this.interactionManager.storeAndEmit(
      interaction.update({
        complete: true,
        status: this.getFailureStatus(),
        description: error instanceof Error ? error.message : String(error),
      })
    );
  }

  getSuccessStatus(): string {
    return "REGISTERED";
  }

  getFailureStatus(): string {
    return "REGISTRATION FAILED";
  }
}
