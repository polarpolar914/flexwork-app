#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p macos/.build
swiftc macos/Sources/FlexworkMenuBar/ServerAddress.swift \
    macos/Sources/FlexworkMenuBar/Models.swift \
    macos/Tests/FlexworkMenuBarTests/ServerAddressTests.swift \
    -o macos/.build/server-address-tests
macos/.build/server-address-tests
