#!/bin/bash
set -e

AZTEC_VERSION=${AZTEC_VERSION:-"0.85.0-alpha-testnet.5"}

# Root 
yarn install

# Integration package

cd integration
yarn build

PUBLISH=${PUBLISH:-0}

if [[ $PUBLISH == 1 ]]; then
    VERSION=$(jq -r .version package.json)
    yarn publish --new-version $VERSION --access public --non-interactive
fi

# Captive portal

cd ../app/frontend
yarn build

# ESP32 firmware

PATH=$PATH:$HOME/.platformio/penv/bin
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
mv ../firmware/merged.bin ./public/merged.bin
yarn build