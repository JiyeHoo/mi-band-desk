#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
workspace_dir=$(CDPATH= cd -- "$project_dir/../.." && pwd)
qa_dir="$workspace_dir/.artifacts/mac-ack-fix/native"
mkdir -p "$qa_dir"
clang -fobjc-arc -fblocks -O0 -mmacosx-version-min=13.0 -framework Cocoa -framework QuartzCore "$project_dir/NativeTests/main.m" -o "$qa_dir/native-tests"
"$qa_dir/native-tests" "$qa_dir"
