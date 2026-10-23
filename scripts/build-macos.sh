#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
APP="dist/Flexwork.app"
BIN="$APP/Contents/MacOS/FlexworkMenuBar"
mkdir -p "$APP/Contents/MacOS" macos/.build

# SwiftPM이 있으면 그걸 쓰고, 없으면 swiftc로 직접 빌드한다.
# Xcode 없이 Command Line Tools만 깔린 맥에서는 Package.swift 자체를 컴파일할 때
# libPackageDescription이 없어 링크가 깨진다. 이 패키지는 외부 의존성이 0이라
# 소스를 바로 컴파일해도 같은 결과가 나온다(test-macos.sh도 같은 방식).
if swift build --package-path macos -c release 2>macos/.build/swiftpm.log; then
    cp "$(swift build --package-path macos -c release --show-bin-path)/FlexworkMenuBar" "$BIN"
else
    printf 'swift build 실패 — swiftc로 직접 빌드합니다 (로그: macos/.build/swiftpm.log)\n' >&2
    # 배포 타깃은 Package.swift의 .macOS(.v13)과 맞춘다. 아키텍처는 빌드하는 맥을 따른다.
    swiftc -O \
        -target "$(uname -m)-apple-macosx13.0" \
        -sdk "$(xcrun --show-sdk-path)" \
        -o "$BIN" \
        macos/Sources/FlexworkMenuBar/*.swift
fi

cp macos/Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
printf 'Built %s/Flexwork.app\n' "$PWD/dist"
