import { jsonStringify } from "@aztec/foundation/json-rpc";
import { type Aliased } from "@aztec/aztec.js/wallet";
import { type AztecAddress } from "@aztec/aztec.js/addresses";

// Base authorization item - represents a single authorization request
export type AuthorizationItem = {
  id: string;
  appId: string;
  method: string;
  params: any;
  timestamp: number;
  persistence?: {
    storageKey: string;
    persistData: any;
  };
};

// Authorization data types for different methods
export type GetAccountsAuthData = {
  accounts: Aliased<AztecAddress>[];
};

export type GetAddressBookAuthData = {
  contacts: Aliased<AztecAddress>[];
};

export type RegisterContractAuthData = {
  persistent?: boolean;
  address?: string;
};

export type RegisterSenderAuthData = {
  persistent?: boolean;
  address: string;
  alias: string;
};

export type SendTxAuthData = {
  persistent?: boolean;
};

export type SimulateAuthData = {
  persistent?: boolean;
  payloadHash?: string;
  // For display in authorization dialog
  callAuthorizations?: any[];
  executionTrace?: any;
  // To distinguish between tx and utility simulations
  isUtility?: boolean;
};

// Deprecated: use SimulateAuthData instead
export type SimulateTxAuthData = SimulateAuthData;

// Union of all possible authorization data types
export type AuthorizationData =
  | GetAccountsAuthData
  | GetAddressBookAuthData
  | RegisterContractAuthData
  | RegisterSenderAuthData
  | SendTxAuthData
  | SimulateAuthData
  | undefined;

// Persistence configuration for authorization requests
export type AuthorizationPersistence =
  | { persist: false }
  | {
      persist: true;
      storageKey?: string; // Custom key (default: method)
      persistData?: any; // Data to store (default: response.data)
    };

// Item response for a single authorization
export type AuthorizationItemResponse = {
  id: string;
  approved: boolean;
  appId: string;
  // Optional data returned from authorization (e.g., selected accounts, metadata)
  data?: AuthorizationData;
};

// All authorization requests are treated as batches internally
// Single requests are just batches with one item
export type AuthorizationRequest = {
  id: string;
  appId: string;
  items: AuthorizationItem[];
  timestamp: number;
};

export type AuthorizationResponse = {
  id: string;
  approved: boolean;
  appId: string;
  itemResponses: Record<string, AuthorizationItemResponse>;
};

// Legacy type aliases for backwards compatibility during transition
export type BatchAuthorizationRequest = AuthorizationRequest;
export type BatchAuthorizationResponse = AuthorizationResponse;

export class AuthorizationRequestEvent extends CustomEvent<string> {
  constructor(content: AuthorizationRequest) {
    super("authorization-request", { detail: jsonStringify(content) });
  }
}
