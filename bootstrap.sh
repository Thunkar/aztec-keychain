#!/bin/bash

AZTEC_VERSION=${AZTEC_VERSION:-"0.85.0-alpha-testnet.5"}

# Integration package

cd integration
yarn install
yarn build

DEPLOY=${DEPLOY:-0}

if [[ $DEPLOY == 1 ]]; then
    yarn deploy
fi

# Captive portal

cd ../app/frontend
yarn install
yarn build

# ESP32 firmware

cd ../../firmware
mkdir -p data
cp ../app/frontend/dist/index.html ./data/index.html
docker run --name keychain-copy aztecprotocol/aztec:$AZTEC_VERSION 
docker cp keychain-copy:/usr/src/yarn-project/noir-contracts.js/artifacts/ecdsa_r_account_contract-EcdsaRAccount.json ./data/EcdsaRAccount.json
docker rm -f keychain-copy
cd data
tar -czvf ./EcdsaRAccount.json.gz ./EcdsaRAccount.json
rm ./EcdsaRAccount.json
