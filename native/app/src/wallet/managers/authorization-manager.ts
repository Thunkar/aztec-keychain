import type {
  AuthorizationRequest,
  AuthorizationResponse,
  AuthorizationItem,
  AuthorizationItemResponse,
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
    public readonly appId: string,
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
   * Request authorization for one or more operations.
   * Checks for existing persistent authorizations first and only requests new ones.
   *
   * @param items - Array of authorization items (with optional persistence config)
   * @returns Authorization response with approved items
   */
  async requestAuthorization(
    items: AuthorizationItem[]
  ): Promise<AuthorizationResponse> {
    // Check for existing persistent authorizations
    const itemsNeedingAuth: AuthorizationItem[] = [];
    const autoApprovedItems: Record<string, AuthorizationItemResponse> = {};

    for (const item of items) {
      if (item.persistence) {
        const existingAuth = await this.db.retrievePersistentAuthorization(
          this.appId,
          item.persistence.storageKey
        );

        if (existingAuth) {
          // Auto-approve this item
          autoApprovedItems[item.id] = {
            id: item.id,
            approved: true,
            appId: this.appId,
            data: existingAuth,
          };
          continue;
        }
      }

      // No existing auth, needs user approval
      itemsNeedingAuth.push(item);
    }

    // If all items were auto-approved, return immediately
    if (itemsNeedingAuth.length === 0) {
      return {
        id: crypto.randomUUID(),
        approved: true,
        appId: this.appId,
        itemResponses: autoApprovedItems,
      };
    }

    // Request authorization for remaining items
    const authRequest: AuthorizationRequest = {
      id: crypto.randomUUID(),
      appId: this.appId,
      items: itemsNeedingAuth,
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
      throw new Error("User denied batch request");
    }

    // Store persistent authorizations for newly approved items
    for (const item of itemsNeedingAuth) {
      const itemResponse = response.itemResponses[item.id];

      if (itemResponse?.approved && item.persistence) {
        // Use persistData from config if provided, otherwise use response data
        const dataToStore =
          item.persistence.persistData !== null &&
          item.persistence.persistData !== undefined
            ? item.persistence.persistData
            : itemResponse.data;

        await this.db.storePersistentAuthorization(
          this.appId,
          item.persistence.storageKey,
          dataToStore
        );
      }
    }

    // Merge auto-approved items with newly approved items
    return {
      ...response,
      itemResponses: {
        ...autoApprovedItems,
        ...response.itemResponses,
      },
    };
  }

  /**
   * Resolves a pending authorization request with a user response.
   *
   * Called by the UI when the user approves/denies an authorization dialog.
   * Completes the promise that the wallet is waiting on, allowing the operation to proceed or fail.
   *
   * @param response - Authorization response from user interaction
   */
  resolveAuthorization(response: AuthorizationResponse) {
    const pending = this.pendingAuthorizations.get(response.id);
    if (pending) {
      pending.promise.resolve(response);
      this.pendingAuthorizations.delete(response.id);
    }
  }
}
