#! /bin/bash
set -euo pipefail
mkdir -p ./artifacts

contracts=(ecdsa_r_account_contract-EcdsaRAccount)

decl=$(cat <<EOF
import { type NoirCompiledContract } from '@aztec/stdlib/noir';
const circuit: NoirCompiledContract;
export = circuit;
EOF
);

for contract in "${contracts[@]}"; do
  cp "../node_modules/@aztec/noir-contracts.js$contract.json" ./artifacts/${contract#*-}.json
  echo "$decl" > ./artifacts/${contract#*-}.d.json.ts
done
