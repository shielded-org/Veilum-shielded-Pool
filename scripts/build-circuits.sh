#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCUITS_DIR="$ROOT_DIR/packages/circuits"
export PATH="$HOME/.nargo/bin:$HOME/.bb/bin:$PATH"

echo "Building shielded transfer circuit..."
pushd "$CIRCUITS_DIR" >/dev/null

nargo compile

JSON="target/shielded_transfer.json"

bb write_vk -b "$JSON" -o target \
  --scheme ultra_honk --oracle_hash keccak --output_format bytes_and_fields

echo "Circuit artifacts written to $CIRCUITS_DIR/target/"
ls -la target/vk target/shielded_transfer.json

popd >/dev/null

mkdir -p "$ROOT_DIR/apps/web/public/circuits"
cp "$CIRCUITS_DIR/target/shielded_transfer.json" "$ROOT_DIR/apps/web/public/circuits/"

if [ -f "$ROOT_DIR/packages/hash2/target/hash2.json" ]; then
  cp "$ROOT_DIR/packages/hash2/target/hash2.json" "$ROOT_DIR/apps/web/public/circuits/"
fi
if [ -f "$ROOT_DIR/packages/note-hash/target/note_hash.json" ]; then
  cp "$ROOT_DIR/packages/note-hash/target/note_hash.json" "$ROOT_DIR/apps/web/public/circuits/"
fi
cp "$ROOT_DIR/scripts/deployment.json" "$ROOT_DIR/apps/web/public/deployment.json"
mkdir -p "$ROOT_DIR/apps/web/public/config"
cp "$ROOT_DIR/packages/config/networks.json" "$ROOT_DIR/apps/web/public/config/networks.json"

echo "Done."
