import type { PXE } from "@aztec/pxe/server";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { ContractArtifact } from "@aztec/stdlib/abi";
import type { WalletDB } from "../database/wallet-db";
import type {
  ContractInstanceWithAddress,
  ContractInstantiationData,
} from "@aztec/stdlib/contract";
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { type ContractInstanceAndArtifact } from "@aztec/aztec.js/wallet";

interface ContractMetadata {
  contractInstance?: {
    currentContractClassId: any;
  };
}

/**
 * Cache for contract metadata, artifacts, and address aliases to reduce expensive PXE queries.
 * Shared across CallAuthorizationFormatter and TxCallStackDecoder.
 */
export class DecodingCache {
  private instanceCache = new Map<string, ContractMetadata>();
  private artifactCache = new Map<string, ContractArtifact>();
  private addressAliasCache = new Map<string, string>();

  constructor(
    private pxe: PXE,
    private db: WalletDB
  ) {}

  /**
   * Get contract metadata (instance) for an address, with caching.
   */
  async getContractMetadata(address: AztecAddress): Promise<ContractMetadata> {
    const key = address.toString();

    if (this.instanceCache.has(key)) {
      return this.instanceCache.get(key)!;
    }

    const metadata = await this.pxe.getContractMetadata(address);
    this.instanceCache.set(key, metadata);
    return metadata;
  }

  /**
   * Get contract artifact for a contract class ID, with caching.
   */
  async getContractArtifact(contractClassId: any): Promise<ContractArtifact> {
    const key = contractClassId.toString();

    if (this.artifactCache.has(key)) {
      return this.artifactCache.get(key)!;
    }

    const { artifact } = await this.pxe.getContractClassMetadata(
      contractClassId,
      true
    );
    this.artifactCache.set(key, artifact);
    return artifact;
  }

  /**
   * Get address alias with caching.
   * Checks accounts, senders, and contract metadata in order.
   */
  async getAddressAlias(address: AztecAddress): Promise<string> {
    const key = address.toString();

    if (this.addressAliasCache.has(key)) {
      return this.addressAliasCache.get(key)!;
    }

    // Check if it's an account
    const accounts = await this.db.listAccounts();
    const account = accounts.find((acc) => acc.item.equals(address));
    if (account) {
      this.addressAliasCache.set(key, account.alias);
      return account.alias;
    }

    // Check if it's a registered sender (contact)
    const senders = await this.db.listSenders();
    const sender = senders.find((s) => s.item.equals(address));
    if (sender) {
      const alias = sender.alias.replace("senders:", "");
      this.addressAliasCache.set(key, alias);
      return alias;
    }

    // Try to get contract metadata for more info
    try {
      const metadata = await this.getContractMetadata(address);
      const artifact = await this.getContractArtifact(
        metadata.contractInstance!.currentContractClassId
      );
      if (artifact) {
        this.addressAliasCache.set(key, artifact.name);
        return artifact.name;
      }
    } catch {
      // Ignore errors, use shortened address
    }

    // Return shortened address if no alias found
    const shortAddress = `${address.toString().slice(0, 10)}...${address.toString().slice(-8)}`;
    this.addressAliasCache.set(key, shortAddress);
    return shortAddress;
  }

  /**
   * Resolve contract address from various instanceData formats.
   * Handles AztecAddress, ContractInstanceWithAddress, ContractInstantiationData, etc.
   */
  async resolveContractAddress(
    instanceData:
      | AztecAddress
      | ContractInstanceWithAddress
      | ContractInstantiationData
      | ContractInstanceAndArtifact,
    artifact?: ContractArtifact
  ): Promise<AztecAddress> {
    if (instanceData instanceof AztecAddress) {
      return instanceData;
    } else if ("address" in instanceData) {
      return instanceData.address;
    } else if ("instance" in instanceData) {
      return instanceData.instance.address;
    } else {
      // ContractInstantiationData - compute the address
      const instance = await getContractInstanceFromInstantiationParams(
        artifact!,
        instanceData
      );
      return instance.address;
    }
  }

  /**
   * Resolve contract name from various sources.
   * Uses caching internally via getAddressAlias and getContractArtifact.
   */
  async resolveContractName(
    instanceData:
      | AztecAddress
      | ContractInstanceWithAddress
      | ContractInstantiationData
      | ContractInstanceAndArtifact,
    artifact: ContractArtifact | undefined,
    address: AztecAddress
  ): Promise<string> {
    // Try to get name from artifact parameter
    let contractName = artifact?.name;

    // Check if instanceData contains an artifact
    if (
      !contractName &&
      typeof instanceData === "object" &&
      "artifact" in instanceData
    ) {
      contractName = (instanceData as any).artifact?.name;
    }

    // If we still don't have a name, try to fetch using cached methods
    if (!contractName) {
      try {
        const alias = await this.getAddressAlias(address);
        // getAddressAlias returns shortened address if no name found
        // Only use it if it's not a shortened address
        if (!alias.includes("...")) {
          contractName = alias;
        }
      } catch (error) {
        // Ignore errors - we'll fall back to "Unknown Contract"
      }
    }

    return contractName || "Unknown Contract";
  }
}
