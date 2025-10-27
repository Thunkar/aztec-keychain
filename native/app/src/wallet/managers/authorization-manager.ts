import type {
  AuthorizationRequest,
  AuthorizationResponse,
  AuthorizationItem,
  AuthorizationData,
  AuthorizationPersistence,
} from "../types/authorization";
import { AuthorizationRequestEvent } from "../types/authorization";
import {
  promiseWithResolvers,
  type PromiseWithResolvers,
} from "@aztec/foundation/promise";
import type { WalletDB } from "../database/wallet-db";

/**
 * Manages authorization requests from operations.
 *
 * This manager encapsulates the logic for creating authorization requests,
 * dispatching events, and waiting for user responses, providing a clean
 * interface for operations to request user permission.
 *
 * Supports persistent authorization for operations that need to cache user permissions.
 */
export class AuthorizationManager {
  constructor(
    private appId: string,
    private db: WalletDB,
    private pendingAuthorizations: Map<
      string,
      {
        promise: PromiseWithResolvers<AuthorizationResponse>;
        request: AuthorizationRequest;
      }
    >,
    private eventEmitter: EventTarget
  ) {}

  /**
   * Unified authorization method with flexible persistence options.
   *
   * @param method - The method being authorized
   * @param params - Parameters to display in authorization UI
   * @param persistence - Persistence configuration
   * @returns Authorization data from user response or stored data
   */
  async requestAuthorization(
    method: string,
    params: any,
    persistence: AuthorizationPersistence = { persist: false }
  ): Promise<AuthorizationData> {
    // Determine the storage key (use custom or default to method)
    const storageKey =
      persistence.persist && persistence.storageKey
        ? persistence.storageKey
        : method;

    // Check for existing persistent authorization
    if (persistence.persist) {
      const existingAuth = await this.db.retrievePersistentAuthorization(
        this.appId,
        storageKey
      );
      if (existingAuth) {
        return existingAuth;
      }
    }

    // Create a single item batch request
    const itemId = crypto.randomUUID();
    const authRequest: AuthorizationRequest = {
      id: crypto.randomUUID(),
      appId: this.appId,
      items: [
        {
          id: itemId,
          appId: this.appId,
          method,
          params,
          timestamp: Date.now(),
        },
      ],
      timestamp: Date.now(),
    };

    const responseHandle = promiseWithResolvers<AuthorizationResponse>();
    this.pendingAuthorizations.set(authRequest.id, {
      promise: responseHandle,
      request: authRequest,
    });

    const event = new AuthorizationRequestEvent(authRequest);
    this.eventEmitter.dispatchEvent(event);

    const response = await responseHandle.promise;

    if (!response.approved) {
      throw new Error(`User denied ${method} request`);
    }

    // Extract the single item response
    const itemResponse = response.itemResponses?.[itemId];

    if (!itemResponse || !itemResponse.approved) {
      throw new Error(`User denied ${method} request`);
    }

    // Store persistent authorization if configured
    if (persistence.persist) {
      const dataToStore = persistence.persistData ?? itemResponse.data;
      if (dataToStore) {
        await this.db.storePersistentAuthorization(
          this.appId,
          storageKey,
          dataToStore
        );
      }
    }

    return itemResponse.data;
  }
}
