#!/bin/bash
set -e

AZTEC_VERSION=${AZTEC_VERSION:-"0.85.0-alpha-testnet.5"}

# Root 
yarn install

# Integration package

cd integration
yarn build

PUBLISH=${PUBLISH:-0}
PACKAGE_NAME=$(jq -r .name package.json)
LAST_PUBLISHED_VERSION=$(yarn info $PACKAGE_NAME versions --json | jq -r '.data[-1]')
VERSION=$(jq -r .version package.json)

echo "Last published version: $LAST_PUBLISHED_VERSION"
echo "Current version: $VERSION"

if [[ $PUBLISH == 1 && $LAST_PUBLISHED_VERSION != $VERSION ]]; then
    echo "Publishing $PACKAGE_NAME version $VERSION"
    yarn publish --new-version $VERSION --access public --non-interactive
fi

# Captive portal

cd ../app/frontend
yarn build

# Contracts
cd ../../contracts
yarn generate

# ESP32 firmware

PATH=$PATH:$HOME/.platformio/penv/bin
cd ../firmware
rm -rf data
mkdir -p data
cp ../app/frontend/dist/index.html ./data/index.html
cp ../contracts/artifacts/* ./data/

platformio run --target buildfs --environment esp32-c3-devkitm-1

MERGED_BIN_PATH=merged.bin pio run -t mergebin

# Landing page

cd ../landing
mv ../firmware/merged.bin ./public/merged.bin
yarn build