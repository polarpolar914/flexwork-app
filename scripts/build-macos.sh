#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
swift build --package-path macos -c release
BIN_DIR=$(swift build --package-path macos -c release --show-bin-path)
APP="dist/Flexwork.app"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN_DIR/FlexworkMenuBar" "$APP/Contents/MacOS/FlexworkMenuBar"
cp macos/Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
printf 'Built %s/Flexwork.app\n' "$PWD/dist"
