#!/bin/bash
set -e

echo "WARNING: This will erase *all* untracked files, including hooks and submodules."
echo -n "Continue? [y/n] "
read user_input
if [[ ! "$user_input" =~ ^[yY](es)?$ ]]; then
    echo "Exiting without cleaning"
    exit 1
fi


# Remove all untracked files, directories, nested repos, and .gitignore files.
git clean -ffdx

docker build . -t aztec-keychain-builder
docker run --rm -v $(pwd):/usr/src aztec-keychain-builder ./build.sh