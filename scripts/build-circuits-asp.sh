#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCUITS_DIR="$ROOT_DIR/packages/circuits-asp"
export PATH="$HOME/.nargo/bin:$HOME/.bb/bin:$PATH"

echo "Building ASP shielded transfer circuit..."
pushd "$CIRCUITS_DIR" >/dev/null

nargo compile

JSON="target/shielded_transfer_asp.json"

bb write_vk -b "$JSON" -o target \
  --scheme ultra_honk --oracle_hash keccak --output_format bytes_and_fields

echo "ASP circuit artifacts written to $CIRCUITS_DIR/target/"
ls -la target/vk target/shielded_transfer_asp.json

cp target/shielded_transfer_asp.json "$ROOT_DIR/apps/web/public/circuits/shielded_transfer_asp.json"

popd >/dev/null

echo "Done."
