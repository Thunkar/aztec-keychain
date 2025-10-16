import type { PXE } from "@aztec/pxe/server";
import type { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { ContractArtifact } from "@aztec/stdlib/abi";
import type { WalletDB } from "../wallet_db";

interface ContractMetadata {
  contractInstance?: {
    currentContractClassId: any;
  };
}

/**
 * Cache for contract metadata, artifacts, and address aliases to reduce expensive PXE queries.
 * Shared across CallAuthorizationFormatter and TxCallStackDecoder.
 */
export class TxDecodingCache {
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
   * Preload contract metadata and artifacts for multiple addresses.
   * This populates both instance and artifact caches in parallel.
   */
  async preload(addresses: AztecAddress[]): Promise<void> {
    // Filter out addresses already in cache
    const uncachedAddresses = addresses.filter(
      (addr) => !this.instanceCache.has(addr.toString())
    );

    if (uncachedAddresses.length === 0) {
      return;
    }

    // Fetch all contract metadata in parallel
    const metadataPromises = uncachedAddresses.map(async (address) => {
      try {
        const metadata = await this.pxe.getContractMetadata(address);
        this.instanceCache.set(address.toString(), metadata);
        return metadata;
      } catch (error) {
        // Ignore errors for individual contracts
        return null;
      }
    });

    const metadataResults = await Promise.all(metadataPromises);

    // Extract unique contract class IDs
    const classIds = new Set<string>();
    for (const metadata of metadataResults) {
      if (metadata?.contractInstance?.currentContractClassId) {
        classIds.add(metadata.contractInstance.currentContractClassId.toString());
      }
    }

    // Filter out class IDs already in cache
    const uncachedClassIds = Array.from(classIds).filter(
      (classId) => !this.artifactCache.has(classId)
    );

    // Fetch all artifacts in parallel
    const artifactPromises = uncachedClassIds.map(async (classIdStr) => {
      try {
        // We need to reconstruct the class ID object from string
        // The actual class ID type should be used here
        const classId = classIdStr; // TODO: might need proper deserialization
        const { artifact } = await this.pxe.getContractClassMetadata(
          classId as any,
          true
        );
        this.artifactCache.set(classIdStr, artifact);
      } catch (error) {
        // Ignore errors for individual artifacts
      }
    });

    await Promise.all(artifactPromises);
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
   * Clear all cached data.
   */
  clear(): void {
    this.instanceCache.clear();
    this.artifactCache.clear();
    this.addressAliasCache.clear();
  }
}
