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

export class AuthorizationRequestEvent extends CustomEvent<string> {
  constructor(content: AuthorizationRequest) {
    super("authorization-request", { detail: jsonStringify(content) });
  }
}
