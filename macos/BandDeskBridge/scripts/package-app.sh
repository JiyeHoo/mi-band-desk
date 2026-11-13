#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
workspace_dir=$(CDPATH= cd -- "$project_dir/../.." && pwd)
artifact_root="$workspace_dir/.artifacts/macos"
app_dir="$artifact_root/Band Desk Bridge.app"

rm -rf "$app_dir"
mkdir -p "$app_dir/Contents/MacOS" "$app_dir/Contents/Resources"
clang -fobjc-arc -fblocks -O2 -mmacosx-version-min=13.0 \
  -framework Cocoa -framework QuartzCore \
  "$project_dir/Native/main.m" \
  -o "$app_dir/Contents/MacOS/BandDeskBridge"
cp "$project_dir/Resources/Info.plist" "$app_dir/Contents/Info.plist"
chmod 755 "$app_dir/Contents/MacOS/BandDeskBridge"
codesign --force --deep --sign - "$app_dir"
python3 "$project_dir/scripts/package_zip.py" "$app_dir" "$artifact_root/Band Desk Bridge 0.8.2.zip"
printf '%s\n' "$app_dir"
