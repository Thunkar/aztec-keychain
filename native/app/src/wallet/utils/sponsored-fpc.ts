import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { Fr } from "@aztec/aztec.js/fields";
import { type Wallet } from "@aztec/aztec.js/wallet";
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
