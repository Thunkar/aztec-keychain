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
mkdir -p tmp
cd tmp
npm init -y
npm install @aztec/noir-contracts.js@$AZTEC_VERSION
cp node_modules/@aztec/noir-contracts.js/artifacts/ecdsa_r_account_contract-EcdsaRAccount.json ../data/EcdsaRAccount.json
cd ../data
rm -rf ../tmp
tar -czvf ./EcdsaRAccount.json.gz ./EcdsaRAccount.json
rm ./EcdsaRAccount.json
cd ../

platformio run --target buildfs --environment esp32-c3-devkitm-1

MERGED_BIN_PATH=merged.bin pio run -t mergebin

# Landing page

cd ../landing
mv ../firmware/merged.bin ./assets/merged.bin
yarn install
yarn build