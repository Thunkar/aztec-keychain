import { jsonStringify } from "@aztec/foundation/json-rpc";

export type AuthorizationRequest = {
  id: string;
  appId: string;
  method: string;
  params: any;
  timestamp: number;
};

export type AuthorizationResponse = {
  id: string;
  approved: boolean;
  appId: string;
  // Optional data returned from authorization (e.g., selected accounts, metadata)
  data?: any;
};

// Batch authorization types - reuse existing AuthorizationRequest
export type BatchAuthorizationRequest = AuthorizationRequest & {
  method: "batch";
  params: {
    items: AuthorizationRequest[];
  };
};

export type BatchAuthorizationResponse = AuthorizationResponse & {
  approved: boolean;
  data: {
    itemResponses: Record<string, AuthorizationResponse>;
  };
};

export class AuthorizationRequestEvent extends CustomEvent<string> {
  constructor(content: AuthorizationRequest) {
    super("authorization-request", { detail: jsonStringify(content) });
  }
}
