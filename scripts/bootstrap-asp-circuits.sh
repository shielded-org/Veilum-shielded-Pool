#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARTIFACTS_DIR="$ROOT_DIR/services/asp/artifacts"
SDK_ARTIFACTS_DIR="$ROOT_DIR/packages/sdk/artifacts"

mkdir -p "$SDK_ARTIFACTS_DIR"

for file in hash2.json hash3.json note_hash.json; do
  src="$ARTIFACTS_DIR/$file"
  if [ ! -f "$src" ]; then
    echo "missing ASP artifact: $src" >&2
    exit 1
  fi
  cp "$src" "$SDK_ARTIFACTS_DIR/$file"
done

echo "ASP circuit artifacts copied to $SDK_ARTIFACTS_DIR"
