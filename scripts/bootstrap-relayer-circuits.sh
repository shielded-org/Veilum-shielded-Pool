#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/packages/circuits/target"
ARTIFACTS_DIR="$ROOT_DIR/services/relayer/artifacts"

mkdir -p "$TARGET_DIR"

for file in shielded_transfer.json vk; do
  src="$ARTIFACTS_DIR/$file"
  dest="$TARGET_DIR/$file"
  if [ ! -f "$src" ]; then
    echo "missing relayer artifact: $src" >&2
    exit 1
  fi
  cp "$src" "$dest"
done

echo "Relayer circuit artifacts copied to $TARGET_DIR"
