import { gzip } from "pako";
import { writeFile, mkdir, readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  getContractClassFromArtifact,
  loadContractArtifact,
} from "@aztec/aztec.js";
import {} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Horrible, but required until aztec-packages is on node 22
async function loadContractArtifactWithoutTypeAssertions(contractName: string) {
  const contractPath = join(
    __dirname,
    "../../node_modules/@aztec/noir-contracts.js/artifacts",
    contractName
  );
  const file = await readFile(contractPath);
  const artifact = JSON.parse(file.toString());
  return loadContractArtifact(artifact);
}

async function main() {
  const outputFolder = join(__dirname, "..", "/artifacts");
  await mkdir(outputFolder, { recursive: true });

  const contracts = [
    {
      name: "EcdsaRAccount",
      artifact: await loadContractArtifactWithoutTypeAssertions(
        "ecdsa_r_account_contract-EcdsaRAccount.json"
      ),
    },
  ];

  for (const contract of contracts) {
    const compressed = await gzip(JSON.stringify(contract.artifact));
    await writeFile(join(outputFolder, `${contract.name}.json.gz`), compressed);
    const contractClassId = (
      await getContractClassFromArtifact(contract.artifact)
    ).id;
    await writeFile(
      join(outputFolder, `${contract.name}.classId`),
      contractClassId.toBuffer()
    );
  }
}

main();
