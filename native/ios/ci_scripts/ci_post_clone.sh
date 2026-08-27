#!/bin/sh

# Prepare Flutter and CocoaPods after Xcode Cloud clones the repository.
set -e

FLUTTER_VERSION="3.47.0"
FLUTTER_ROOT="$CI_WORKSPACE_PATH/flutter"
APP_ROOT="$CI_PRIMARY_REPOSITORY_PATH/native"

git clone \
  --depth 1 \
  --branch "$FLUTTER_VERSION" \
  https://github.com/flutter/flutter.git \
  "$FLUTTER_ROOT"

export PATH="$FLUTTER_ROOT/bin:$PATH"

flutter config --no-analytics
flutter precache --ios

cd "$APP_ROOT"
flutter pub get

if ! command -v pod >/dev/null 2>&1; then
  HOMEBREW_NO_AUTO_UPDATE=1 brew install cocoapods
fi

cd ios
pod install
