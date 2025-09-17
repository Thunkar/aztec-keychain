import {
  getContractInstanceFromInstantiationParams,
  SponsoredFeePaymentMethod,
  AztecAddress,
  Fr,
  type Wallet,
} from "@aztec/aztec.js";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";

export async function prepareForFeePayment(
  wallet: Wallet,
  sponsoredFPCAddress?: AztecAddress,
  sponsoredFPCVersion?: string
): Promise<SponsoredFeePaymentMethod> {
  try {
    const instance = await getContractInstanceFromInstantiationParams(
      SponsoredFPCContract.artifact,
      {
        salt: new Fr(SPONSORED_FPC_SALT),
      }
    );

    if (sponsoredFPCAddress && !sponsoredFPCAddress.equals(instance.address)) {
      throw new Error(
        `SponsoredFPC at version ${sponsoredFPCVersion} does not match the expected address. Computed ${instance.address} but received ${sponsoredFPCAddress}`
      );
    }

    await wallet.registerContract(instance, SponsoredFPCContract.artifact);
    return new SponsoredFeePaymentMethod(instance.address);
  } catch (error) {
    console.error("Error preparing SponsoredFeePaymentMethod:", error);
    throw error;
  }
}
